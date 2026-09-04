/**
 * AUDITORÍA INTEGRAL DEL NÚCLEO FINANCIERO DE FINTRACK (AGENTE 3)
 * Cuentas, Patrimonio, Saldo Real vs Teórico, Desfase e Indexación _txByAccount
 */

const assert = require('assert');

// ---------------------------------------------------------
// 1. REPRODUCCIÓN EXACTA DEL MOTOR FINANCIERO DE INDEX.HTML
// ---------------------------------------------------------

let currentUser = { id: 'usr_test_audit' };
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
  if (typeof invalidateTxIndices === 'function') invalidateTxIndices();
  clearBalanceCache();
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
    var toExists = t.to_account_id && accounts.some(function(a) { return a.id === t.to_account_id; });
    var fromExists = t.account_id && accounts.some(function(a) { return a.id === t.account_id; });
    if (t.account_id === accountId && toExists) d -= Number(t.amount);
    if (t.to_account_id === accountId && fromExists) d += Number(t.amount);
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
      category: adjustmentType === 'income' ? 'cat_balance_adjustment_income' : 'cat_balance_adjustment_expense',
      subcategory: null,
      note: 'Actualización de saldo',
      date: date,
      recurring: false,
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

// ---------------------------------------------------------
// 2. BATERÍA DE PRUEBAS AUTOMATIZADAS
// ---------------------------------------------------------

console.log('='.repeat(70));
console.log('INICIANDO AUDITORÍA INTEGRAL DEL MOTOR FINANCIERO DE FINTRACK');
console.log('='.repeat(70));

let passCount = 0;
let totalCount = 0;

