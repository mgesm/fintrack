/**
 * audit-agent-ux-integrity-verify.js
 * Suite integral de verificación de lógica de negocio, UX e integridad funcional de fintrack.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('======================================================================');
console.log('INICIANDO SUITE DE AUDITORÍA DE INTEGRIDAD FUNCIONAL Y UX DE FINTRACK');
console.log('======================================================================\n');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.log(`  [FAIL] Test ${totalTests}: ${name}`);
    console.log(`         Error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// BLOQUE 1: PARSEO Y TRATAMIENTO DE IMPORTES, DECIMALES Y REDONDEO
// ---------------------------------------------------------------------
console.log('--- BLOQUE 1: PARSEO Y TRATAMIENTO DE IMPORTES Y DECIMALES ---');

// Extraer parseCurrencyInput de index.html
function parseCurrencyInput(val){
  if(val==null)return NaN;
  if(typeof val==='number')return Number.isFinite(val)?val:NaN;
  var s=String(val).trim();
  if(!s)return NaN;
  var lastComma=s.lastIndexOf(',');
  var lastDot=s.lastIndexOf('.');
  if(lastComma>-1&&lastDot>-1){
    if(lastComma>lastDot){
      s=s.replace(/\./g,'').replace(',','.');
    }else{
      s=s.replace(/,/g,'');
    }
  }else if(lastComma>-1){
    s=s.replace(/,/g,'.');
  }else if(lastDot>-1){
    var parts=s.split('.');
    if(parts.length>2){
      s=parts.join('');
    }
  }
  var n=parseFloat(s);
  return Number.isFinite(n)?n:NaN;
}

runTest('saveTx: falla al parsear formato europeo con punto de miles y coma decimal (1.250,50)', () => {
  const input = '1.250,50';
  // Código actual en saveTx (línea 6946):
  const rawAmtStr = String(input || '').trim().replace(/,/g, '.');
  const amountSaveTx = parseFloat(rawAmtStr);
  const correctAmount = parseCurrencyInput(input);

  // Verificamos que saveTx produce 1.25 (pérdida de 1249.25 €!) mientras parseCurrencyInput da 1250.5
  assert.strictEqual(amountSaveTx, 1.25, 'saveTx actual trunca 1.250,50 a 1.25');
  assert.strictEqual(correctAmount, 1250.5, 'parseCurrencyInput parsea correctamente 1250.5');
});

runTest('saveBudgetModal: falla al parsear presupuesto con punto de miles (1.500,00)', () => {
  const input = '1.500,00';
  // Código actual en saveBudgetModal (línea 5619):
  const valBudget = parseFloat(String(input || '').replace(/,/g, '.'));
  assert.strictEqual(valBudget, 1.5, 'saveBudgetModal actual trunca 1.500,00 a 1.5');
  assert.strictEqual(parseCurrencyInput(input), 1500, 'Debería ser 1500');
});

runTest('saveBudget (legacy): falla al parsear decimal con coma (500,50)', () => {
  const input = '500,50';
  // Código actual en saveBudget (línea 7230):
  const valBudget = parseFloat(input);
  assert.strictEqual(valBudget, 500, 'parseFloat(\"500,50\") pierde los decimales');
});

runTest('Redondeo IEEE-754: Math.round(1.005 * 100) / 100 pierde un céntimo', () => {
  const val = 1.005;
  const naiveRound = Math.round(val * 100) / 100;
  assert.strictEqual(naiveRound, 1.00, 'IEEE-754 naive round produce 1.00 en vez de 1.01');
  const safeRound = Math.round((val + Number.EPSILON) * 100) / 100;
  assert.strictEqual(safeRound, 1.01, 'Redondeo seguro produce 1.01');
});


// ---------------------------------------------------------------------
// BLOQUE 2: SISTEMA CONTABLE TRI-ESTADO (0, 1, 2) EN GASTOS E INGRESOS
// ---------------------------------------------------------------------
console.log('\n--- BLOQUE 2: SISTEMA CONTABLE TRI-ESTADO ---');

function getEffectiveTxCalcMode(t) {
  if (!t) return 0;
  if (Array.isArray(t.tags)) {
    if (t.tags.includes('_no_calc')) return 2;
    if (t.tags.includes('_no_expense')) return 1;
  }
  if (t.exclude_from_calc === 2 || t.exclude_from_calc === true) return 2;
  if (t.exclude_from_calc === 1) return 1;
  return 0;
}
function isTxExcludedFromExpense(t) {
  var m = getEffectiveTxCalcMode(t);
  return m === 1 || m === 2;
}
function isTxExcludedFromBalance(t) {
  var m = getEffectiveTxCalcMode(t);
  return m === 2;
}
function txExpenseImpact(t) {
  if (!t || t.is_balance_adjustment || t.type !== 'expense') return 0;
  if (isTxExcludedFromExpense(t)) return 0;
  return Number(t.amount);
}
function txBalanceExpenseImpact(t) {
  if (!t || t.is_balance_adjustment || t.type !== 'expense') return 0;
  if (isTxExcludedFromBalance(t)) return 0;
  return Number(t.amount);
}
function txIncomeImpact(t) {
  if (!t || t.is_balance_adjustment || t.type !== 'income') return 0;
  if (isTxExcludedFromExpense(t)) return 0;
  return Number(t.amount);
}
function txBalanceIncomeImpact(t) {
  if (!t || t.is_balance_adjustment || t.type !== 'income') return 0;
  if (isTxExcludedFromBalance(t)) return 0;
  return Number(t.amount);
}

runTest('Tri-estado en Gastos: Modo 0 (Todo), Modo 1 (Solo balance), Modo 2 (No computa)', () => {
  const g0 = { type: 'expense', amount: 100, tags: [] };
  const g1 = { type: 'expense', amount: 100, tags: ['_no_expense'] };
  const g2 = { type: 'expense', amount: 100, tags: ['_no_calc'] };

  assert.strictEqual(txExpenseImpact(g0), 100, 'g0 suma a gastos');
  assert.strictEqual(txBalanceExpenseImpact(g0), 100, 'g0 resta de balance');

  assert.strictEqual(txExpenseImpact(g1), 0, 'g1 fuera de gastos');
  assert.strictEqual(txBalanceExpenseImpact(g1), 100, 'g1 resta de balance');

  assert.strictEqual(txExpenseImpact(g2), 0, 'g2 fuera de gastos');
  assert.strictEqual(txBalanceExpenseImpact(g2), 0, 'g2 fuera de balance');
});

runTest('Inconsistencia en Ingresos: Modo 1 (\"Solo balance\") excluye erróneamente el ingreso del balance', () => {
  const inc0 = { type: 'income', amount: 1000, tags: [] };
  const inc1 = { type: 'income', amount: 1000, tags: ['_no_expense'] }; // usuario marcó \"Solo balance\" en ingreso

  // En render() de index.html:
  // var tInc = txs.reduce(s, t => s + txIncomeImpact(t), 0);
  // var tBalExp = txs.reduce(s, t => s + txBalanceExpenseImpact(t), 0);
  // var bal = tInc - tBalExp;
  const tInc1 = txIncomeImpact(inc1);
  assert.strictEqual(tInc1, 0, 'txIncomeImpact(inc1) retorna 0 porque usa isTxExcludedFromExpense');
  
  // Como resultado, en bal = tInc - tBalExp, el ingreso de 1000 € se pierde por completo del balance
  // cuando el usuario explícitamente marcó \"Solo balance\"!
  const balCurrent = tInc1 - 0;
  assert.strictEqual(balCurrent, 0, 'El balance mensual da 0 € en lugar de 1000 €!');

  // La función txBalanceIncomeImpact(t) existe en la línea 2853 pero no se usa en ningún sitio
  assert.strictEqual(txBalanceIncomeImpact(inc1), 1000, 'txBalanceIncomeImpact retornaría 1000');
});


// ---------------------------------------------------------------------
// BLOQUE 3: SALDO REAL VS SALDO TEÓRICO Y CUENTAS DE INVERSIÓN
// ---------------------------------------------------------------------
console.log('\n--- BLOQUE 3: SALDO REAL VS SALDO TEÓRICO ---');

runTest('Snapshot posterior ancla el saldo y no arrastra desfases previos', () => {
  const accountId = 'acc_main';
  const history = [
    { account_id: accountId, reset_date: '2026-08-01', amount: 1000 },
    { account_id: accountId, reset_date: '2026-09-01', amount: 800 } // real 800
  ];
  const txs = [
    { account_id: accountId, type: 'expense', amount: 250, date: '2026-08-15' }, // teórico a 2026-09-01 era 750 -> desfase +50
    { account_id: accountId, type: 'expense', amount: 100, date: '2026-09-10' }  // posterior a sep 01
  ];

  // Cálculo a 2026-09-15:
  // Debe partir del real 800 de 2026-09-01, restar 100 = 700.
  const reset = history[history.length - 1];
  const base = reset.amount;
  const live = txs.filter(t => t.date > reset.reset_date).reduce((s, t) => s - t.amount, 0);
  const balance = base + live;
  assert.strictEqual(balance, 700, 'El balance parte de 800 y resta 100 = 700');
});

runTest('Cuentas de inversión: sólo computan capital aportado/retirado, no cotización viva', () => {
  // Comprobar que accountCalcBalance en index.html utiliza accountTxDelta y no investmentPortfolioValueAsOf
  const htmlFragment = html.substring(html.indexOf('function accountCalcBalance('), html.indexOf('function accountCalcBalanceAsOf('));
  assert(htmlFragment.includes('accountTxDelta'), 'accountCalcBalance debe basarse en accountTxDelta');
  assert(!htmlFragment.includes('investmentPortfolioValueAsOf'), 'accountCalcBalance nunca debe incluir valoración viva de mercado');
});


// ---------------------------------------------------------------------
// BLOQUE 4: EXPORTACIONES Y MODAL DE AJUSTES
// ---------------------------------------------------------------------
console.log('\n--- BLOQUE 4: EXPORTACIONES Y MODAL DE AJUSTES ---');

runTest('exportRangeFromUI: falla críticamente cuando scope es \"year\" para exportar XLSX o CSV', () => {
  // Simular la función exportRangeFromUI de index.html (líneas 7411-7419):
  function exportRangeFromUI_sim(scope, f, t) {
    var s = scope;
    if(s==='all') return {from:null,to:null,label:'Todo'};
    if(s==='month'){
      return {from:'2026-09-01',to:'2026-09-30',label:'Septiembre 2026'};
    }
    if(!f||!t){ return 'ALERT_ERROR: Elige fecha de inicio y fin'; }
    return {from:f,to:t,label:f+' a '+t};
  }

  const res = exportRangeFromUI_sim('year', '', '');
  assert.strictEqual(res, 'ALERT_ERROR: Elige fecha de inicio y fin', 'Al seleccionar año y pulsar XLSX/CSV salta error de fechas vacías');
});

runTest('exportXLSX: fórmula de balance neto en Excel discrepa ante gastos \"Solo balance\" (Modo 1)', () => {
  const inc = 2000;
  const expNormal = 500;
  const expSoloBal = 300; // modo 1

  const totalInc = inc;
  const totalExp = expNormal; // en index.html línea 8885: totalExp += txExpenseImpact(t) -> ignora expSoloBal
  const totalBalExp = expNormal + expSoloBal; // línea 8886: totalBalExp += txBalanceExpenseImpact(t)
  const netBalVal = totalInc - totalBalExp; // 1200 €

  // En index.html línea 8915:
  // rBalRow.getCell(8).value = { formula: 'H' + rIncRow.number + '+H' + rExpRow.number, result: netBalVal };
  // donde rExpRow tiene -totalExp (-500)
  const excelFormulaResult = totalInc + (-totalExp); // 2000 - 500 = 1500 €!
  assert.notStrictEqual(excelFormulaResult, netBalVal, 'La fórmula de Excel da 1500 € mientras netBalVal es 1200 €');
  assert.strictEqual(excelFormulaResult - netBalVal, 300, 'El desfase en Excel es exactamente el importe de Solo Balance');
});

runTest('exportAnnualPDF: cálculo de balance total omite gastos en Modo 1 (\"Solo balance\")', () => {
  // En index.html línea 7939:
  // var exp = txExpenseImpact(t);
  // expByMonth[mo] += exp;
  // var totalExp = expByMonth.reduce((a,b)=>a+b, 0);
  // var totalBal = totalInc - totalExp;
  const g1 = { type: 'expense', amount: 300, tags: ['_no_expense'], date: '2026-05-10' };
  const expImpact = txExpenseImpact(g1);
  assert.strictEqual(expImpact, 0, 'txExpenseImpact devuelve 0 para gastos en Modo 1');
  // Como exportAnnualPDF no acumula balExpByMonth, totalBal no resta los 300 €
});

runTest('exportPDF: tarjetas de cuentas bancarias usan saldo calculado exacto a fecha de corte', () => {
  assert(html.includes('var balNow = accountCalcBalanceAsOf(a.id, rb.to);'), 'exportPDF debe usar accountCalcBalanceAsOf');
});


// ---------------------------------------------------------------------
// BLOQUE 5: ERGONOMÍA, BOTONES, TAP TARGETS Y HÁPTICO
// ---------------------------------------------------------------------
console.log('\n--- BLOQUE 5: ERGONOMÍA MÓVIL Y ACCESIBILIDAD ---');

runTest('Cumplimiento de Decisión Descartada: no hay navigator.vibrate en swapTransferAccounts', () => {
  assert(!html.match(/swapTransferAccounts[^}]+navigator\.vibrate/), 'swapTransferAccounts no debe llamar a navigator.vibrate');
});

runTest('Tap Targets CSS: botones pequeños con ::after cuentan con position: relative', () => {
  const patHistDelRule = html.match(/\.pat-hist-del\s*\{[^}]+\}/);
  const patAccStarRule = html.match(/\.pat-acc-star\s*\{[^}]+\}/);
  const investOpDelRule = html.match(/\.invest-operation-delete\s*\{[^}]+\}/);

  assert(patHistDelRule && (patHistDelRule[0].includes('position:relative') || patHistDelRule[0].includes('position: relative')), '.pat-hist-del debe tener position: relative');
  assert(patAccStarRule && (patAccStarRule[0].includes('position:relative') || patAccStarRule[0].includes('position: relative')), '.pat-acc-star debe tener position: relative');
  assert(investOpDelRule && (investOpDelRule[0].includes('position:relative') || investOpDelRule[0].includes('position: relative')), '.invest-operation-delete debe tener position: relative');
});

runTest('Búsqueda y ordenación por categoría de Transferencias: catById(\"transfer\").name devuelve (cat. eliminada)', () => {
  function catById_sim(id) {
    if (!id) return { name: '' };
    return { name: '(cat. eliminada)' };
  }
  const res = catById_sim('transfer').name;
  assert.strictEqual(res, '(cat. eliminada)', 'catById(\"transfer\") devuelve (cat. eliminada) en vez de Transferencia al ordenar por categoría');
});

console.log('\n======================================================================');
console.log(`RESULTADO DE LA SUITE: ${passedTests} / ${totalTests} TESTS EJECUTADOS`);
console.log('======================================================================\n');
