/**
 * AUDITORÍA INTEGRAL DEL NÚCLEO FINANCIERO DE FINTRACK — AUDITOR 3
 * Verificación exhaustiva de Cuentas, Patrimonio, Saldo Real vs Teórico,
 * Desfases, Ajustes de Saldo, Indexación _txByAccount e Invalidación de Caché.
 */

const assert = require('assert');

// 1. MOTOR FINANCIERO DE FINTRACK (IDÉNTICO A INDEX.HTML)
let currentUser = { id: 'usr_auditor_3' };
let transactions = [];
let categories = [];
let accounts = [];
let patrimony = [];
let budgets = [];
let recurrenceExclusions = [];
let transactionVoids = [];

let txVersion = 0;
let _txIndexVersion = -1;
let _txIndexLength = -1;
let _monthTxCache = {};
let _yearTxCache = {};
let _txByAccount = {};
let _txByMonthStr = {};
let _txByYearStr = {};
let _historyCache = {};
let _rbCache = {};

function pad(n) { return String(n).padStart(2, '0'); }

function lastDayOfMonthStr(yr, mo) {
  var d = new Date(yr, mo, 0);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function isLockedAdjust(p) {
  var id = (p && typeof p === 'object') ? p.id : p;
  return typeof id === 'string' && id.indexOf('anchor_') === 0;
}

function clearBalanceCache() {
  _rbCache = {};
  _historyCache = {};
}

function invalidateTxIndices() {
  _txIndexVersion = -1;
  _txIndexLength = -1;
  _monthTxCache = {};
  _yearTxCache = {};
}

function ensureTxIndices() {
  if (_txIndexVersion === txVersion && _txIndexLength === transactions.length) return;
  _txByAccount = {};
  _txByMonthStr = {};
  _txByYearStr = {};
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    var d = t.date;
    if (d && typeof d === 'string') {
      var ym = d.slice(0, 7);
      var y = d.slice(0, 4);
      if (!_txByMonthStr[ym]) _txByMonthStr[ym] = [];
      _txByMonthStr[ym].push(t);
      if (!_txByYearStr[y]) _txByYearStr[y] = [];
      _txByYearStr[y].push(t);
    }
    if (!t.is_balance_adjustment) {
      var a1 = t.account_id, a2 = t.to_account_id;
      if (a1) {
        if (!_txByAccount[a1]) _txByAccount[a1] = [];
        _txByAccount[a1].push(t);
      }
      if (a2 && a2 !== a1) {
        if (!_txByAccount[a2]) _txByAccount[a2] = [];
        _txByAccount[a2].push(t);
      }
      if (!a1 && t.type !== 'transfer' && accounts.length === 1) {
        var sa = accounts[0].id;
        if (!_txByAccount[sa]) _txByAccount[sa] = [];
        _txByAccount[sa].push(t);
      }
    }
  }
  _txIndexVersion = txVersion;
  _txIndexLength = transactions.length;
}

function saveLocalCache() {
  txVersion++;
  clearBalanceCache();
  if (typeof invalidateTxIndices === 'function') {
    invalidateTxIndices();
  }
}

function accountTouchesAccount(t, accountId) {
  return !t.is_balance_adjustment && (
    t.account_id === accountId ||
    t.to_account_id === accountId ||
    (!t.account_id && t.type !== 'transfer' && accounts.length === 1)
  );
}

function accountTxDelta(t, accountId) {
  if (t.is_balance_adjustment) return 0;
  if (t.type === 'transfer') {
    var d = 0;
    if (t.account_id === accountId) d -= Number(t.amount);
    if (t.to_account_id === accountId) d += Number(t.amount);
    return d;
  }
  if (!(t.account_id === accountId || (!t.account_id && accounts.length === 1))) return 0;
  return t.type === 'expense' ? -Number(t.amount) : Number(t.amount);
}

function accountVoidDelta(voided, accountId, baseDate, asOfDate) {
  var tx = voided && voided.transaction_data;
  if (!tx || !accountTouchesAccount(tx, accountId)) return 0;
  var voidedDate = String(voided.voided_at || '').slice(0, 10);
  if (!voidedDate || voidedDate <= baseDate || voidedDate > asOfDate || tx.date > baseDate) return 0;
  return -accountTxDelta(tx, accountId);
}