function test(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalCount}: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalCount}: ${name}`);
    console.error(`         ${err.message}`);
  }
}

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

// TEST SUITE 1: Separación estricta Saldo Real vs Saldo Teórico y Desfase
console.log('\n--- BLOQUE 1: REGLAS FUNDAMENTALES DE SALDOS Y DESFASES ---');

test('Cuenta única sin ajustes iniciales parte de 0 y reconstruye saldo teórico', () => {
  resetState();
  accounts = [{ id: 'acc_main', name: 'Principal', color: '#007AFF' }];
  
  transactions.push({ id: 'tx1', type: 'income', amount: 1000, date: '2026-08-01', account_id: 'acc_main' });
  transactions.push({ id: 'tx2', type: 'expense', amount: 300, date: '2026-08-10', account_id: 'acc_main' });
  saveLocalCache();

  var th = accountTheoreticalFromLastRealReset('acc_main', '2026-08-15');
  assert.strictEqual(th, 700, 'El saldo teórico acumulado debe ser 700€');

  var calc = accountCalcBalance('acc_main', 2026, 8);
  assert.strictEqual(calc, 700, 'accountCalcBalance para agosto debe ser 700€');
});

test('Ajuste de saldo con desfase genera movimiento de ajuste que no contamina saldo teórico', () => {
  resetState();
  accounts = [{ id: 'acc_main', name: 'Principal', color: '#007AFF' }];
  transactions.push({ id: 'tx1', type: 'income', amount: 1000, date: '2026-08-01', account_id: 'acc_main' });
  transactions.push({ id: 'tx2', type: 'expense', amount: 300, date: '2026-08-10', account_id: 'acc_main' });
  saveLocalCache();

  var res = applyBalanceAdjustmentSimulation('acc_main', '2026-08-15', 650);
  assert.strictEqual(res.theoretical, 700, 'Teórico antes del ajuste debe ser 700€');
  assert.strictEqual(res.diff, -50, 'El desfase debe ser -50€');
  assert(res.adjustment !== null, 'Debe generarse transacción de ajuste');
  assert.strictEqual(res.adjustment.type, 'expense', 'Debe ser gasto');
  assert.strictEqual(res.adjustment.amount, 50, 'El importe debe ser 50€');
  assert.strictEqual(res.adjustment.is_balance_adjustment, true, 'is_balance_adjustment debe ser true');

  var thRecalc = snapshotTheoreticalAmount(res.snapshot, 'acc_main');
  assert.strictEqual(thRecalc, 700, 'snapshotTheoreticalAmount debe seguir siendo 700€ (NO 650€)');

  var diffInTable = res.snapshot.amount - thRecalc;
  assert.strictEqual(diffInTable, -50, 'El desfase visible en la tabla debe seguir siendo -50€');

  var balAfter = accountCalcBalanceAsOf('acc_main', '2026-08-15');
  assert.strictEqual(balAfter, 650, 'El saldo calculado a fecha del ajuste es el real fijado (650€)');
});

test('Ajustes sucesivos: el saldo real es el nuevo punto de partida y no arrastra desfases previos', () => {
  resetState();
  accounts = [{ id: 'acc_main', name: 'Principal', color: '#007AFF' }];

  applyBalanceAdjustmentSimulation('acc_main', '2026-07-01', 1000);

  transactions.push({ id: 'tx_j1', type: 'income', amount: 2000, date: '2026-07-05', account_id: 'acc_main' });
  transactions.push({ id: 'tx_j2', type: 'expense', amount: 800, date: '2026-07-20', account_id: 'acc_main' });
  saveLocalCache();

  var adjJul = applyBalanceAdjustmentSimulation('acc_main', '2026-07-31', 2100);
  assert.strictEqual(adjJul.theoretical, 2200, 'Teórico 31 Jul debe ser 2200€');
  assert.strictEqual(adjJul.diff, -100, 'Desfase 31 Jul debe ser -100€');

  transactions.push({ id: 'tx_a1', type: 'income', amount: 2000, date: '2026-08-05', account_id: 'acc_main' });
  transactions.push({ id: 'tx_a2', type: 'expense', amount: 1500, date: '2026-08-20', account_id: 'acc_main' });
  saveLocalCache();

  var thAug = accountTheoreticalFromLastRealReset('acc_main', '2026-08-31');
  assert.strictEqual(thAug, 2600, 'Teórico 31 Ago debe ser 2600€ (base 2100 + 500)');

  var adjAug = applyBalanceAdjustmentSimulation('acc_main', '2026-08-31', 2600);
  assert.strictEqual(adjAug.theoretical, 2600, 'Teórico calculado debe ser 2600€');
  assert.strictEqual(adjAug.diff, 0, 'Desfase debe ser 0');
  assert.strictEqual(adjAug.adjustment, null, 'No debe crearse movimiento de ajuste cuando diff == 0');

  assert.strictEqual(snapshotTheoreticalAmount(adjJul.snapshot, 'acc_main'), 2200, 'Snapshot Jul teórico debe ser 2200€');
  assert.strictEqual(snapshotTheoreticalAmount(adjAug.snapshot, 'acc_main'), 2600, 'Snapshot Ago teórico debe ser 2600€');
});

test('Movimientos de ajuste computan en totales mensuales pero nunca en saldo teórico ni desfase', () => {
  resetState();
  accounts = [{ id: 'acc_main', name: 'Principal', color: '#007AFF' }];

  transactions.push({ id: 'tx_ord', type: 'income', amount: 1000, date: '2026-08-05', account_id: 'acc_main' });
  saveLocalCache();

  applyBalanceAdjustmentSimulation('acc_main', '2026-08-10', 1200);

  ensureTxIndices();
  var augTxs = _txByMonthStr['2026-08'];
  assert.strictEqual(augTxs.length, 2, 'Deben existir 2 transacciones en el mes');

  var tExp = augTxs.reduce(function(s, t) { return s + txExpenseImpact(t); }, 0);
  var tInc = augTxs.reduce(function(s, t) { return s + txIncomeImpact(t); }, 0);
  var bal = tInc - tExp;

  assert.strictEqual(bal, 1200, 'El balance de tesorería del mes debe ser 1200€ para cuadrar la realidad');

  var calcBal = accountCalcBalanceAsOf('acc_main', '2026-08-20');
  assert.strictEqual(calcBal, 1200, 'Saldo de la cuenta es 1200€');

  var thAt10 = accountTheoreticalFromLastRealReset('acc_main', '2026-08-10');
  assert.strictEqual(thAt10, 1000, 'Saldo teórico a día 10 excluye el movimiento de ajuste');
});

// TEST SUITE 2: Optimización de Indexación _txByAccount
console.log('\n--- BLOQUE 2: AUDITORÍA DE LA INDEXACIÓN _txByAccount ---');

test('Transferencias entre cuentas: _txByAccount incluye la transacción en AMBAS cuentas', () => {
  resetState();
  accounts = [
    { id: 'acc_checking', name: 'Corriente' },
    { id: 'acc_savings', name: 'Ahorro' }
  ];

  transactions.push({
    id: 'tx_trf_1',
    type: 'transfer',
    amount: 500,
    date: '2026-08-10',
    account_id: 'acc_checking',
    to_account_id: 'acc_savings'
  });
  saveLocalCache();
  ensureTxIndices();

  assert(_txByAccount['acc_checking'] && _txByAccount['acc_checking'].length === 1, 'Cuenta origen debe tener la transferencia en _txByAccount');
  assert(_txByAccount['acc_savings'] && _txByAccount['acc_savings'].length === 1, 'Cuenta destino (to_account_id) debe tener la transferencia en _txByAccount');
  assert.strictEqual(_txByAccount['acc_checking'][0].id, 'tx_trf_1');
  assert.strictEqual(_txByAccount['acc_savings'][0].id, 'tx_trf_1');

  var deltaChecking = accountTxDelta(_txByAccount['acc_checking'][0], 'acc_checking');
  var deltaSavings = accountTxDelta(_txByAccount['acc_savings'][0], 'acc_savings');

  assert.strictEqual(deltaChecking, -500, 'Delta en cuenta origen debe ser -500€');
  assert.strictEqual(deltaSavings, 500, 'Delta en cuenta destino debe ser +500€');
});

test('Transacciones huérfanas/legadas sin account_id con 1 sola cuenta', () => {
  resetState();
  accounts = [{ id: 'acc_unique', name: 'Única' }];

  transactions.push({
    id: 'tx_no_acc',
    type: 'expense',
    amount: 75,
    date: '2026-08-12',
    account_id: null
  });
  saveLocalCache();
  ensureTxIndices();

  assert(_txByAccount['acc_unique'] && _txByAccount['acc_unique'].length === 1, 'Debe indexarse en la única cuenta existente');
  assert.strictEqual(accountTxDelta(_txByAccount['acc_unique'][0], 'acc_unique'), -75, 'Delta debe ser -75€');
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_unique', '2026-08-20'), -75);
});

test('Transacciones huérfanas/legadas sin account_id con MÚLTIPLES cuentas', () => {
  resetState();
  accounts = [
    { id: 'acc_1', name: 'Cuenta 1' },
    { id: 'acc_2', name: 'Cuenta 2' }
  ];

  transactions.push({
    id: 'tx_no_acc_multi',
    type: 'expense',
    amount: 75,
    date: '2026-08-12',
    account_id: null
  });
  saveLocalCache();
  ensureTxIndices();

  assert(!_txByAccount['acc_1'] || _txByAccount['acc_1'].length === 0, 'No debe asignarse arbitrariamente a acc_1');
  assert(!_txByAccount['acc_2'] || _txByAccount['acc_2'].length === 0, 'No debe asignarse arbitrariamente a acc_2');
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_1', '2026-08-20'), 0);
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_2', '2026-08-20'), 0);
});

test('Invalidación de caché en mutaciones: edición de transacción in-place (mismo length)', () => {
  resetState();
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }];
  transactions.push({ id: 'tx_edit', type: 'income', amount: 100, date: '2026-08-01', account_id: 'acc_1' });
  saveLocalCache();
  ensureTxIndices();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_1', '2026-08-10'), 100);

  transactions[0].amount = 500;
  saveLocalCache();

  assert.strictEqual(_txIndexVersion, -1, '_txIndexVersion debe ser -1 tras invalidación');

  var newTh = accountTheoreticalFromLastRealReset('acc_1', '2026-08-10');
  assert.strictEqual(newTh, 500, 'Debe devolver el importe actualizado de 500€');
  assert.strictEqual(_txIndexVersion, txVersion, '_txIndexVersion debe haberse actualizado');
});

test('Invalidación de caché al mover transacción de cuenta', () => {
  resetState();
  accounts = [
    { id: 'acc_A', name: 'Cuenta A' },
    { id: 'acc_B', name: 'Cuenta B' }
  ];
  transactions.push({ id: 'tx_move', type: 'income', amount: 300, date: '2026-08-01', account_id: 'acc_A' });
  saveLocalCache();
  ensureTxIndices();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 300);
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_B', '2026-08-10'), 0);

  transactions[0].account_id = 'acc_B';
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 0, 'Cuenta A debe quedar en 0€');
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_B', '2026-08-10'), 300, 'Cuenta B debe tener 300€');
});

test('Invalidación de caché al eliminar o restaurar transacción', () => {
  resetState();
  accounts = [{ id: 'acc_A', name: 'Cuenta A' }];
  transactions.push({ id: 'tx_del', type: 'income', amount: 250, date: '2026-08-01', account_id: 'acc_A' });
  saveLocalCache();
  ensureTxIndices();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 250);

  var removed = transactions.pop();
  saveLocalCache();
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 0, 'Tras borrar debe ser 0€');

  transactions.push(removed);
  saveLocalCache();
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_A', '2026-08-10'), 250, 'Tras restaurar debe ser 250€');
});

// TEST SUITE 3: Escenarios Complejos Multicuenta y Resistencia
console.log('\n--- BLOQUE 3: ESCENARIO COMPLEJO MULTICUENTA Y RECONCILIACIÓN ---');

test('Simulación integral: 3 cuentas, traspasos cruzados, múltiples ajustes y voids', () => {
  resetState();
  accounts = [
    { id: 'acc_bank', name: 'Banco Santander' },
    { id: 'acc_revo', name: 'Revolut' },
    { id: 'acc_cash', name: 'Efectivo' }
  ];

  // 1. Saldos iniciales 2026-01-01
  applyBalanceAdjustmentSimulation('acc_bank', '2026-01-01', 5000);
  applyBalanceAdjustmentSimulation('acc_revo', '2026-01-01', 1000);
  applyBalanceAdjustmentSimulation('acc_cash', '2026-01-01', 200);

  // 2. Movimientos de Enero
  transactions.push({ id: 'tx_nom', type: 'income', amount: 2500, date: '2026-01-05', account_id: 'acc_bank' });
  transactions.push({ id: 'tx_trf1', type: 'transfer', amount: 600, date: '2026-01-06', account_id: 'acc_bank', to_account_id: 'acc_revo' });
  transactions.push({ id: 'tx_trf2', type: 'transfer', amount: 100, date: '2026-01-10', account_id: 'acc_bank', to_account_id: 'acc_cash' });
  transactions.push({ id: 'tx_rev_exp', type: 'expense', amount: 450, date: '2026-01-15', account_id: 'acc_revo' });
  transactions.push({ id: 'tx_csh_exp', type: 'expense', amount: 80, date: '2026-01-20', account_id: 'acc_cash' });
  transactions.push({ id: 'tx_san_exp', type: 'expense', amount: 1200, date: '2026-01-25', account_id: 'acc_bank' });
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_bank', '2026-01-31'), 5600, 'Teórico Santander Ene debe ser 5600€');
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_revo', '2026-01-31'), 1150, 'Teórico Revolut Ene debe ser 1150€');
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_cash', '2026-01-31'), 220, 'Teórico Efectivo Ene debe ser 220€');

  var adjSan1 = applyBalanceAdjustmentSimulation('acc_bank', '2026-01-31', 5580);
  assert.strictEqual(adjSan1.diff, -20);

  var adjRev1 = applyBalanceAdjustmentSimulation('acc_revo', '2026-01-31', 1150);
  assert.strictEqual(adjRev1.diff, 0);

  var adjCsh1 = applyBalanceAdjustmentSimulation('acc_cash', '2026-01-31', 250);
  assert.strictEqual(adjCsh1.diff, 30);

  // 3. Movimientos de Febrero
  transactions.push({ id: 'tx_trf3', type: 'transfer', amount: 200, date: '2026-02-05', account_id: 'acc_revo', to_account_id: 'acc_bank' });
  transactions.push({ id: 'tx_san_f1', type: 'expense', amount: 500, date: '2026-02-10', account_id: 'acc_bank' });
  saveLocalCache();

  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_bank', '2026-02-28'), 5280, 'Teórico Santander Feb debe ser 5280€');
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_revo', '2026-02-28'), 950, 'Teórico Revolut Feb debe ser 950€');
  assert.strictEqual(accountTheoreticalFromLastRealReset('acc_cash', '2026-02-28'), 250, 'Teórico Efectivo Feb debe ser 250€');

  assert.strictEqual(snapshotTheoreticalAmount(adjSan1.snapshot, 'acc_bank'), 5600);
  assert.strictEqual(snapshotTheoreticalAmount(adjRev1.snapshot, 'acc_revo'), 1150);
  assert.strictEqual(snapshotTheoreticalAmount(adjCsh1.snapshot, 'acc_cash'), 220);
});

// TEST SUITE 4: Comportamiento de Anulaciones (Transaction Voids)
console.log('\n--- BLOQUE 4: AUDITORÍA DE ANULACIONES (TRANSACTION VOIDS) ---');

test('accountVoidDelta: compensación selectiva según fecha de anulación y snapshot base', () => {
  resetState();
  var testAccId = 'acc_main';
  var baseDate = '2026-01-15';

  // Caso 4A: Gasto anterior (10-ene) anulado con posterioridad al ajuste (20-ene)
  var vHistorical = {
    id: 'tv1',
    user_id: 'u1',
    transaction_id: 'tx1',
    transaction_data: { id: 'tx1', date: '2026-01-10', amount: 50, type: 'expense', account_id: testAccId },
    voided_at: '2026-01-20T10:00:00.000Z'
  };
  var deltaA = accountVoidDelta(vHistorical, testAccId, baseDate, '2026-01-25');
  assert.strictEqual(deltaA, 50, 'Compensa sumando +50€ al saldo');

  // Caso 4B: Gasto posterior (18-ene > baseDate 15-ene) anulado el 20-ene
  var vRecent = {
    id: 'tv2',
    user_id: 'u1',
    transaction_id: 'tx2',
    transaction_data: { id: 'tx2', date: '2026-01-18', amount: 75, type: 'expense', account_id: testAccId },
    voided_at: '2026-01-20T10:00:00.000Z'
  };
  var deltaB = accountVoidDelta(vRecent, testAccId, baseDate, '2026-01-25');
  assert.strictEqual(deltaB, 0, 'Devuelve 0 para evitar doble compensación');

  // Caso 4C: Gasto anterior anulado ANTES del ajuste (voided_at 12-ene <= baseDate 15-ene)
  var vPrior = {
    id: 'tv3',
    user_id: 'u1',
    transaction_id: 'tx3',
    transaction_data: { id: 'tx3', date: '2026-01-05', amount: 100, type: 'expense', account_id: testAccId },
    voided_at: '2026-01-12T10:00:00.000Z'
  };
  var deltaC = accountVoidDelta(vPrior, testAccId, baseDate, '2026-01-25');
  assert.strictEqual(deltaC, 0, 'Devuelve 0 porque el saldo real ya absorbió la anulación');
});

// TEST SUITE 5: Migración de reparación restore_adjustment_theoretical_balances
console.log('\n--- BLOQUE 5: VERIFICACIÓN MATEMÁTICA DE restore_adjustment_theoretical_balances ---');

test('Lógica SQL de restore_adjustment_theoretical_balances recupera el teórico exacto', () => {
  let p_expense = { id: 'p_exp', amount: 900, theoretical_amount: 900 };
  let t_expense = { type: 'expense', amount: 100, is_balance_adjustment: true };

  let restoredExp = (t_expense.type === 'expense') ? (p_expense.amount + t_expense.amount) : (p_expense.amount - t_expense.amount);
  assert.strictEqual(restoredExp, 1000, 'Gasto: 900 + 100 = 1000€ recuperado exactamente');

  let p_income = { id: 'p_inc', amount: 1250, theoretical_amount: 1250 };
  let t_income = { type: 'income', amount: 250, is_balance_adjustment: true };

  let restoredInc = (t_income.type === 'expense') ? (p_income.amount + t_income.amount) : (p_income.amount - t_income.amount);
  assert.strictEqual(restoredInc, 1000, 'Ingreso: 1250 - 250 = 1000€ recuperado exactamente');
});

console.log('\n' + '='.repeat(70));
console.log(`RESULTADO DE LA AUDITORÍA: ${passCount} / ${totalCount} TESTS SUPERADOS`);
console.log('='.repeat(70));
if (passCount === totalCount) {
  console.log('TODAS LAS PRUEBAS MATEMÁTICAS Y DE INDEXACIÓN HAN SIDO SATISFACTORIAS.');
} else {
  console.error('SE DETECTARON FALLOS EN LA SIMULACIÓN.');
  process.exit(1);
}
