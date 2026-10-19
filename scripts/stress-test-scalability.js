/**
 * scripts/stress-test-scalability.js
 * Benchmark y Stress Test de Rendimiento y Escalabilidad para fintrack.
 *
 * Evalúa el comportamiento en memoria, CPU y almacenamiento cifrado
 * para tres escalas de datos:
 *  - N1: 1.000 transacciones (1 año de uso normal)
 *  - N2: 5.000 transacciones (4-5 años de uso intensivo)
 *  - N3: 25.000 transacciones (uso masivo / importación histórica)
 */

const { performance } = require('perf_hooks');
const assert = require('assert');

// -------------------------------------------------------------
// FUNCIONES Y MODELOS REPLICADOS DE FINTRACK (index.html)
// -------------------------------------------------------------

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function lastDayOfMonthStr(yr, mo) {
  var d = new Date(yr, mo, 0);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function getTxCalcMode(t) {
  if (!t) return 0;
  if (Array.isArray(t.tags)) {
    if (t.tags.includes('_no_calc')) return 2;
    if (t.tags.includes('_no_expense')) return 1;
  }
  if (t.exclude_from_calc === 2 || t.exclude_from_calc === '2' || t.exclude_from_calc === 'all' || t.exclude_from_calc === true) return 2;
  if (t.exclude_from_calc === 1 || t.exclude_from_calc === '1' || t.exclude_from_calc === 'expense' || t.exclude_from_calc === 'balance') return 1;
  return 0;
}

function getEffectiveTxCalcMode(t, categoryExclusions) {
  var m = getTxCalcMode(t);
  if (m !== 0) return m;
  if (t && t.category && categoryExclusions) {
    var ym = typeof t.date === 'string' ? t.date.slice(0, 7) : '2026-01';
    var val = categoryExclusions[t.category + '|' + ym];
    if (val === true || val === 2 || val === '2' || val === 'all') return 2;
    if (val === 1 || val === '1' || val === 'balance') return 1;
  }
  return 0;
}

function isTxExcludedFromExpense(t, categoryExclusions) {
  if (!t) return false;
  var m = getEffectiveTxCalcMode(t, categoryExclusions);
  return m === 1 || m === 2;
}

function isTxExcludedFromBalance(t, categoryExclusions) {
  if (!t) return false;
  var m = getEffectiveTxCalcMode(t, categoryExclusions);
  return m === 2;
}

function txExpenseImpact(t, categoryExclusions) {
  if (!t) return 0;
  if (t.is_balance_adjustment) return 0;
  if (t.type !== 'expense') return 0;
  if (isTxExcludedFromExpense(t, categoryExclusions)) return 0;
  return Number(t.amount);
}

function txBalanceExpenseImpact(t, categoryExclusions) {
  if (!t) return 0;
  if (t.is_balance_adjustment) return 0;
  if (t.type !== 'expense') return 0;
  if (isTxExcludedFromBalance(t, categoryExclusions)) return 0;
  return Number(t.amount);
}

function txIncomeImpact(t, categoryExclusions) {
  if (!t) return 0;
  if (t.is_balance_adjustment) return 0;
  if (t.type !== 'income') return 0;
  if (isTxExcludedFromExpense(t, categoryExclusions)) return 0;
  return Number(t.amount);
}

function accountTouchesAccount(t, accountId, totalAccounts) {
  return !t.is_balance_adjustment && (
    t.account_id === accountId ||
    t.to_account_id === accountId ||
    (!t.account_id && t.type !== 'transfer' && totalAccounts === 1)
  );
}

function accountTxDelta(t, accountId, totalAccounts) {
  if (t.is_balance_adjustment) return 0;
  if (t.type === 'transfer') {
    var d = 0;
    if (t.account_id === accountId) d -= Number(t.amount);
    if (t.to_account_id === accountId) d += Number(t.amount);
    return d;
  }
  if (!(t.account_id === accountId || (!t.account_id && totalAccounts === 1))) return 0;
  return t.type === 'expense' ? -Number(t.amount) : Number(t.amount);
}

function cacheBytesToB64(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

function cacheB64ToBytes(value) {
  var bin = atob(value);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// -------------------------------------------------------------
// GENERADOR DE DATOS SINTETICOS REALISTAS
// -------------------------------------------------------------

function generateDataset(targetTxCount, yearsSpan = 5) {
  const uid = 'user_stress_test_uid_001';
  const accounts = [
    { id: 'acc_checking', name: 'Cuenta Corriente', color: '#007AFF', position: 0, is_investment: false, user_id: uid },
    { id: 'acc_savings', name: 'Cuenta Ahorro', color: '#34C759', position: 1, is_investment: false, user_id: uid },
    { id: 'acc_revolut', name: 'Revolut Diaria', color: '#5856D6', position: 2, is_investment: false, user_id: uid },
    { id: 'acc_invest', name: 'Inversión Cartera', color: '#FF9500', position: 3, is_investment: true, user_id: uid }
  ];

  const catNames = [
    'Supermercado', 'Restaurantes', 'Vivienda', 'Suministros', 'Transporte',
    'Ocio y Cultura', 'Salud y Farmacia', 'Ropa', 'Educación', 'Viajes',
    'Tecnología', 'Regalos', 'Nómina', 'Rendimientos', 'Otros Ingresos'
  ];

  const categories = catNames.map((name, idx) => ({
    id: 'cat_' + idx,
    name: name.toLowerCase(),
    color: '#10B981',
    subcats: ['general', 'extra', 'fijo'],
    position: idx,
    archived: false,
    kind: idx >= 12 ? 'income' : 'expense',
    icon: 'tag',
    user_id: uid
  }));

  const categoryExclusions = {
    'cat_0|2026-03': 1,
    'cat_2|2026-04': 2
  };

  const endYear = 2026;
  const startYear = endYear - yearsSpan + 1;
  const totalMonths = yearsSpan * 12;

  // Generar transacciones
  const transactions = [];
  const startMs = new Date(startYear, 0, 1).getTime();
  const endMs = new Date(endYear, 11, 31).getTime();
  const spanMs = endMs - startMs;

  for (let i = 0; i < targetTxCount; i++) {
    const time = startMs + Math.floor((i / targetTxCount) * spanMs);
    const d = new Date(time);
    const dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    const isTransfer = i % 15 === 0;
    const isIncome = !isTransfer && (i % 8 === 0);
    const isAdjustment = i % 250 === 0;

    let type = 'expense';
    let account_id = accounts[i % 3].id;
    let to_account_id = null;
    let category = 'cat_' + (i % 12);
    let amount = Math.round((5 + (i % 150) * 1.75) * 100) / 100;

    if (isTransfer) {
      type = 'transfer';
      to_account_id = accounts[(i + 1) % 3].id;
      category = 'investment';
    } else if (isIncome) {
      type = 'income';
      category = 'cat_' + (12 + (i % 3));
      amount = Math.round((1200 + (i % 500)) * 100) / 100;
    }

    const tags = [];
    if (i % 30 === 0) tags.push('_no_calc');
    if (i % 45 === 0) tags.push('_no_expense');
    if (i % 10 === 0) tags.push('habitual');

    transactions.push({
      id: 'tx_' + i + '_' + Math.random().toString(36).slice(2, 7),
      type: type,
      amount: amount,
      category: category,
      subcategory: 'general',
      note: 'Concepto movimiento ' + i + ' supermercado o nomina ref #' + i,
      date: dateStr,
      recurring: i % 25 === 0,
      recur_interval: 'monthly',
      recur_series_id: (i % 25 === 0) ? 'rec_series_' + (i % 10) : null,
      tags: tags,
      account_id: account_id,
      to_account_id: to_account_id,
      is_balance_adjustment: isAdjustment,
      user_id: uid
    });
  }

  // Generar patrimony (snapshots de saldo real mensuales o trimestrales)
  const patrimony = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === endYear && m > 10) break;
      for (let a = 0; a < 3; a++) {
        patrimony.push({
          id: 'p_' + accounts[a].id + '_' + y + '_' + m,
          account_id: accounts[a].id,
          year: y,
          month: m,
          amount: 2500 + y * 10 + m * 50,
          theoretical_amount: 2480 + y * 10 + m * 50,
          reset_date: lastDayOfMonthStr(y, m),
          user_id: uid
        });
      }
    }
  }

  // Presupuestos
  const budgets = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      for (let c = 0; c < 8; c++) {
        budgets.push({
          id: 'b_' + y + '_' + m + '_' + c,
          category_id: 'cat_' + c,
          amount: 250 + c * 25,
          is_total: false,
          month_year: y + '-' + pad(m),
          note: 'Presupuesto base ' + y,
          user_id: uid
        });
      }
    }
  }

  const recurrenceExclusions = Array.from({ length: Math.min(200, Math.floor(targetTxCount / 50)) }, (_, idx) => ({
    id: 'excl_' + idx,
    recur_series_id: 'rec_series_' + (idx % 10),
    skipped_date: '2025-' + pad((idx % 12) + 1) + '-15',
    user_id: uid
  }));

  const transactionVoids = Array.from({ length: Math.min(150, Math.floor(targetTxCount / 80)) }, (_, idx) => ({
    id: 'tv_' + idx,
    transaction_id: 'tx_voided_' + idx,
    user_id: uid,
    voided_at: new Date().toISOString()
  }));

  const investmentOperations = Array.from({ length: Math.min(300, Math.floor(targetTxCount / 30)) }, (_, idx) => ({
    id: 'invop_' + idx,
    side: idx % 2 === 0 ? 'buy' : 'sell',
    symbol: ['VWCE', 'IWDA', 'MSFT', 'AAPL'][idx % 4],
    product_name: 'Fondo o Accion ' + (idx % 4),
    units: 2 + idx * 0.1,
    unit_price: 100 + (idx % 20),
    amount: (2 + idx * 0.1) * (100 + (idx % 20)),
    operation_date: '2025-' + pad((idx % 12) + 1) + '-10',
    cash_account_id: 'acc_checking',
    investment_account_id: 'acc_invest',
    transaction_id: 'tx_inv_link_' + idx,
    user_id: uid
  }));

  return {
    transactions,
    accounts,
    categories,
    categoryExclusions,
    patrimony,
    budgets,
    recurrenceExclusions,
    transactionVoids,
    investmentOperations
  };
}