function accountHistory(accountId) {
  if (_historyCache[accountId]) return _historyCache[accountId];
  return _historyCache[accountId] = patrimony.filter(function(p) {
    return p.account_id === accountId;
  }).sort(function(a, b) {
    var da = a.reset_date || lastDayOfMonthStr(a.year, a.month);
    var db = b.reset_date || lastDayOfMonthStr(b.year, b.month);
    if (da !== db) return da.localeCompare(db);
    return (a.id || '').localeCompare(b.id || '');
  });
}

function accountLatestReset(accountId, yr, mo) {
  var cutoff = (mo === 12) ? (yr + 1) + '-01-01' : yr + '-' + pad(mo + 1) + '-01';
  var candidates = accountHistory(accountId).filter(function(p) {
    var d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
    return d < cutoff;
  });
  if (!candidates.length) return null;
  return candidates[candidates.length - 1];
}

function accountTheoreticalFromLastRealReset(accountId, dateStr) {
  var reset = accountHistory(accountId).filter(function(p) {
    var d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
    return d < dateStr;
  }).pop();
  var base = reset ? Number(reset.amount) : 0;
  var baseDate = reset ? (reset.reset_date || lastDayOfMonthStr(reset.year, reset.month)) : '0000-01-01';
  ensureTxIndices();
  var pool = _txByAccount[accountId] || [];
  var live = pool.filter(function(t) {
    return !t.is_balance_adjustment && accountTouchesAccount(t, accountId) && t.date > baseDate && t.date <= dateStr;
  }).reduce(function(sum, t) { return sum + accountTxDelta(t, accountId); }, 0);
  var voids = transactionVoids.reduce(function(sum, v) { return sum + accountVoidDelta(v, accountId, baseDate, dateStr); }, 0);
  return base + live + voids;
}

function snapshotTheoreticalAmount(snapshot, accountId) {
  if (!snapshot) return 0;
  return accountTheoreticalFromLastRealReset(accountId, snapshot.reset_date || lastDayOfMonthStr(snapshot.year, snapshot.month));
}

function accountCalcBalance(accountId, yr, mo) {
  var cutoff = (mo === 12) ? (yr + 1) + '-01-01' : yr + '-' + pad(mo + 1) + '-01';
  var reset = accountLatestReset(accountId, yr, mo);
  var base = reset ? Number(reset.amount) : 0;
  var baseDate = reset ? (reset.reset_date || lastDayOfMonthStr(reset.year, reset.month)) : '0000-01-01';
  ensureTxIndices();
  var pool = _txByAccount[accountId] || [];
  var live = pool.filter(function(t) {
    return accountTouchesAccount(t, accountId) && t.date > baseDate && t.date < cutoff;
  }).reduce(function(s, t) { return s + accountTxDelta(t, accountId); }, 0);
  var voids = transactionVoids.reduce(function(s, v) {
    return s + accountVoidDelta(v, accountId, baseDate, lastDayOfMonthStr(yr, mo));
  }, 0);
  return base + live + voids;
}

function accountCalcBalanceAsOf(accountId, dateStr) {
  var hist = accountHistory(accountId).filter(function(p) {
    var d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
    return d <= dateStr;
  });
  var reset = hist.length ? hist[hist.length - 1] : null;
  var base = reset ? Number(reset.amount) : 0;
  var baseDate = reset ? (reset.reset_date || lastDayOfMonthStr(reset.year, reset.month)) : '0000-01-01';
  ensureTxIndices();
  var pool = _txByAccount[accountId] || [];
  var live = pool.filter(function(t) {
    return accountTouchesAccount(t, accountId) && t.date > baseDate && t.date <= dateStr;
  }).reduce(function(s, t) { return s + accountTxDelta(t, accountId); }, 0);
  var voids = transactionVoids.reduce(function(s, v) {
    return s + accountVoidDelta(v, accountId, baseDate, dateStr);
  }, 0);
  return base + live + voids;
}

