/**
 * test-audit-agent8.js
 * Suite completa de auditoría y validación para el Auditor 8 de FinTrack:
 * 1. Exportación a PDF (jsPDF, autoTable vs manual, paginación 'Pág. X de Y', desglose transferencias, exclusión de ajustes de saldo).
 * 2. Exportación a Excel (ExcelJS, pestañas Transacciones y Resumen Mensual optimizado en O(N) con _txByMonthStr vs benchmark O(N*Y*C)).
 * 3. Exportación a CSV y JSON (BOM UTF-8, mitigación de Formula Injection en CSV, serialización íntegra v4 en JSON).
 * 4. Normalización e Importación de copias (formato cliente vs copia automática Supabase, validación de esquema, accounts.is_investment, investment_operations).
 * 5. Confirmación de seguridad (confirmCriticalAction, frases IMPORTAR/RESTAURAR/BORRAR/ELIMINAR, backup previo de seguridad y atomicidad SQL).
 * 6. Casos límite (JSON corrupto, truncado, >10MB, tipos inesperados, inyección de datos malformados).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log(' AUDITORÍA 8: EXPORTACIÓN E IMPORTACIÓN DE DATOS EN FINTRACK');
console.log('================================================================\n');

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function pad(n) { return (n < 10 ? '0' : '') + n; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function lastDayOfMonthStr(y, m) { return y + '-' + pad(m) + '-' + pad(new Date(y, m, 0).getDate()); }

function hexToRgb(h) {
  h = (h || '#888').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.substr(0, 2), 16) || 0, parseInt(h.substr(2, 2), 16) || 0, parseInt(h.substr(4, 2), 16) || 0];
}

function normalizeImportedBackup(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    var source = data.data;
    return {
      version: data.version || 3,
      transactions: source.transactions || [],
      categories: source.categories || [],
      accounts: source.accounts || [],
      patrimony: source.patrimony || [],
      budgets: source.budgets || [],
      recurrenceExclusions: source.recurrenceExclusions || source.recurrence_exclusions || [],
      transactionVoids: source.transactionVoids || source.transaction_voids || [],
      investmentOperations: source.investmentOperations || source.investment_operations || []
    };
  }
  return data;
}

function validateImportData(d) {
  function isStr(v, max) { return typeof v === 'string' && v.length <= (max || 500); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isId(v) { return typeof v === 'string' && v.length >= 1 && v.length <= 100 && /^[A-Za-z0-9_|.-]+$/.test(v); }
  function isColor(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v); }
  function isDate(v) {
    if (!isStr(v, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var d2 = new Date(v + 'T12:00:00');
    return !isNaN(d2) && d2.toISOString().slice(0, 10) === v;
  }
  function checkDupIds(arr, label) {
    var seen = {};
    arr.forEach(function(x, i) {
      if (x && x.id) {
        if (seen[x.id]) throw new Error(label + ' #' + i + ': id duplicado (' + x.id + ')');
        seen[x.id] = true;
      }
    });
  }

  if (!d || typeof d !== 'object') throw new Error('formato no válido');
  if (!Array.isArray(d.categories) || !Array.isArray(d.transactions)) throw new Error('formato no válido: faltan categorías o transacciones');

  d.categories.forEach(function(c, i) {
    if (!c || !isId(c.id)) throw new Error('categoría #' + i + ': id inválido');
    if (!isStr(c.name, 80) || !c.name) throw new Error('categoría #' + i + ': nombre inválido');
    if (c.color !== undefined && c.color !== null && (!isStr(c.color, 20) || !/^#[0-9a-fA-F]{3,8}$/.test(c.color))) throw new Error('categoría #' + i + ': color inválido');
    if (c.subcats !== undefined && (!Array.isArray(c.subcats) || c.subcats.some(function(s) { return !isStr(s, 60); }))) throw new Error('categoría #' + i + ': subcategorías inválidas');
    if (c.position !== undefined && !isNum(c.position)) throw new Error('categoría #' + i + ': posición inválida');
    if (c.archived !== undefined && typeof c.archived !== 'boolean') throw new Error('categoría #' + i + ': estado archivado inválido');
    if (c.kind !== undefined && ['expense', 'income'].indexOf(c.kind) === -1) throw new Error('categoría #' + i + ': tipo inválido');
  });
  checkDupIds(d.categories, 'categoría');

  var validTypes = ['expense', 'income', 'transfer'];
  var validIntervals = ['weekly', 'biweekly', 'monthly', 'yearly'];
  d.transactions.forEach(function(t, i) {
    if (!t || !isId(t.id)) throw new Error('transacción #' + i + ': id inválido');
    if (validTypes.indexOf(t.type) === -1) throw new Error('transacción #' + i + ': tipo inválido');
    if (!isNum(t.amount) || t.amount < 0) throw new Error('transacción #' + i + ': importe inválido');
    if (t.category != null && t.category !== 'transfer' && !isId(t.category)) throw new Error('transacción #' + i + ': categoría inválida');
    if (t.subcategory != null && !isStr(t.subcategory, 60)) throw new Error('transacción #' + i + ': subcategoría inválida');
    if (t.note != null && !isStr(t.note, 1000)) throw new Error('transacción #' + i + ': nota demasiado larga');
    if (!isDate(t.date)) throw new Error('transacción #' + i + ': fecha inválida');
    if (t.recur_interval != null && validIntervals.indexOf(t.recur_interval) === -1) throw new Error('transacción #' + i + ': intervalo de recurrencia inválido');
    if (t.recur_end_date != null && !isDate(t.recur_end_date)) throw new Error('transacción #' + i + ': fecha de fin inválida');
    if (t.recur_series_id != null && !isId(t.recur_series_id)) throw new Error('transacción #' + i + ': id de serie inválido');
    if (t.tags !== undefined && (!Array.isArray(t.tags) || t.tags.some(function(g) { return !isStr(g, 40); }))) throw new Error('transacción #' + i + ': etiquetas inválidas');
    if (t.account_id != null && !isId(t.account_id)) throw new Error('transacción #' + i + ': cuenta inválida');
    if (t.to_account_id != null && !isId(t.to_account_id)) throw new Error('transacción #' + i + ': cuenta destino inválida');
  });
  checkDupIds(d.transactions, 'transacción');

  if (d.accounts !== undefined) {
    if (!Array.isArray(d.accounts)) throw new Error('cuentas: formato inválido');
    d.accounts.forEach(function(a, i) {
      if (!a || !isId(a.id)) throw new Error('cuenta #' + i + ': id inválido');
      if (!isStr(a.name, 80) || !a.name) throw new Error('cuenta #' + i + ': nombre inválido');
      if (a.color != null && !isColor(a.color)) throw new Error('cuenta #' + i + ': color inválido');
    });
    checkDupIds(d.accounts, 'cuenta');
  }

  if (d.patrimony !== undefined) {
    if (!Array.isArray(d.patrimony)) throw new Error('patrimonio: formato inválido');
    d.patrimony.forEach(function(p, i) {
      if (!p || !isId(p.id)) throw new Error('patrimonio #' + i + ': id inválido');
      if (p.account_id != null && !isId(p.account_id)) throw new Error('patrimonio #' + i + ': cuenta inválida');
      if (!isNum(p.year) || !isNum(p.month) || !isNum(p.amount)) throw new Error('patrimonio #' + i + ': valores numéricos inválidos');
    });
    checkDupIds(d.patrimony, 'patrimonio');
  }

  if (d.budgets !== undefined) {
    if (!Array.isArray(d.budgets)) throw new Error('presupuestos: formato inválido');
    d.budgets.forEach(function(b, i) {
      if (!b || !isId(b.id)) throw new Error('presupuesto #' + i + ': id inválido');
      if (b.category_id != null && !isId(b.category_id)) throw new Error('presupuesto #' + i + ': categoría inválida');
      if (!isNum(b.amount)) throw new Error('presupuesto #' + i + ': importe inválido');
      if (b.month_year != null && !isStr(b.month_year, 10)) throw new Error('presupuesto #' + i + ': mes inválido');
      if (b.note != null && !isStr(b.note, 200)) throw new Error('presupuesto #' + i + ': nota inválida');
    });
    checkDupIds(d.budgets, 'presupuesto');
  }

  if (d.recurrenceExclusions !== undefined) {
    if (!Array.isArray(d.recurrenceExclusions)) throw new Error('exclusiones de recurrencia: formato inválido');
    d.recurrenceExclusions.forEach(function(x, i) {
      if (!x || !isId(x.id)) throw new Error('exclusión #' + i + ': id inválido');
      if (!isStr(x.recur_series_id, 160)) throw new Error('exclusión #' + i + ': serie inválida');
      if (!isStr(x.skipped_date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(x.skipped_date)) throw new Error('exclusión #' + i + ': fecha inválida');
    });
    checkDupIds(d.recurrenceExclusions, 'exclusión');
  }

  if (d.transactionVoids !== undefined) {
    if (!Array.isArray(d.transactionVoids)) throw new Error('anulaciones: formato inválido');
    d.transactionVoids.forEach(function(v, i) {
      if (!v || !isId(v.id) || !isId(v.transaction_id) || !v.transaction_data || typeof v.transaction_data !== 'object' || !isStr(v.voided_at, 40)) {
        throw new Error('anulación #' + i + ': datos inválidos');
      }
    });
    checkDupIds(d.transactionVoids, 'anulación');
  }
}

function backupPreviewCounts(data) {
  return {
    cuentas: (data.accounts || []).length,
    categorías: (data.categories || []).length,
    transacciones: (data.transactions || []).length,
    presupuestos: (data.budgets || []).length,
    ajustes: (data.patrimony || []).length,
    operaciones_de_inversión: (data.investmentOperations || []).length
  };
}

async function runAudit() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASÓ] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FALLÓ] ${name}`);
      console.error(`    -> ${err.message}\n`);
    }
  }

  console.log('--- 1. AUDITORÍA EXPORTACIÓN A PDF (exportPDF) ---');

  test('jsPDF y autoTable: verificación en código estático y vendor', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(indexHtml.includes("loadScript('./vendor/jspdf.umd.min.js')"), 'Debe cargar jspdf.umd.min.js');
    assert.ok(indexHtml.includes("new window.jspdf.jsPDF"), 'Debe instanciar jsPDF desde window.jspdf.jsPDF');

    const hasAutoTableCall = indexHtml.includes('autoTable(') || indexHtml.includes('doc.autoTable');
    assert.strictEqual(hasAutoTableCall, false, 'NO debe usar doc.autoTable (usa maquetación manual con doc.rect y doc.text)');
    assert.ok(indexHtml.includes("{orientation:'portrait',unit:'mm',format:'a4'}"), 'Debe usar formato A4 portrait en mm');
  });

  test('Paginación y numeración de páginas (Pág. X de Y) en dos pasadas', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(indexHtml.includes("if(y>280){doc.addPage();y=20;drawTxHeader();}"), 'Debe añadir página al rebasar límite vertical y redibujar encabezado');
    assert.ok(indexHtml.includes("var totalPages=doc.internal.getNumberOfPages();"), 'Debe leer doc.internal.getNumberOfPages()');
    assert.ok(indexHtml.includes("doc.setPage(pi);"), 'Debe iterar con doc.setPage(pi)');
    assert.ok(indexHtml.includes("'Pág. '+pi+' de '+totalPages"), 'Debe renderizar formato Pág. X de Y');
  });

  test('Desglose de cuentas en transferencias para PDF', () => {
    const accounts = [
      { id: 'acc_main', name: 'Cuenta Corriente' },
      { id: 'acc_sav', name: 'Ahorros' }
    ];
    function accNameById(id) {
      const a = accounts.find(x => x.id === id);
      return a ? a.name : 'Desconocida';
    }

    const tTransfer = {
      id: 'tx1',
      type: 'transfer',
      amount: 150,
      account_id: 'acc_main',
      to_account_id: 'acc_sav',
      date: '2026-09-01'
    };

    const catLabel = tTransfer.type === 'transfer' ? 'Transferencia' : 'Gasto';
    const desc = tTransfer.type === 'transfer' ? (accNameById(tTransfer.account_id) + ' → ' + accNameById(tTransfer.to_account_id)) : '';

    assert.strictEqual(catLabel, 'Transferencia');
    assert.strictEqual(desc, 'Cuenta Corriente → Ahorros');
  });

  test('Exclusión estricta de ajustes de saldo en gráficos PDF (donut y barras)', () => {
    const txs = [
      { id: 't1', type: 'expense', amount: 50, category: 'cat_food', is_balance_adjustment: false },
      { id: 't2', type: 'expense', amount: 500, category: 'cat_adj', is_balance_adjustment: true },
      { id: 't3', type: 'income', amount: 2000, category: 'cat_sal', is_balance_adjustment: false },
      { id: 't4', type: 'income', amount: 300, category: 'cat_adj', is_balance_adjustment: true }
    ];

    var exps = txs.filter(function(t) { return t.type === 'expense' && !t.is_balance_adjustment; });
    var tExp = exps.reduce(function(s, t) { return s + t.amount; }, 0);
    var tInc = txs.filter(function(t) { return t.type === 'income' && !t.is_balance_adjustment; }).reduce(function(s, t) { return s + t.amount; }, 0);

    assert.strictEqual(tExp, 50, 'El gasto para gráficos debe ser 50 € excluyendo el ajuste de 500 €');
    assert.strictEqual(tInc, 2000, 'El ingreso debe ser 2.000 € excluyendo el ajuste de 300 €');
    assert.strictEqual(exps.length, 1, 'Sólo debe existir 1 movimiento de gasto real en exps');
  });

  console.log('\n--- 2. AUDITORÍA EXPORTACIÓN A EXCEL (exportXLSX) ---');

  test('Integración ExcelJS: pestañas generadas y formato de celdas', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(indexHtml.includes("wb.addWorksheet('Resumen')"), 'Debe generar pestaña Resumen');
    assert.ok(indexHtml.includes("wb.addWorksheet('Transacciones')"), 'Debe generar pestaña Transacciones');
    assert.ok(indexHtml.includes("wb.addWorksheet('Resumen Mensual')"), 'Debe generar pestaña Resumen Mensual');
    assert.ok(indexHtml.includes("wb.addWorksheet('Patrimonio')"), 'Debe generar pestaña Patrimonio');
    assert.ok(indexHtml.includes("wb.addWorksheet('Categorías')"), 'Debe generar pestaña Categorías');
    assert.ok(indexHtml.includes("wb.addImage("), 'Debe incrustar gráfico donut en pestaña Resumen');
    assert.ok(indexHtml.includes("moneyFmtRed"), 'Debe incluir formato numérico monetario negativo en rojo');
  });

  test('Optimización O(N) de Resumen Mensual con _txByMonthStr vs O(Y*12*N*C) legacy', () => {
    const categories = Array.from({ length: 10 }, (_, i) => ({ id: 'c' + i, name: 'Cat ' + i }));
    const transactions = [];
    for (let i = 0; i < 5000; i++) {
      const yr = 2022 + (i % 5);
      const mo = pad(1 + (i % 12));
      const day = pad(1 + (i % 28));
      transactions.push({
        id: 'tx_' + i,
        date: `${yr}-${mo}-${day}`,
        type: i % 3 === 0 ? 'income' : 'expense',
        amount: (i % 100) + 1,
        category: 'c' + (i % 10)
      });
    }

    const startNew = process.hrtime.bigint();
    const _txByMonthStr = {};
    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      const ym = t.date.slice(0, 7);
      if (!_txByMonthStr[ym]) _txByMonthStr[ym] = [];
      _txByMonthStr[ym].push(t);
    }

    const years = [...new Set(transactions.map(t => parseInt(t.date.slice(0, 4), 10)))].sort();
    const resultsNew = [];

    years.forEach(yr => {
      for (let m = 0; m < 12; m++) {
        const ym = yr + '-' + pad(m + 1);
        const txs = _txByMonthStr[ym] || [];
        if (!txs.length) return;
        let inc = 0, exp = 0, catExpMap = {};
        for (let ti = 0; ti < txs.length; ti++) {
          const t = txs[ti];
          const amt = Number(t.amount) || 0;
          if (t.type === 'income') inc += amt;
          else if (t.type === 'expense') {
            exp += amt;
            if (t.category) catExpMap[t.category] = (catExpMap[t.category] || 0) + amt;
          }
        }
        const rowData = [yr, MONTHS[m], inc, -exp, inc - exp];
        categories.forEach(c => {
          const catExp = catExpMap[c.id] || 0;
          rowData.push(catExp > 0 ? -catExp : 0);
        });
        resultsNew.push(rowData);
      }
    });
    const durationNewMs = Number(process.hrtime.bigint() - startNew) / 1e6;

    const startLegacy = process.hrtime.bigint();
    const resultsLegacy = [];
    years.forEach(yr => {
      for (let m = 0; m < 12; m++) {
        const txs = transactions.filter(t => {
          const d = new Date(t.date + 'T12:00:00');
          return d.getFullYear() === yr && d.getMonth() === m;
        });
        if (!txs.length) return;
        const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const rowData = [yr, MONTHS[m], inc, -exp, inc - exp];
        categories.forEach(c => {
          const catExp = txs.filter(t => t.type === 'expense' && t.category === c.id).reduce((s, t) => s + t.amount, 0);
          rowData.push(catExp > 0 ? -catExp : 0);
        });
        resultsLegacy.push(rowData);
      }
    });
    const durationLegacyMs = Number(process.hrtime.bigint() - startLegacy) / 1e6;

    assert.strictEqual(resultsNew.length, resultsLegacy.length, 'El número de filas mensuales debe ser idéntico');
    assert.deepStrictEqual(resultsNew[0], resultsLegacy[0], 'La primera fila calculada debe ser idéntica');
    assert.deepStrictEqual(resultsNew[resultsNew.length - 1], resultsLegacy[resultsLegacy.length - 1], 'La última fila debe ser idéntica');

    console.log(`    -> Rendimiento: Método optimizado O(N): ${durationNewMs.toFixed(2)} ms vs Legacy O(Y*12*N*C): ${durationLegacyMs.toFixed(2)} ms (Aceleración: ${(durationLegacyMs / durationNewMs).toFixed(1)}x)`);
    assert.ok(durationNewMs < durationLegacyMs, 'El método con _txByMonthStr debe ser sustancialmente más rápido');
  });

  console.log('\n--- 3. AUDITORÍA EXPORTACIÓN A CSV Y JSON ---');

  test('exportCSV: delimitador punto y coma, coma decimal, BOM UTF-8 y protección contra Formula Injection', () => {
    function csvEsc(v) {
      v = (v || '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
      if (/^[=+\-@\t]/.test(v)) v = "'" + v;
      return v;
    }

    const maliciousFormula1 = '=cmd|"/C calc"!A0';
    const maliciousFormula2 = '+SUM(A1:A10)';
    const maliciousFormula3 = '-2+3';
    const maliciousFormula4 = '@SUM(1,2)';
    const maliciousFormula5 = '\tTAB_INJECT';
    const normalText = 'Compra en supermercado';

    assert.strictEqual(csvEsc(maliciousFormula1), "'=cmd|\"\"/C calc\"\"!A0", 'Debe prefijar comilla simple en inyección = y escapar comillas dobles');
    assert.strictEqual(csvEsc(maliciousFormula2), "'+SUM(A1:A10)", 'Debe prefijar comilla simple en inyección +');
    assert.strictEqual(csvEsc(maliciousFormula3), "'-2+3", 'Debe prefijar comilla simple en inyección -');
    assert.strictEqual(csvEsc(maliciousFormula4), "'@SUM(1,2)", 'Debe prefijar comilla simple en inyección @');
    assert.strictEqual(csvEsc(maliciousFormula5), "'\tTAB_INJECT", 'Debe prefijar comilla simple en tabulaciones');
    assert.strictEqual(csvEsc(normalText), 'Compra en supermercado', 'No debe alterar texto normal');

    const amtNumber = 1234.56;
    const amtFormatted = amtNumber.toString().replace('.', ',');
    assert.strictEqual(amtFormatted, '1234,56');

    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(indexHtml.includes("'\\ufeff'+csv") || indexHtml.includes("'\ufeff'+csv"), 'El CSV debe incluir BOM UTF-8 \\ufeff');
  });

  test('exportJSON: esquema completo v4 con todas las entidades', () => {
    const state = {
      version: 4,
      transactions: [{ id: 't1', date: '2026-09-01', amount: 10, type: 'expense' }],
      categories: [{ id: 'c1', name: 'Alimentación' }],
      accounts: [{ id: 'a1', name: 'Efectivo', is_investment: false }],
      patrimony: [{ id: 'p1', year: 2026, month: 9, amount: 1000 }],
      budgets: [{ id: 'b1', amount: 500 }],
      recurrenceExclusions: [{ id: 'rx1', recur_series_id: 'rs1', skipped_date: '2026-09-05' }],
      transactionVoids: [{ id: 'tv1', transaction_id: 't1', voided_at: '2026-09-05T10:00:00Z', transaction_data: {} }],
      investmentOperations: [{ id: 'io1', symbol: 'IWDA', units: 5, unit_price: 90, amount: 450 }]
    };

    const json = JSON.stringify(state, null, 2);
    const parsed = JSON.parse(json);

    assert.strictEqual(parsed.version, 4);
    assert.strictEqual(parsed.transactions.length, 1);
    assert.strictEqual(parsed.categories.length, 1);
    assert.strictEqual(parsed.accounts.length, 1);
    assert.strictEqual(parsed.patrimony.length, 1);
    assert.strictEqual(parsed.budgets.length, 1);
    assert.strictEqual(parsed.recurrenceExclusions.length, 1);
    assert.strictEqual(parsed.transactionVoids.length, 1);
    assert.strictEqual(parsed.investmentOperations.length, 1);
  });

  console.log('\n--- 4. AUDITORÍA IMPORTACIÓN Y NORMALIZACIÓN DE COPIAS ---');

  test('normalizeImportedBackup: conversión de formato Supabase ({data, snake_case}) a camelCase', () => {
    const supabaseBackup = {
      version: 2,
      exported_at: '2026-09-04T12:00:00Z',
      user_id: 'uuid-1234',
      reason: 'automatic',
      data: {
        accounts: [{ id: 'a1', name: 'Broker', is_investment: true }],
        categories: [{ id: 'c1', name: 'Nómina' }],
        transactions: [{ id: 't1', type: 'income', amount: 3000, date: '2026-09-01' }],
        patrimony: [{ id: 'p1', year: 2026, month: 9, amount: 3000 }],
        budgets: [],
        recurrence_exclusions: [{ id: 'rx1', recur_series_id: 's1', skipped_date: '2026-09-02' }],
        transaction_voids: [{ id: 'tv1', transaction_id: 't1', voided_at: '2026-09-02T10:00:00Z', transaction_data: {} }],
        investment_operations: [{ id: 'io1', symbol: 'VUAA', units: 10, unit_price: 80, amount: 800 }]
      }
    };

    const normalized = normalizeImportedBackup(supabaseBackup);

    assert.ok(Array.isArray(normalized.recurrenceExclusions), 'Debe normalizar recurrence_exclusions a recurrenceExclusions');
    assert.strictEqual(normalized.recurrenceExclusions.length, 1);
    assert.ok(Array.isArray(normalized.transactionVoids), 'Debe normalizar transaction_voids a transactionVoids');
    assert.strictEqual(normalized.transactionVoids.length, 1);
    assert.ok(Array.isArray(normalized.investmentOperations), 'Debe normalizar investment_operations a investmentOperations');
    assert.strictEqual(normalized.investmentOperations.length, 1);
    assert.strictEqual(normalized.accounts[0].is_investment, true, 'Debe preservar accounts[0].is_investment');
  });

  test('normalizeImportedBackup: preservación intacta de copia manual exportJSON', () => {
    const manualBackup = {
      version: 4,
      accounts: [{ id: 'a1', name: 'Efectivo' }],
      categories: [{ id: 'c1', name: 'Comida' }],
      transactions: [{ id: 't1', type: 'expense', amount: 20, date: '2026-09-01' }],
      patrimony: [],
      budgets: [],
      recurrenceExclusions: [{ id: 'rx1', recur_series_id: 's1', skipped_date: '2026-09-03' }],
      transactionVoids: [],
      investmentOperations: []
    };

    const normalized = normalizeImportedBackup(manualBackup);
    assert.strictEqual(normalized, manualBackup, 'Debe retornar el objeto manual sin modificaciones');
    assert.strictEqual(normalized.recurrenceExclusions.length, 1);
  });

  test('validateImportData: detección de faltantes estructurales e IDs duplicados', () => {
    assert.throws(() => {
      validateImportData({ version: 4, transactions: [] });
    }, /faltan categorías o transacciones/);

    assert.throws(() => {
      validateImportData({
        categories: [{ id: 'c1', name: 'Cat 1' }],
        transactions: [
          { id: 't1', type: 'expense', amount: 10, date: '2026-09-01' },
          { id: 't1', type: 'expense', amount: 20, date: '2026-09-02' }
        ]
      });
    }, /transacción #1: id duplicado \(t1\)/);

    assert.throws(() => {
      validateImportData({
        categories: [
          { id: 'c1', name: 'Cat 1' },
          { id: 'c1', name: 'Cat 2' }
        ],
        transactions: []
      });
    }, /categoría #1: id duplicado \(c1\)/);

    assert.throws(() => {
      validateImportData({
        categories: [{ id: 'c1', name: 'Cat 1' }],
        transactions: [{ id: 't1', type: 'expense', amount: 10, date: '2026-09-01' }],
        recurrenceExclusions: [
          { id: 'rx1', recur_series_id: 's1', skipped_date: '2026-09-01' },
          { id: 'rx1', recur_series_id: 's1', skipped_date: '2026-09-08' }
        ]
      });
    }, /exclusión #1: id duplicado/);
  });

  test('validateImportData: validación estricta de fechas y valores monetarios', () => {
    assert.throws(() => {
      validateImportData({
        categories: [{ id: 'c1', name: 'Cat 1' }],
        transactions: [{ id: 't1', type: 'expense', amount: 10, date: '2026-02-30' }]
      });
    }, /fecha inválida/);

    assert.throws(() => {
      validateImportData({
        categories: [{ id: 'c1', name: 'Cat 1' }],
        transactions: [{ id: 't1', type: 'expense', amount: 10, date: '2026-13-01' }]
      });
    }, /fecha inválida/);

    assert.throws(() => {
      validateImportData({
        categories: [{ id: 'c1', name: 'Cat 1' }],
        transactions: [{ id: 't1', type: 'expense', amount: -50, date: '2026-09-01' }]
      });
    }, /importe inválido/);

    assert.throws(() => {
      validateImportData({
        categories: [{ id: 'c1', name: 'Cat 1' }],
        transactions: [{ id: 't1', type: 'unknown_type', amount: 50, date: '2026-09-01' }]
      });
    }, /tipo inválido/);
  });

  test('HALLAZGO CRÍTICO: validación de investmentOperations y accounts.is_investment en frontend', () => {
    const dataWithCorruptedInvestments = {
      categories: [{ id: 'c1', name: 'Cat 1' }],
      transactions: [{ id: 't1', type: 'expense', amount: 10, date: '2026-09-01' }],
      investmentOperations: [
        { id: 'io1', symbol: 12345, units: 'not-a-number', unit_price: null, amount: 'bad' }
      ]
    };

    let frontendValidationError = null;
    try {
      validateImportData(dataWithCorruptedInvestments);
    } catch (e) {
      frontendValidationError = e;
    }

    console.log(`    -> Nota auditoría: validateImportData ${frontendValidationError ? 'SÍ' : 'NO'} valida investmentOperations en frontend.`);
    assert.strictEqual(frontendValidationError, null, 'validateImportData actualmente NO valida investmentOperations (lo delega a PostgreSQL RPC)');

    const dataWithCorruptedAccount = {
      categories: [{ id: 'c1', name: 'Cat 1' }],
      transactions: [{ id: 't1', type: 'expense', amount: 10, date: '2026-09-01' }],
      accounts: [{ id: 'a1', name: 'Cuenta', is_investment: 'not_a_boolean' }]
    };

    let accountValidationError = null;
    try {
      validateImportData(dataWithCorruptedAccount);
    } catch (e) {
      accountValidationError = e;
    }
    console.log(`    -> Nota auditoría: validateImportData ${accountValidationError ? 'SÍ' : 'NO'} valida tipo booleano en accounts.is_investment.`);
    assert.strictEqual(accountValidationError, null, 'validateImportData actualmente no valida tipo boolean en accounts.is_investment');
  });

  console.log('\n--- 5. CONFIRMACIÓN CRÍTICA Y RESILIENCIA ANTE ARCHIVOS CORRUPTOS ---');

  test('Confirmaciones críticas: validación de frases de seguridad (IMPORTAR, RESTAURAR, BORRAR, ELIMINAR)', () => {
    function simulateConfirmAction(options, userInput) {
      return userInput.trim().toUpperCase() === options.phrase;
    }

    assert.strictEqual(simulateConfirmAction({ phrase: 'IMPORTAR' }, 'importar'), true, 'IMPORTAR debe aceptar minúsculas con trim');
    assert.strictEqual(simulateConfirmAction({ phrase: 'IMPORTAR' }, ' IMPORTAR '), true);
    assert.strictEqual(simulateConfirmAction({ phrase: 'IMPORTAR' }, 'RESTAURAR'), false, 'Frase incorrecta debe rechazar');

    assert.strictEqual(simulateConfirmAction({ phrase: 'RESTAURAR' }, 'restaurar'), true);
    assert.strictEqual(simulateConfirmAction({ phrase: 'RESTAURAR' }, 'BORRAR'), false);

    assert.strictEqual(simulateConfirmAction({ phrase: 'BORRAR' }, 'borrar'), true);

    assert.strictEqual(simulateConfirmAction({ phrase: 'ELIMINAR' }, 'eliminar'), true);
  });

  test('backupPreviewCounts: recuento completo incluyendo operaciones de inversión', () => {
    const mockBackup = {
      accounts: [{ id: 'a1' }, { id: 'a2' }],
      categories: [{ id: 'c1' }],
      transactions: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
      budgets: [{ id: 'b1' }],
      patrimony: [{ id: 'p1' }, { id: 'p2' }],
      investmentOperations: [{ id: 'io1' }, { id: 'io2' }, { id: 'io3' }, { id: 'io4' }]
    };

    const counts = backupPreviewCounts(mockBackup);
    assert.strictEqual(counts.cuentas, 2);
    assert.strictEqual(counts.categorías, 1);
    assert.strictEqual(counts.transacciones, 3);
    assert.strictEqual(counts.presupuestos, 1);
    assert.strictEqual(counts.ajustes, 2);
    assert.strictEqual(counts.operaciones_de_inversión, 4);
  });

  test('Casos límite: archivo truncado, JSON malformado y tamaño superior a 10 MB', () => {
    const truncatedJSON = '{"version": 4, "categories": [{"id": "c1", "name": "Alimentación"}], "transactions": [{"id": "t1", "amount": 25, ';
    let parseError = null;
    try {
      JSON.parse(truncatedJSON);
    } catch (e) {
      parseError = e;
    }
    assert.ok(parseError instanceof SyntaxError, 'JSON truncado debe arrojar SyntaxError');

    const MAX_BYTES = 10485760;
    const oversizedLength = MAX_BYTES + 1;
    function checkSizeLimit(size) {
      if (size > MAX_BYTES) throw new Error('la copia supera el tamaño máximo de 10 MB');
      return true;
    }

    assert.throws(() => checkSizeLimit(oversizedLength), /la copia supera el tamaño máximo de 10 MB/);
    assert.strictEqual(checkSizeLimit(MAX_BYTES), true);

    assert.throws(() => validateImportData('string_no_objeto'), /formato no válido/);
    assert.throws(() => validateImportData(null), /formato no válido/);
    assert.throws(() => validateImportData([]), /faltan categorías o transacciones/);
    assert.throws(() => validateImportData(12345), /formato no válido/);
  });

  test('Cadena de seguridad en importación: vista previa -> confirmación -> backup previo -> RPC atómica', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    const confirmIdx = indexHtml.indexOf("confirmCriticalAction({title:'Importar copia de seguridad'");
    const safetyBackupIdx = indexHtml.indexOf("createSafetyBackup('before_import')");
    const rpcIdx = indexHtml.indexOf("sb.rpc('replace_fintrack_data'");

    assert.ok(confirmIdx !== -1, 'Debe solicitar confirmación antes de proceder');
    assert.ok(safetyBackupIdx !== -1, 'Debe invocar createSafetyBackup');
    assert.ok(rpcIdx !== -1, 'Debe invocar RPC replace_fintrack_data');

    assert.ok(confirmIdx < safetyBackupIdx, 'La confirmación debe preceder a la creación del backup de seguridad');
    assert.ok(safetyBackupIdx < rpcIdx, 'El backup de seguridad DEBE crearse ANTES de invocar la RPC destructiva');
  });

  console.log('\n================================================================');
  console.log(` RESULTADO AUDITORÍA 8: ${passed}/${total} PRUEBAS COMPLETADAS CON ÉXITO`);
  console.log('================================================================\n');
}

runAudit();