// -------------------------------------------------------------
// BENCHMARK SUITE
// -------------------------------------------------------------

async function runBenchmark(datasetLabel, data) {
  console.log(`\n================================================================`);
  console.log(` BENCHMARK: ${datasetLabel} (${data.transactions.length.toLocaleString('es-ES')} transacciones)`);
  console.log(`================================================================`);

  const memBefore = process.memoryUsage();

  // 1. Indexación en memoria (ensureTxIndices)
  let _txByAccount = {};
  let _txByMonthStr = {};
  let _txByYearStr = {};

  const t0_index = performance.now();
  for (let i = 0; i < data.transactions.length; i++) {
    const t = data.transactions[i];
    const d = t.date;
    if (d && typeof d === 'string') {
      const ym = d.slice(0, 7);
      const y = d.slice(0, 4);
      if (!_txByMonthStr[ym]) _txByMonthStr[ym] = [];
      _txByMonthStr[ym].push(t);
      if (!_txByYearStr[y]) _txByYearStr[y] = [];
      _txByYearStr[y].push(t);
    }
    if (!t.is_balance_adjustment) {
      const a1 = t.account_id;
      const a2 = t.to_account_id;
      if (a1) {
        if (!_txByAccount[a1]) _txByAccount[a1] = [];
        _txByAccount[a1].push(t);
      }
      if (a2 && a2 !== a1) {
        if (!_txByAccount[a2]) _txByAccount[a2] = [];
        _txByAccount[a2].push(t);
      }
    }
  }
  const t_index_ms = performance.now() - t0_index;

  // 2. Filtrado y Consultas habituales
  // 2.1 Consulta del mes actual vía índice
  const t0_mquery = performance.now();
  const monthTxs = _txByMonthStr['2026-05'] || [];
  const t_mquery_ms = performance.now() - t0_mquery;

  // 2.2 Consulta del año completo vía índice
  const t0_yquery = performance.now();
  const yearTxs = _txByYearStr['2026'] || [];
  const t_yquery_ms = performance.now() - t0_yquery;

  // 2.3 Filtrado por rango de fechas (sin índice: O(N) lineal sobre todo el historial)
  const t0_range = performance.now();
  const fromDate = '2024-06-01', toDate = '2025-06-01';
  const rangeTxs = data.transactions.filter(t => t.date >= fromDate && t.date <= toDate);
  const t_range_ms = performance.now() - t0_range;

  // 2.4 Búsqueda de texto libre global (searchScope = 'all')
  const t0_search = performance.now();
  const query = 'supermercado';
  const searchResults = data.transactions.filter(t => {
    if (t.note && t.note.toLowerCase().includes(query)) return true;
    if (t.subcategory && t.subcategory.toLowerCase().includes(query)) return true;
    if (Array.isArray(t.tags) && t.tags.some(g => g.toLowerCase().includes(query))) return true;
    return false;
  });
  const t_search_ms = performance.now() - t0_search;

  // 3. Cálculos de Balances Teóricos y Cuentas
  // 3.1 accountHistory
  const _historyCache = {};
  function getAccountHistory(accountId) {
    if (_historyCache[accountId]) return _historyCache[accountId];
    return _historyCache[accountId] = data.patrimony
      .filter(p => p.account_id === accountId)
      .sort((a, b) => {
        const da = a.reset_date || lastDayOfMonthStr(a.year, a.month);
        const db = b.reset_date || lastDayOfMonthStr(b.year, b.month);
        return da.localeCompare(db);
      });
  }

  // 3.2 accountTheoreticalFromLastRealReset
  function accountTheoreticalFromLastRealReset(accountId, dateStr) {
    const hist = getAccountHistory(accountId).filter(p => {
      const d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
      return d < dateStr;
    });
    const reset = hist.pop();
    const base = reset ? Number(reset.amount) : 0;
    const baseDate = reset ? (reset.reset_date || lastDayOfMonthStr(reset.year, reset.month)) : '0000-01-01';
    const pool = _txByAccount[accountId] || [];
    const live = pool.filter(t => {
      return !t.is_balance_adjustment && accountTouchesAccount(t, accountId, data.accounts.length) && t.date > baseDate && t.date <= dateStr;
    }).reduce((sum, t) => sum + accountTxDelta(t, accountId, data.accounts.length), 0);
    return Math.round((base + live) * 100) / 100;
  }

  // Medir recálculo de saldo teórico puntual
  const t0_theo_single = performance.now();
  const singleTheo = accountTheoreticalFromLastRealReset('acc_checking', '2026-10-01');
  const t_theo_single_ms = performance.now() - t0_theo_single;

  // 3.3 Simulación de Apertura de Pestaña Cuentas (calcula teórico para cada snapshot histórico)
  const t0_accounts_tab = performance.now();
  let totalSnapshotsEvaluated = 0;
  data.accounts.slice(0, 3).forEach(acc => {
    const hist = getAccountHistory(acc.id);
    hist.forEach(p => {
      totalSnapshotsEvaluated++;
      const pDate = p.reset_date || lastDayOfMonthStr(p.year, p.month);
      accountTheoreticalFromLastRealReset(acc.id, pDate);
    });
  });
  const t_accounts_tab_ms = performance.now() - t0_accounts_tab;

  // 3.4 Simulación de Apertura de Pestaña Anual (12 meses x cuentas ordinarias)
  const t0_annual_tab = performance.now();
  function accountCalcBalanceAsOf(accountId, dateStr) {
    const hist = getAccountHistory(accountId).filter(p => {
      const d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
      return d <= dateStr;
    });
    const reset = hist.length ? hist[hist.length - 1] : null;
    const base = reset ? Number(reset.amount) : 0;
    const baseDate = reset ? (reset.reset_date || lastDayOfMonthStr(reset.year, reset.month)) : '0000-01-01';
    const pool = _txByAccount[accountId] || [];
    const live = pool.filter(t => {
      return accountTouchesAccount(t, accountId, data.accounts.length) && t.date > baseDate && t.date <= dateStr;
    }).reduce((s, t) => s + accountTxDelta(t, accountId, data.accounts.length), 0);
    return Math.round((base + live) * 100) / 100;
  }

  const annualSeries = data.accounts.slice(0, 3).map(a => {
    return Array.from({ length: 12 }, (_, m) => {
      const endOfMonth = lastDayOfMonthStr(2026, m + 1);
      return accountCalcBalanceAsOf(a.id, endOfMonth);
    });
  });
  const t_annual_tab_ms = performance.now() - t0_annual_tab;

  // 4. Renderizado simulado y paginación DOM
  const t0_render_list = performance.now();
  const TX_PAGE_SIZE = 50;
  const sortedTxs = monthTxs.slice().sort((a, b) => b.date.localeCompare(a.date));
  const shownTxs = sortedTxs.slice(0, TX_PAGE_SIZE);
  // Agrupación por días
  const groups = {};
  shownTxs.forEach(t => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  });
  const t_render_list_ms = performance.now() - t0_render_list;

  // 5. Serialización JSON y Cifrado AES-GCM (IndexedDB)
  const payloadToStore = {
    transactions: data.transactions,
    categories: data.categories,
    accounts: data.accounts,
    patrimony: data.patrimony,
    budgets: data.budgets,
    recurrenceExclusions: data.recurrenceExclusions,
    transactionVoids: data.transactionVoids,
    investmentOperations: data.investmentOperations
  };

  const t0_json = performance.now();
  const jsonStr = JSON.stringify(payloadToStore);
  const t_json_ms = performance.now() - t0_json;
  const payloadSizeBytes = Buffer.byteLength(jsonStr, 'utf8');
  const payloadSizeMB = (payloadSizeBytes / (1024 * 1024)).toFixed(2);

  // Cifrado Web Crypto AES-GCM
  const t0_crypto_enc = performance.now();
  const subtle = globalThis.crypto.subtle;
  const aesKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const rawBytes = new TextEncoder().encode(jsonStr);
  const encryptedBuf = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, rawBytes);
  const encryptedBytes = new Uint8Array(encryptedBuf);

  // Conversión Base64 en bloques
  const t0_b64 = performance.now();
  const b64Data = cacheBytesToB64(encryptedBytes);
  const t_b64_ms = performance.now() - t0_b64;
  const t_crypto_enc_ms = performance.now() - t0_crypto_enc;

  // Descifrado Web Crypto AES-GCM
  const t0_crypto_dec = performance.now();
  const decBytes = cacheB64ToBytes(b64Data);
  const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, decBytes);
  const decryptedJson = JSON.parse(new TextDecoder().decode(plainBuf));
  const t_crypto_dec_ms = performance.now() - t0_crypto_dec;

  assert(decryptedJson.transactions.length === data.transactions.length, 'Integridad de descifrado');

  const memAfter = process.memoryUsage();
  const heapDeltaMB = ((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2);

  console.log(`- Indexación en memoria (ensureTxIndices):   ${t_index_ms.toFixed(2)} ms`);
  console.log(`- Consulta mensual (_txByMonthStr):          ${t_mquery_ms.toFixed(3)} ms (${monthTxs.length} txs en el mes)`);
  console.log(`- Consulta anual (_txByYearStr):             ${t_yquery_ms.toFixed(3)} ms (${yearTxs.length} txs en el año)`);
  console.log(`- Filtro lineal por rango (O(N) sin índice): ${t_range_ms.toFixed(2)} ms (${rangeTxs.length} txs en rango)`);
  console.log(`- Búsqueda texto libre (searchScope='all'):  ${t_search_ms.toFixed(2)} ms (${searchResults.length} coincidencias)`);
  console.log(`- Saldo teórico puntual (1 cuenta):          ${t_theo_single_ms.toFixed(2)} ms`);
  console.log(`- Render Tab Cuentas (${totalSnapshotsEvaluated} snapshots x hist): ${t_accounts_tab_ms.toFixed(2)} ms`);
  console.log(`- Render Tab Anual (12 meses x 3 cuentas):   ${t_annual_tab_ms.toFixed(2)} ms`);
  console.log(`- Paginación DOM (50 elementos mostrados):   ${t_render_list_ms.toFixed(3)} ms`);
  console.log(`- Serialización JSON payload:                ${t_json_ms.toFixed(2)} ms`);
  console.log(`- Tamaño JSON sin cifrar:                    ${payloadSizeMB} MB (${payloadSizeBytes.toLocaleString('es-ES')} bytes)`);
  console.log(`- Cifrado AES-GCM 256-bit + Base64:          ${t_crypto_enc_ms.toFixed(2)} ms (Base64 chunking: ${t_b64_ms.toFixed(2)} ms)`);
  console.log(`- Descifrado AES-GCM + JSON.parse:           ${t_crypto_dec_ms.toFixed(2)} ms`);
  console.log(`- Incremento Heap Node.js:                   ${heapDeltaMB} MB`);

  return {
    count: data.transactions.length,
    indexMs: t_index_ms,
    mqueryMs: t_mquery_ms,
    yqueryMs: t_yquery_ms,
    rangeMs: t_range_ms,
    searchMs: t_search_ms,
    theoSingleMs: t_theo_single_ms,
    accountsTabMs: t_accounts_tab_ms,
    annualTabMs: t_annual_tab_ms,
    renderListMs: t_render_list_ms,
    jsonMs: t_json_ms,
    payloadSizeMB: payloadSizeMB,
    cryptoEncMs: t_crypto_enc_ms,
    cryptoDecMs: t_crypto_dec_ms,
    heapDeltaMB: heapDeltaMB
  };
}