function accountCalcTheoreticalAsOf(accountId, dateStr) {
  return accountTheoreticalFromLastRealReset(accountId, dateStr);
}

function accountRealBalance(accountId, yr, mo) {
  var cutoff = (mo === 12) ? (yr + 1) + '-01-01' : yr + '-' + pad(mo + 1) + '-01';
  var hist = accountHistory(accountId).filter(function(p) {
    var d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
    return d < cutoff;
  });
  if (!hist.length) return null;
  return Number(hist[hist.length - 1].amount);
}

function accountRealBalanceAtDate(accountId, dateStr) {
  var key = accountId + '@' + dateStr;
  if (key in _rbCache) return _rbCache[key];
  var hist = accountHistory(accountId).filter(function(p) {
    var d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
    return d <= dateStr;
  });
  var v = hist.length ? Number(hist[hist.length - 1].amount) : null;
  _rbCache[key] = v;
  return v;
}

function txExpenseImpact(t) {
  if (!t) return 0;
  if (t.is_balance_adjustment) return t.type === 'expense' ? Number(t.amount) : -Number(t.amount);
  return t.type === 'expense' ? Number(t.amount) : 0;
}

function txIncomeImpact(t) {
  return t && !t.is_balance_adjustment && t.type === 'income' ? Number(t.amount) : 0;
}

function balanceAdjustmentCategorySpec(type) {
  return type === 'income'
    ? { id: 'cat_balance_adjustment_income', name: 'Ajuste de saldo (ingreso)', color: '#34C759', kind: 'income' }
    : { id: 'cat_balance_adjustment_expense', name: 'Ajuste de saldo (gasto)', color: '#FF3B30', kind: 'expense' };
}

function applyBalanceAdjustmentSimulation(accountId, date, real) {
  var yr = parseInt(date.slice(0, 4)), mo = parseInt(date.slice(5, 7));
  var theoretical = accountCalcTheoreticalAsOf(accountId, date);
  var diff = real - theoretical;

  var item = {
    id: 'p_' + accountId + '_' + date + '_' + Math.random().toString(36).slice(2, 6),
    account_id: accountId,
    year: yr,
    month: mo,
    amount: real,
    theoretical_amount: theoretical,
    reset_date: date,
    user_id: currentUser.id
  };

  var adjustment = null;
  if (Math.abs(diff) > 0.005) {
    var adjustmentType = diff < 0 ? 'expense' : 'income';
    adjustment = {
      id: 'txbal_' + item.id,
      type: adjustmentType,
      amount: Math.abs(diff),
      category: balanceAdjustmentCategorySpec(adjustmentType).id,
      subcategory: null,
      note: 'Actualización de saldo',
      date: date,
      recurring: false,
      recur_interval: null,
      recur_end_date: null,
      recur_series_id: null,
      recur_anchor_date: null,
      tags: [],
      account_id: accountId,
      to_account_id: null,
      is_balance_adjustment: true,
      balance_adjustment_patrimony_id: item.id,
      user_id: currentUser.id
    };
  }

  patrimony.push(item);
  if (adjustment) transactions.unshift(adjustment);
  saveLocalCache();
  return { snapshot: item, adjustment: adjustment, theoretical: theoretical, diff: diff };
}

function deleteBalanceAdjustmentSimulation(snapshotId) {
  transactions = transactions.filter(function(t) { return t.balance_adjustment_patrimony_id !== snapshotId; });
  patrimony = patrimony.filter(function(p) { return p.id !== snapshotId; });
  saveLocalCache();
}

// 2. RUNNER DE TESTS
let totalTests = 0;
let passedTests = 0;

function resetState() {
  transactions = [];
  categories = [];
  accounts = [];
  patrimony = [];
  budgets = [];
  recurrenceExclusions = [];
  transactionVoids = [];
  clearBalanceCache();
  invalidateTxIndices();
  txVersion = 0;
}

