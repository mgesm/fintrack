/**
 * AUDITORÍA 1: NÚCLEO DE TRANSACCIONES, EDICIÓN, VALIDACIÓN Y BALANCE IMPACT EN FINTRACK
 * Script de simulación y batería de pruebas exhaustiva para auditoría profunda.
 */

const assert = require('assert');

// ---------------------------------------------------------
// 1. EXTRACCIÓN EXACTA DEL MOTOR DESDE INDEX.HTML
// ---------------------------------------------------------

let currentUser = { id: 'usr_audit1' };
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

function txExpenseImpact(t) {
  if (!t) return 0;
  if (t.is_balance_adjustment) return t.type === 'expense' ? Number(t.amount) : -Number(t.amount);
  return t.type === 'expense' ? Number(t.amount) : 0;
}

function txIncomeImpact(t) {
  return t && !t.is_balance_adjustment && t.type === 'income' ? Number(t.amount) : 0;
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

function accountTouchesAccount(t, accountId) {
  return !t.is_balance_adjustment && (
    t.account_id === accountId ||
    t.to_account_id === accountId ||
    (!t.account_id && t.type !== 'transfer' && accounts.length === 1)
  );
}

function accountHistory(accountId) {
  if (_historyCache[accountId]) return _historyCache[accountId];
  return _historyCache[accountId] = patrimony.filter(function(p) { return p.account_id === accountId; }).sort(function(a, b) {
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
  return base + live;
}

function accountCalcTheoreticalAsOf(accountId, dateStr) {
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
  return base + live;
}

function getDefaultAccountId() {
  if (!accounts || !accounts.length) return '';
  var def = accounts.find(function(a) { return a.is_default; });
  if (def) return def.id;
  var nonInv = accounts.find(function(a) { return !a.is_investment; });
  if (nonInv) return nonInv.id;
  return accounts[0].id;
}

// ---------------------------------------------------------
// 2. SIMULACIÓN DE CASOS DE PRUEBA
// ---------------------------------------------------------

const testResults = [];

function runTest(name, fn) {
  try {
    fn();
    testResults.push({ name, status: 'PASS' });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    testResults.push({ name, status: 'FAIL', error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log('===============================================================');
console.log('BATERÍA DE SIMULACIONES AUDITOR 1: NÚCLEO DE TRANSACCIONES');
console.log('===============================================================\n');

// 1. REGLA ESTRICTA DE TRANSFERENCIAS
runTest('Transferencia: impacto cero en gastos y en ingresos del periodo', () => {
  const tra = {
    id: 'tx_tra_1',
    type: 'transfer',
    amount: 150.75,
    category: 'transfer',
    date: '2026-09-05',
    account_id: 'acc_main',
    to_account_id: 'acc_savings'
  };
  assert.strictEqual(txExpenseImpact(tra), 0, 'txExpenseImpact debe ser 0 para transferencia');
  assert.strictEqual(txIncomeImpact(tra), 0, 'txIncomeImpact debe ser 0 para transferencia');
});

runTest('Transferencia: resta exacta en origen y suma exacta en destino', () => {
  accounts = [{ id: 'acc_1', name: 'Cuenta 1' }, { id: 'acc_2', name: 'Cuenta 2' }];
  const tra = {
    id: 'tx_tra_2',
    type: 'transfer',
    amount: 250.00,
    category: 'transfer',
    date: '2026-09-05',
    account_id: 'acc_1',
    to_account_id: 'acc_2'
  };
  const delta1 = accountTxDelta(tra, 'acc_1');
  const delta2 = accountTxDelta(tra, 'acc_2');
  const deltaOther = accountTxDelta(tra, 'acc_3');

  assert.strictEqual(delta1, -250.00, 'Debe restar 250 en origen');
  assert.strictEqual(delta2, 250.00, 'Debe sumar 250 en destino');
  assert.strictEqual(deltaOther, 0, 'No debe afectar a cuentas ajenas');
  assert.strictEqual(delta1 + delta2, 0, 'La suma neta entre ambas cuentas debe ser estrictamente 0');
});

runTest('Transferencia: cuenta origen y destino idénticas', () => {
  const traSame = {
    id: 'tx_tra_same',
    type: 'transfer',
    amount: 100.00,
    account_id: 'acc_1',
    to_account_id: 'acc_1'
  };
  const delta = accountTxDelta(traSame, 'acc_1');
  assert.strictEqual(delta, 0, 'Transferencia con misma cuenta origen y destino resulta en delta 0');
});

// 2. SELECCIÓN DE CUENTAS (ÚNICA VS MÚLTIPLE)
runTest('Cuenta única: transacciones huérfanas sin account_id computan en la única cuenta', () => {
  accounts = [{ id: 'acc_only', name: 'Única' }];
  transactions = [
    { id: 'tx_orphan', type: 'expense', amount: 50.0, date: '2026-09-01', account_id: null }
  ];
  saveLocalCache();
  const bal = accountCalcBalance('acc_only', 2026, 9);
  assert.strictEqual(bal, -50.0, 'Si hay 1 sola cuenta, la transacción sin account_id debe computar en ella');
});

runTest('Cuentas múltiples: transacciones huérfanas quedan desvinculadas de cualquier saldo', () => {
  accounts = [{ id: 'acc_a', name: 'A' }, { id: 'acc_b', name: 'B' }];
  transactions = [
    { id: 'tx_orphan2', type: 'expense', amount: 80.0, date: '2026-09-01', account_id: null }
  ];
  saveLocalCache();
  const balA = accountCalcBalance('acc_a', 2026, 9);
  const balB = accountCalcBalance('acc_b', 2026, 9);
  assert.strictEqual(balA, 0, 'Cuenta A no debe reflejar tx sin account_id');
  assert.strictEqual(balB, 0, 'Cuenta B no debe reflejar tx sin account_id');
  // VULNERABILIDAD / FALLO: En saveTx() no se exige cuenta cuando hay múltiples cuentas,
  // permitiendo que se creen transacciones con account_id = null que no descuentan de ningún saldo.
});

// 3. CÁLCULOS DECIMALES Y REDONDEO
runTest('Redondeo monetario IEEE 754: Math.round(amount * 100) / 100 pierde precisión', () => {
  // Casos típicos donde Math.round falla por precisión binaria
  const amt1 = 1.005;
  const rounded1 = Math.round(amt1 * 100) / 100;
  // 1.005 * 100 = 100.49999999999999 -> Math.round es 100 -> 1.00 en vez de 1.01
  const amt2 = 35.855;
  const rounded2 = Math.round(amt2 * 100) / 100; // 35.85 en vez de 35.86

  console.log(`   Info: Math.round(1.005*100)/100 = ${rounded1} (esperado financiero: 1.01)`);
  console.log(`   Info: Math.round(35.855*100)/100 = ${rounded2} (esperado financiero: 35.86)`);

  function round2(num) {
    return Number(Math.round(Number(num + 'e+2')) + 'e-2');
  }
  assert.strictEqual(round2(1.005), 1.01, 'round2 debe redondear 1.005 a 1.01');
  assert.strictEqual(round2(35.855), 35.86, 'round2 debe redondear 35.855 a 35.86');
});

runTest('Parsing de importes con comas decimales europeas en parseFloat', () => {
  const valComma = '12,50';
  const parsed = parseFloat(valComma);
  // parseFloat("12,50") devuelve 12 en JavaScript
  assert.strictEqual(parsed, 12, 'parseFloat trunca tras la coma, perdiendo 50 céntimos');
  
  // Solución requerida: normalizar coma a punto antes de parseFloat
  const normalized = parseFloat(valComma.replace(',', '.'));
  assert.strictEqual(normalized, 12.50, 'Al reemplazar coma por punto se preservan los decimales');
});

runTest('Parsing de importes con formato de miles europeo (p.ej. 1.250,50)', () => {
  const valThousand = '1.250,50';
  const directParsed = parseFloat(valThousand);
  assert.strictEqual(directParsed, 1.25, 'parseFloat("1.250,50") devuelve 1.25 € en vez de 1250.50 €!');
});

runTest('Importes cero o negativos en validación', () => {
  function validateAmount(val) {
    var amt = parseFloat(String(val).replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) return { valid: false, err: 'introduce un importe válido' };
    return { valid: true, amount: Math.round(amt * 100) / 100 };
  }

  assert.strictEqual(validateAmount(0).valid, false, 'Importe 0 debe ser rechazado');
  assert.strictEqual(validateAmount(-15).valid, false, 'Importe negativo debe ser rechazado');
  assert.strictEqual(validateAmount('abc').valid, false, 'Texto debe ser rechazado');
  assert.strictEqual(validateAmount(Infinity).valid, false, 'Infinity debe ser rechazado');
  assert.strictEqual(validateAmount('15,75').valid, true, '15,75 con normalización es válido');
});

// 4. SANITIZACIÓN DE EXPRESIONES MATEMÁTICAS (calcExpression)
runTest('Inexistencia de calcExpression y comportamiento ante expresiones matemáticas', () => {
  const expr = '15+5';
  const resFloat = parseFloat(expr);
  assert.strictEqual(resFloat, 15, 'parseFloat("15+5") devuelve 15 (ignora +5)');

  // Demostración de calculadora segura sin eval() ni Function()
  function safeCalcExpression(str) {
    if (typeof str !== 'string') return null;
    let s = str.trim().replace(/\s+/g, '').replace(/,/g, '.');
    // Validar caracteres permitidos: dígitos, +, -, *, /, (, ), .
    if (!/^[\d+\-*/().]+$/.test(s)) return null;
    // Evaluar con parser aritmético seguro o regex tokenization
    try {
      // Tokenizar y evaluar respetando precedencia sin eval()
      const tokens = s.match(/(\d+(?:\.\d+)?|[+\-*/()])/g);
      if (!tokens) return null;
      // Operación básica de 2 operandos (a + b, a - b, etc.)
      const simpleMatch = s.match(/^(\d+(?:\.\d+)?)([+\-*/])(\d+(?:\.\d+)?)$/);
      if (simpleMatch) {
        const a = parseFloat(simpleMatch[1]);
        const op = simpleMatch[2];
        const b = parseFloat(simpleMatch[3]);
        let res = 0;
        if (op === '+') res = a + b;
        else if (op === '-') res = a - b;
        else if (op === '*') res = a * b;
        else if (op === '/') res = b !== 0 ? a / b : null;
        return res !== null && Number.isFinite(res) ? Math.round(res * 100) / 100 : null;
      }
      const single = parseFloat(s);
      return Number.isFinite(single) ? Math.round(single * 100) / 100 : null;
    } catch (e) {
      return null;
    }
  }

  assert.strictEqual(safeCalcExpression('15+5'), 20, '15+5 debe calcular 20');
  assert.strictEqual(safeCalcExpression('50*0.21'), 10.5, '50*0.21 debe calcular 10.5');
  assert.strictEqual(safeCalcExpression('alert(1)'), null, 'Código JS malicioso debe ser rechazado');
});

// 5. MANEJO DE ETIQUETAS (TAGS: ARRAY VS JSON VS STRING VS NULL)
runTest('Tags: Array vs String vs null en renderTagsInput y editTx', () => {
  // Simular renderTagsInput con tx.tags = 'vacaciones' (cadena en vez de array)
  const txWithStringTags = { id: 'tx_str_tags', tags: 'vacaciones' };
  let errorCaught = false;
  try {
    let txTags = (txWithStringTags.tags || []).slice();
    // txTags es 'vacaciones' (string)
    txTags.map(g => g); // Lanza TypeError: txTags.map is not a function
  } catch (e) {
    errorCaught = true;
  }
  assert.strictEqual(errorCaught, true, 'String tags provoca caída por TypeError en .map()');

  // Función de sanitización de tags requerida:
  function sanitizeTags(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .filter(t => typeof t === 'string' && t.trim().length > 0)
        .map(t => t.trim().toLowerCase().slice(0, 40));
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return sanitizeTags(parsed);
      } catch (e) {}
      return raw.split(',').map(t => t.trim().toLowerCase().slice(0, 40)).filter(t => t.length > 0);
    }
    return [];
  }

  assert.deepStrictEqual(sanitizeTags('vacaciones, viajes'), ['vacaciones', 'viajes']);
  assert.deepStrictEqual(sanitizeTags('["super", "regalo"]'), ['super', 'regalo']);
  assert.deepStrictEqual(sanitizeTags(null), []);
  assert.deepStrictEqual(sanitizeTags([' TAG1 ', '']), ['tag1']);
});

// 6. SUBCATEGORÍAS Y CONSISTENCIA CON CATEGORÍA PADRE
runTest('Consistencia categoría - subcategoría en edición y guardado', () => {
  categories = [
    { id: 'cat_food', name: 'Comida', subcats: ['supermercado', 'restaurantes'], kind: 'expense' },
    { id: 'cat_car', name: 'Coche', subcats: ['gasolina', 'taller'], kind: 'expense' }
  ];

  // Si una transacción tiene category = 'cat_food' y subcategory = 'gasolina'
  const txInconsistent = {
    id: 'tx_inc_1',
    category: 'cat_food',
    subcategory: 'gasolina'
  };

  const cat = categories.find(c => c.id === txInconsistent.category);
  const isValidSub = cat && cat.subcats.includes(txInconsistent.subcategory);
  assert.strictEqual(isValidSub, false, 'gasolina no pertenece a Comida');

  // En index.html no hay validación en saveTx() que verifique que txSubcat pertenezca a la categoría elegida
});

// 7. FECHAS FUTURAS O INVÁLIDAS
runTest('Fechas futuras dentro del mes corriente afectan inmediatamente al saldo', () => {
  accounts = [{ id: 'acc_main', name: 'Principal' }];
  transactions = [
    { id: 'tx_today', type: 'expense', amount: 100, date: '2026-09-01', account_id: 'acc_main' },
    { id: 'tx_future', type: 'expense', amount: 300, date: '2026-09-28', account_id: 'acc_main' }
  ];
  saveLocalCache();

  // Saldo de septiembre 2026 (cutoff = 2026-10-01)
  const balSep = accountCalcBalance('acc_main', 2026, 9);
  assert.strictEqual(balSep, -400, 'El gasto futuro del 28 de septiembre ya se ha restado del saldo mensual!');

  // Saldo a fecha de hoy (2026-09-05)
  const balAsOfToday = accountCalcTheoreticalAsOf('acc_main', '2026-09-05');
  assert.strictEqual(balAsOfToday, -100, 'El saldo teórico a fecha de hoy sólo computa hasta hoy');
});

runTest('Fechas inválidas o corruptas en transacciones', () => {
  const invalidDates = ['invalid-date', '2026-02-31', '0000-00-00', ''];
  function isValidIsoDate(d) {
    if (!d || typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const parts = d.split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return (
      dateObj.getFullYear() === parts[0] &&
      dateObj.getMonth() === parts[1] - 1 &&
      dateObj.getDate() === parts[2]
    );
  }

  assert.strictEqual(isValidIsoDate('2026-09-05'), true, '2026-09-05 es válida');
  assert.strictEqual(isValidIsoDate('2026-02-31'), false, '2026-02-31 es inválida');
  assert.strictEqual(isValidIsoDate('invalid-date'), false, 'invalid-date es inválida');
});

// 8. BORRADO Y RESTAURACIÓN (deleteTx / restoreTx)
runTest('Borrado ordinario: crea void y elimina tx de memoria', () => {
  accounts = [{ id: 'acc_main', name: 'Principal' }];
  transactions = [
    { id: 'tx_del_1', type: 'expense', amount: 45.0, date: '2026-09-02', account_id: 'acc_main' }
  ];
  saveLocalCache();
  assert.strictEqual(accountCalcBalance('acc_main', 2026, 9), -45.0);

  // Simular borrado de deleteTx
  const tx = transactions.find(t => t.id === 'tx_del_1');
  const voided = {
    id: 'tv_test_1',
    user_id: currentUser.id,
    transaction_id: tx.id,
    transaction_data: Object.assign({}, tx),
    voided_at: new Date().toISOString()
  };
  transactionVoids.push(voided);
  transactions = transactions.filter(t => t.id !== tx.id);
  saveLocalCache();

  assert.strictEqual(transactions.length, 0, 'La transacción ha sido eliminada');
  assert.strictEqual(accountCalcBalance('acc_main', 2026, 9), 0, 'El saldo vuelve a 0');

  // Simular restoreTx
  transactions.unshift(voided.transaction_data);
  transactionVoids = transactionVoids.filter(v => v.transaction_id !== tx.id);
  saveLocalCache();

  assert.strictEqual(transactions.length, 1, 'La transacción ha sido restaurada');
  assert.strictEqual(accountCalcBalance('acc_main', 2026, 9), -45.0, 'El saldo vuelve a -45');
});

// 9. RECONCILIACIÓN Y BALANCE ADJUSTMENTS EN GASTO/INGRESO
runTest('Ajuste de saldo: txExpenseImpact produce gasto negativo para ajuste tipo income', () => {
  const adjExpense = {
    id: 'txbal_1',
    is_balance_adjustment: true,
    type: 'expense',
    amount: 50.0
  };
  const adjIncome = {
    id: 'txbal_2',
    is_balance_adjustment: true,
    type: 'income',
    amount: 75.0
  };

  assert.strictEqual(txExpenseImpact(adjExpense), 50.0, 'Ajuste expense suma al gasto');
  assert.strictEqual(txExpenseImpact(adjIncome), -75.0, 'Ajuste income RESTA del gasto!');
  assert.strictEqual(txIncomeImpact(adjIncome), 0, 'Ajuste income tiene impacto 0 en ingresos');
  // Confirmar que accountTxDelta ignora ajustes de saldo
  assert.strictEqual(accountTxDelta(adjExpense, 'acc_main'), 0, 'accountTxDelta es 0 para ajustes');
});

console.log('\n===============================================================');
const passed = testResults.filter(r => r.status === 'PASS').length;
const failed = testResults.filter(r => r.status === 'FAIL').length;
console.log(`RESUMEN: ${passed} pruebas superadas, ${failed} fallos detectados de ${testResults.length} pruebas.`);
console.log('===============================================================');