// -------------------------------------------------------------
// EJECUCION PRINCIPAL
// -------------------------------------------------------------

async function main() {
  console.log('Iniciando batería de benchmarks de escalabilidad fintrack...');

  const d1 = generateDataset(1000, 1);
  const r1 = await runBenchmark('ESCALA N1 (1.000 txs · 1 año normal)', d1);

  const d2 = generateDataset(5000, 4);
  const r2 = await runBenchmark('ESCALA N2 (5.000 txs · 4-5 años intensivo)', d2);

  const d3 = generateDataset(25000, 7);
  const r3 = await runBenchmark('ESCALA N3 (25.000 txs · importación masiva / uso extremo)', d3);

  console.log('\n================================================================');
  console.log(' RESUMEN COMPARATIVO DE ESCALABILIDAD (N1 vs N2 vs N3)');
  console.log('================================================================');
  console.log('| Métrica                                 | 1.000 txs  | 5.000 txs  | 25.000 txs | Factor Escala (25k/1k) |');
  console.log('|-----------------------------------------|------------|------------|------------|------------------------|');

  function row(name, k, unit = 'ms') {
    const v1 = Number(r1[k]);
    const v2 = Number(r2[k]);
    const v3 = Number(r3[k]);
    const factor = (v1 > 0 ? (v3 / v1).toFixed(1) : '-') + 'x';
    console.log(`| ${name.padEnd(39)} | ${(v1.toFixed(2) + ' ' + unit).padEnd(10)} | ${(v2.toFixed(2) + ' ' + unit).padEnd(10)} | ${(v3.toFixed(2) + ' ' + unit).padEnd(10)} | ${factor.padEnd(22)} |`);
  }

  row('Indexación inicial (ensureTxIndices)', 'indexMs');
  row('Filtro por rango fechas O(N)', 'rangeMs');
  row('Búsqueda texto completo O(N)', 'searchMs');
  row('Cálculo saldo teórico puntual', 'theoSingleMs');
  row('Render Tab Cuentas (historiales)', 'accountsTabMs');
  row('Render Tab Anual (12m x cuentas)', 'annualTabMs');
  row('Serialización JSON', 'jsonMs');
  row('Tamaño Payload de Backup / Caché', 'payloadSizeMB', 'MB');
  row('Cifrado AES-GCM + Base64', 'cryptoEncMs');
  row('Descifrado AES-GCM + JSON.parse', 'cryptoDecMs');

  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Error durante la ejecución del benchmark:', err);
  process.exit(1);
});