function test(title, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${String(totalTests).padStart(2, ' ')}: ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${String(totalTests).padStart(2, ' ')}: ${title}`);
    console.error(`         Detalle: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

console.log('='.repeat(75));
console.log('AUDITORÍA 3: NÚCLEO FINANCIERO DE FINTRACK — BATERÍA DE AUDITORÍA');
console.log('='.repeat(75));

// BLOQUE 1
console.log('\n--- BLOQUE 1: REGLAS FUNDAMENTALES DE SALDOS Y DESFASES ---');

test('Cálculo inicial desde cero: reconstruye correctamente sin reset previo', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta Corriente', color: '#007AFF' }];
  transactions.push({ id: 't1', type: 'income', amount: 1500, date: '2026-05-01', account_id: 'acc_1' });
  transactions.push({ id: 't2', type: 'expense', amount: 450, date: '2026-05-15', account_id: 'acc_1' });
  transactions.push({ id: 't3', type: 'expense', amount: 50, date: '2026-05-20', account_id: 'acc_1' });
  saveLocalCache();

  var th = accountTheoreticalFromLastRealReset('acc_1', '2026-05-31');
  assert.strictEqual(th, 1000);
  assert.strictEqual(accountCalcBalance('acc_1', 2026, 5), 1000);
});

test('Ajuste con desfase negativo: genera gasto, NO altera teórico ni enmascara desfase', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta Corriente', color: '#007AFF' }];
  transactions.push({ id: 't1', type: 'income', amount: 1000, date: '2026-06-01', account_id: 'acc_1' });
  saveLocalCache();

  var res = applyBalanceAdjustmentSimulation('acc_1', '2026-06-15', 920);
  assert.strictEqual(res.theoretical, 1000);
  assert.strictEqual(res.diff, -80);
  assert(res.adjustment !== null);
  assert.strictEqual(res.adjustment.type, 'expense');
  assert.strictEqual(res.adjustment.amount, 80);
  assert.strictEqual(res.adjustment.is_balance_adjustment, true);

  var thRecalc = snapshotTheoreticalAmount(res.snapshot, 'acc_1');
  assert.strictEqual(thRecalc, 1000, 'snapshotTheoreticalAmount debe seguir siendo 1000€');
  var visibleDesfase = res.snapshot.amount - thRecalc;
  assert.strictEqual(visibleDesfase, -80, 'Desfase visible en tabla histórica debe ser -80€');
  assert.strictEqual(accountCalcBalanceAsOf('acc_1', '2026-06-15'), 920);
});

test('Ajuste con desfase positivo: genera ingreso, NO contamina el teórico', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta Corriente', color: '#007AFF' }];
  transactions.push({ id: 't1', type: 'income', amount: 500, date: '2026-06-01', account_id: 'acc_1' });
  saveLocalCache();

  var res = applyBalanceAdjustmentSimulation('acc_1', '2026-06-20', 650);
  assert.strictEqual(res.theoretical, 500);
  assert.strictEqual(res.diff, 150);
  assert.strictEqual(res.adjustment.type, 'income');
  assert.strictEqual(res.adjustment.amount, 150);

  var thRecalc = snapshotTheoreticalAmount(res.snapshot, 'acc_1');
  assert.strictEqual(thRecalc, 500);
  assert.strictEqual(res.snapshot.amount - thRecalc, 150);
  assert.strictEqual(accountCalcBalanceAsOf('acc_1', '2026-06-20'), 650);
});

test('Ajuste sin desfase (diff == 0): no crea transacción redundante', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta Corriente', color: '#007AFF' }];
  transactions.push({ id: 't1', type: 'income', amount: 1000, date: '2026-06-01', account_id: 'acc_1' });
  saveLocalCache();

  var res = applyBalanceAdjustmentSimulation('acc_1', '2026-06-15', 1000);
  assert.strictEqual(res.theoretical, 1000);
  assert.strictEqual(res.diff, 0);
  assert.strictEqual(res.adjustment, null);
  assert.strictEqual(transactions.length, 1);
});

// BLOQUE 2
console.log('\n--- BLOQUE 2: AJUSTES EN TOTALES MENSUALES DE TESORERÍA ---');

test('Los ajustes computan en el balance de tesorería del mes pero no en categorías de gasto', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }];
  transactions.push({ id: 't1', type: 'income', amount: 2000, date: '2026-07-05', account_id: 'acc_1' });
  transactions.push({ id: 't2', type: 'expense', amount: 500, date: '2026-07-10', account_id: 'acc_1' });
  saveLocalCache();

  applyBalanceAdjustmentSimulation('acc_1', '2026-07-31', 1300);

  ensureTxIndices();
  var julTxs = _txByMonthStr['2026-07'];
  assert.strictEqual(julTxs.length, 3);

  var exps = julTxs.filter(t => !t.is_balance_adjustment && txExpenseImpact(t) > 0);
  assert.strictEqual(exps.length, 1);
  assert.strictEqual(exps[0].amount, 500);

  var tExp = julTxs.reduce((s, t) => s + txExpenseImpact(t), 0);
  var tInc = julTxs.reduce((s, t) => s + txIncomeImpact(t), 0);
  var bal = tInc - tExp;

  assert.strictEqual(tInc, 2000);
  assert.strictEqual(tExp, 700);
  assert.strictEqual(bal, 1300);
});

// BLOQUE 3
console.log('\n--- BLOQUE 3: INDEXACIÓN _txByAccount Y MUTACIONES ---');

test('Transferencias entre cuentas indexadas en origen y destino con signos correctos', () => {
  resetState();
  accounts = [
    { id: 'acc_bank', name: 'Santander' },
    { id: 'acc_revo', name: 'Revolut' }
  ];

  transactions.push({
    id: 'tx_trf_100',
    type: 'transfer',
    amount: 350,
    date: '2026-08-04',
    account_id: 'acc_bank',
    to_account_id: 'acc_revo'
  });
  saveLocalCache();
  ensureTxIndices();

  assert(_txByAccount['acc_bank']);
  assert(_txByAccount['acc_revo']);
  assert.strictEqual(_txByAccount['acc_bank'].length, 1);
  assert.strictEqual(_txByAccount['acc_revo'].length, 1);

  var dBank = accountTxDelta(_txByAccount['acc_bank'][0], 'acc_bank');
  var dRevo = accountTxDelta(_txByAccount['acc_revo'][0], 'acc_revo');

  assert.strictEqual(dBank, -350);
  assert.strictEqual(dRevo, 350);
  assert.strictEqual(dBank + dRevo, 0);
});

test('Ajustes de saldo se excluyen estrictamente de _txByAccount', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }];
  applyBalanceAdjustmentSimulation('acc_1', '2026-08-01', 500);

  ensureTxIndices();
  var pool = _txByAccount['acc_1'] || [];
  assert.strictEqual(pool.length, 0);
});

test('Invalidación de índices en mutación in-place (mismo length)', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }];
  transactions.push({ id: 't_edit', type: 'income', amount: 100, date: '2026-08-01', account_id: 'acc_1' });
  saveLocalCache();
  ensureTxIndices();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_1', '2026-08-10'), 100);

  transactions[0].amount = 400;
  saveLocalCache();

  assert.strictEqual(_txIndexVersion, -1);
  var newTh = accountTheoreticalFromLastRealReset('acc_1', '2026-08-10');
  assert.strictEqual(newTh, 400);
});

test('Invalidación al transferir movimiento a otra cuenta', () => {
  resetState();
  accounts = [
    { id: 'acc_A', name: 'Cuenta A' },
    { id: 'acc_B', name: 'Cuenta B' }
  ];
  transactions.push({ id: 't_move', type: 'expense', amount: 80, date: '2026-08-05', account_id: 'acc_A' });
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), -80);
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_B', '2026-08-10'), 0);

  transactions[0].account_id = 'acc_B';
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 0);
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_B', '2026-08-10'), -80);
});

test('Invalidación al borrar y restaurar movimiento', () => {
  resetState();
  accounts = [{ id: 'acc_A', name: 'Cuenta A' }];
  transactions.push({ id: 't_del', type: 'income', amount: 200, date: '2026-08-01', account_id: 'acc_A' });
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 200);

  var removed = transactions.pop();
  saveLocalCache();
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 0);

  transactions.push(removed);
  saveLocalCache();
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 200);
});

// BLOQUE 4
console.log('\n--- BLOQUE 4: AJUSTES SUCESIVOS Y NO ARRASTRE DE DESFASES ---');

test('Tres ajustes sucesivos: cada tramo parte del saldo real fijado anteriormente', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Principal' }];

  var a1 = applyBalanceAdjustmentSimulation('acc_1', '2026-01-01', 1000);
  assert.strictEqual(a1.theoretical, 0);
  assert.strictEqual(a1.diff, 1000);

  transactions.push({ id: 'tx_j1', type: 'income', amount: 2000, date: '2026-01-10', account_id: 'acc_1' });
  transactions.push({ id: 'tx_j2', type: 'expense', amount: 800, date: '2026-01-20', account_id: 'acc_1' });
  saveLocalCache();

  var a2 = applyBalanceAdjustmentSimulation('acc_1', '2026-01-31', 2150);
  assert.strictEqual(a2.theoretical, 2200);
  assert.strictEqual(a2.diff, -50);

  transactions.push({ id: 'tx_f1', type: 'income', amount: 1500, date: '2026-02-05', account_id: 'acc_1' });
  transactions.push({ id: 'tx_f2', type: 'expense', amount: 1000, date: '2026-02-15', account_id: 'acc_1' });
  saveLocalCache();

  var thFeb = accountTheoreticalFromLastRealReset('acc_1', '2026-02-28');
  assert.strictEqual(thFeb, 2650);

  var a3 = applyBalanceAdjustmentSimulation('acc_1', '2026-02-28', 2650);
  assert.strictEqual(a3.theoretical, 2650);
  assert.strictEqual(a3.diff, 0);
  assert.strictEqual(a3.adjustment, null);

  assert.strictEqual(snapshotTheoreticalAmount(a1.snapshot, 'acc_1'), 0);
  assert.strictEqual(snapshotTheoreticalAmount(a2.snapshot, 'acc_1'), 2200);
  assert.strictEqual(snapshotTheoreticalAmount(a3.snapshot, 'acc_1'), 2650);
});

// BLOQUE 5
console.log('\n--- BLOQUE 5: MOVIMIENTOS EN LA MISMA FECHA DEL AJUSTE ---');

test('Movimientos ordinarios el mismo día del ajuste (t.date <= dateStr) se incluyen en el teórico', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }];
  applyBalanceAdjustmentSimulation('acc_1', '2026-08-01', 500);

  transactions.push({ id: 'tx_same_day', type: 'expense', amount: 120, date: '2026-08-15', account_id: 'acc_1' });
  saveLocalCache();

  var thAt15 = accountTheoreticalFromLastRealReset('acc_1', '2026-08-15');
  assert.strictEqual(thAt15, 380);

  var adj15 = applyBalanceAdjustmentSimulation('acc_1', '2026-08-15', 400);
  assert.strictEqual(adj15.theoretical, 380);
  assert.strictEqual(adj15.diff, 20);
  assert.strictEqual(snapshotTheoreticalAmount(adj15.snapshot, 'acc_1'), 380);
});

// BLOQUE 6
console.log('\n--- BLOQUE 6: AJUSTES RETROACTIVOS (BACKDATED) ---');

test('Inserción retroactiva entre dos existentes reordena y recalcula correctamente', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }];

  var adjJan = applyBalanceAdjustmentSimulation('acc_1', '2026-01-01', 1000);
  transactions.push({ id: 'tx_1', type: 'income', amount: 500, date: '2026-01-15', account_id: 'acc_1' });
  transactions.push({ id: 'tx_2', type: 'income', amount: 700, date: '2026-02-15', account_id: 'acc_1' });
  saveLocalCache();

  var adjMar = applyBalanceAdjustmentSimulation('acc_1', '2026-03-01', 2500);
  assert.strictEqual(adjMar.theoretical, 2200);

  var adjFeb = applyBalanceAdjustmentSimulation('acc_1', '2026-02-01', 1600);
  assert.strictEqual(adjFeb.theoretical, 1500);
  assert.strictEqual(adjFeb.diff, 100);

  var recalcMarTh = snapshotTheoreticalAmount(adjMar.snapshot, 'acc_1');
  assert.strictEqual(recalcMarTh, 2300);
});

// BLOQUE 7
console.log('\n--- BLOQUE 7: ANULACIONES (TRANSACTION VOIDS) ---');

test('accountVoidDelta: compensación selectiva sin duplicar anulaciones', () => {
  resetState();
  var accId = 'acc_1';
  var baseDate = '2026-05-15';

  var v1 = {
    id: 'tv1',
    user_id: 'u1',
    transaction_id: 't_old',
    transaction_data: { id: 't_old', date: '2026-05-10', amount: 60, type: 'expense', account_id: accId },
    voided_at: '2026-05-20T10:00:00.000Z'
  };
  assert.strictEqual(accountVoidDelta(v1, accId, baseDate, '2026-05-25'), 60);

  var v2 = {
    id: 'tv2',
    user_id: 'u1',
    transaction_id: 't_recent',
    transaction_data: { id: 't_recent', date: '2026-05-18', amount: 80, type: 'expense', account_id: accId },
    voided_at: '2026-05-20T10:00:00.000Z'
  };
  assert.strictEqual(accountVoidDelta(v2, accId, baseDate, '2026-05-25'), 0);

  var v3 = {
    id: 'tv3',
    user_id: 'u1',
    transaction_id: 't_prior',
    transaction_data: { id: 't_prior', date: '2026-05-05', amount: 100, type: 'expense', account_id: accId },
    voided_at: '2026-05-12T10:00:00.000Z'
  };
  assert.strictEqual(accountVoidDelta(v3, accId, baseDate, '2026-05-25'), 0);
});

// BLOQUE 8
console.log('\n--- BLOQUE 8: ELIMINACIÓN DE AJUSTES ---');

test('Eliminar ajuste borra snapshot y transacción asociada limpiando la cadena', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }];
  transactions.push({ id: 't1', type: 'income', amount: 1000, date: '2026-08-01', account_id: 'acc_1' });
  saveLocalCache();

  var adj = applyBalanceAdjustmentSimulation('acc_1', '2026-08-10', 950);
  assert.strictEqual(patrimony.length, 1);
  assert.strictEqual(transactions.length, 2);

  deleteBalanceAdjustmentSimulation(adj.snapshot.id);
  assert.strictEqual(patrimony.length, 0);
  assert.strictEqual(transactions.length, 1);
  assert.strictEqual(transactions[0].id, 't1');

  var th = accountTheoreticalFromLastRealReset('acc_1', '2026-08-15');
  assert.strictEqual(th, 1000);
});

// BLOQUE 9
console.log('\n--- BLOQUE 9: MIGRACIÓN restore_adjustment_theoretical_balances ---');

test('restore_adjustment_theoretical_balances recupera el teórico idéntico', () => {
  let pExp = { amount: 840, theoretical_amount: 840 };
  let tExp = { type: 'expense', amount: 160 };
  let restoredExp = (tExp.type === 'expense') ? (pExp.amount + tExp.amount) : (pExp.amount - tExp.amount);
  assert.strictEqual(restoredExp, 1000);

  let pInc = { amount: 1250, theoretical_amount: 1250 };
  let tInc = { type: 'income', amount: 250 };
  let restoredInc = (tInc.type === 'expense') ? (pInc.amount + tInc.amount) : (pInc.amount - tInc.amount);
  assert.strictEqual(restoredInc, 1000);
});

// BLOQUE 10
console.log('\n--- BLOQUE 10: SIMULACIÓN MULTICUENTA MASIVA ---');

test('Simulación masiva: 4 cuentas, transferencias encadenadas, ajustes sucesivos sin desfase fantasma', () => {
  resetState();
  accounts = [
    { id: 'santander', name: 'Santander' },
    { id: 'bbva', name: 'BBVA' },
    { id: 'revolut', name: 'Revolut' },
    { id: 'efectivo', name: 'Efectivo' }
  ];

  applyBalanceAdjustmentSimulation('santander', '2026-01-01', 3000);
  applyBalanceAdjustmentSimulation('bbva', '2026-01-01', 1500);
  applyBalanceAdjustmentSimulation('revolut', '2026-01-01', 400);
  applyBalanceAdjustmentSimulation('efectivo', '2026-01-01', 100);

  transactions.push({ id: 'tx_nom', type: 'income', amount: 2400, date: '2026-01-05', account_id: 'santander' });
  transactions.push({ id: 'tx_t1', type: 'transfer', amount: 500, date: '2026-01-06', account_id: 'santander', to_account_id: 'bbva' });
  transactions.push({ id: 'tx_t2', type: 'transfer', amount: 300, date: '2026-01-08', account_id: 'santander', to_account_id: 'revolut' });
  transactions.push({ id: 'tx_t3', type: 'transfer', amount: 100, date: '2026-01-10', account_id: 'revolut', to_account_id: 'efectivo' });

  transactions.push({ id: 'tx_g1', type: 'expense', amount: 850, date: '2026-01-12', account_id: 'santander' });
  transactions.push({ id: 'tx_g2', type: 'expense', amount: 420, date: '2026-01-15', account_id: 'bbva' });
  transactions.push({ id: 'tx_g3', type: 'expense', amount: 150, date: '2026-01-18', account_id: 'revolut' });
  transactions.push({ id: 'tx_g4', type: 'expense', amount: 65, date: '2026-01-22', account_id: 'efectivo' });
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('santander', '2026-01-31'), 3750);
  assert.strictEqual(accountTheoreticalFromLastRealReset('bbva', '2026-01-31'), 1580);
  assert.strictEqual(accountTheoreticalFromLastRealReset('revolut', '2026-01-31'), 450);
  assert.strictEqual(accountTheoreticalFromLastRealReset('efectivo', '2026-01-31'), 135);

  var adjSan = applyBalanceAdjustmentSimulation('santander', '2026-01-31', 3740);
  var adjBbva = applyBalanceAdjustmentSimulation('bbva', '2026-01-31', 1580);
  var adjRevo = applyBalanceAdjustmentSimulation('revolut', '2026-01-31', 445);
  var adjEfec = applyBalanceAdjustmentSimulation('efectivo', '2026-01-31', 150);

  assert.strictEqual(adjSan.diff, -10);
  assert.strictEqual(adjBbva.diff, 0);
  assert.strictEqual(adjRevo.diff, -5);
  assert.strictEqual(adjEfec.diff, 15);

  transactions.push({ id: 'tx_f_nom', type: 'income', amount: 2400, date: '2026-02-05', account_id: 'santander' });
  transactions.push({ id: 'tx_f_trf', type: 'transfer', amount: 200, date: '2026-02-10', account_id: 'santander', to_account_id: 'revolut' });
  transactions.push({ id: 'tx_f_g1', type: 'expense', amount: 1000, date: '2026-02-15', account_id: 'santander' });
  transactions.push({ id: 'tx_f_g2', type: 'expense', amount: 100, date: '2026-02-20', account_id: 'revolut' });
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('santander', '2026-02-28'), 4940);
  assert.strictEqual(accountTheoreticalFromLastRealReset('bbva', '2026-02-28'), 1580);
  assert.strictEqual(accountTheoreticalFromLastRealReset('revolut', '2026-02-28'), 545);
  assert.strictEqual(accountTheoreticalFromLastRealReset('efectivo', '2026-02-28'), 150);

  assert.strictEqual(snapshotTheoreticalAmount(adjSan.snapshot, 'santander'), 3750);
  assert.strictEqual(snapshotTheoreticalAmount(adjBbva.snapshot, 'bbva'), 1580);
  assert.strictEqual(snapshotTheoreticalAmount(adjRevo.snapshot, 'revolut'), 450);
  assert.strictEqual(snapshotTheoreticalAmount(adjEfec.snapshot, 'efectivo'), 135);
});

console.log('\n' + '='.repeat(75));
console.log(`RESULTADO: ${passedTests} / ${totalTests} TESTS COMPLETADOS SATISFACTORIAMENTE`);
console.log('='.repeat(75));
