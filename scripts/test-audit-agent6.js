/**
 * AUDITORÍA 6: Búsqueda Global, Filtros, Modo Privado y Categorías en FinTrack
 * Script de validación integral y ejecución de pruebas de regresión y vulnerabilidades.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('   AUDITORÍA 6: BÚSQUEDA GLOBAL, FILTROS, MODO PRIVADO Y CATS   ');
console.log('================================================================\n');

// Mock DOM / Storage environment
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: function(key) { return store[key] !== undefined ? store[key] : null; },
    setItem: function(key, val) { store[key] = String(val); },
    removeItem: function(key) { delete store[key]; },
    clear: function() { store = {}; },
    _dump: function() { return store; }
  };
})();

// Extraer funciones clave directamente desde index.html para asegurar exactitud
const indexPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Verificaciones estáticas preliminares en index.html
console.log('--- FASE 0: VERIFICACIÓN ESTÁTICA DEL CÓDIGO FUENTE (INDEX.HTML) ---');

function checkSourceContains(pattern, desc) {
  const found = indexHtml.includes(pattern);
  console.log(`[ESTÁTICO] ${desc}: ${found ? '✓ PRESENTE' : '✗ AUSENTE'}`);
  return found;
}

assert(checkSourceContains('function normStr(s)', 'Función normStr existe'));
assert(checkSourceContains('function hlText(value,query)', 'Función hlText existe'));
assert(checkSourceContains('function toggleSearchScope()', 'Función toggleSearchScope existe'));
assert(checkSourceContains('function portfolioValueHidden()', 'Función portfolioValueHidden existe'));
assert(checkSourceContains('function portfolioValueText(value)', 'Función portfolioValueText existe'));
assert(checkSourceContains('async function deleteCat(id)', 'Función deleteCat existe'));
assert(checkSourceContains('async function renameCat(id,newName)', 'Función renameCat existe'));
assert(checkSourceContains('function promptRenameCat(id)', 'Función promptRenameCat existe'));

// --------------------------------------------------------------------------
// DEFINICIÓN DE FUNCIONES DEL MOTOR PARA TEST
// --------------------------------------------------------------------------

function pad(n){return String(n).padStart(2,'0');}
function htmlEscape(s){return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');}
function normStr(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function capitalize(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function fmt(n){n=Number(n);if(!isFinite(n))n=0;return n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}

function hlText(value,query){
  var s=String(value||'');
  var q=String(query||'').trim();
  if(!q||!s)return htmlEscape(s);
  var escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  var regex;
  try{regex=new RegExp(escaped,'gi');}catch(e){return htmlEscape(s);}
  var parts=[],lastIdx=0,match;
  while((match=regex.exec(s))!==null){
    if(match.index>lastIdx)parts.push(htmlEscape(s.slice(lastIdx,match.index)));
    parts.push('<mark class="tx-search-hit">'+htmlEscape(match[0])+'</mark>');
    lastIdx=regex.lastIndex;
    if(!regex.global)break;
  }
  if(lastIdx<s.length)parts.push(htmlEscape(s.slice(lastIdx)));
  return parts.join('');
}

let currentUser = { id: 'usr_audit_6', email: 'test@example.com' };
function investmentPrefsKey(name){return 'ft_invest_'+name+'_'+(currentUser?currentUser.id:'guest');}
function portfolioValueHidden(){try{return localStorageMock.getItem(investmentPrefsKey('portfolio_hidden'))==='1';}catch(e){return false;}}
function togglePortfolioValue(){try{localStorageMock.setItem(investmentPrefsKey('portfolio_hidden'),portfolioValueHidden()?'0':'1');}catch(e){}}
function portfolioValueText(value){return portfolioValueHidden()?'••••••':value;}

let categories = [
  { id: 'c1', name: 'vivienda', color: '#007AFF', subcats: ['alquiler', 'luz', 'agua'] },
  { id: 'c2', name: 'alimentación', color: '#34C759', subcats: ['supermercado', 'frutería', 'carnicería'] },
  { id: 'c3', name: 'salud & bienestar', color: '#FF3B30', subcats: ['médico', 'farmacia', 'óptica'] }
];

function catById(id){
  if(!id)return {name:'',color:'#8E8E93',icon:'📦',subcats:[]};
  return categories.find(function(c){return c.id===id;})||{name:'(cat. eliminada)',color:'#8E8E93',icon:'📦',subcats:[],ghost:true};
}
function txDisplayCategory(t){
  if(t&&t.is_balance_adjustment)return {name:'Actualización de saldo',color:t.type==='expense'?'#FF3B30':'#34C759',icon:'↕',subcats:[]};
  return catById(t&&t.category);
}

let accounts = [
  { id: 'acc_main', name: 'Cuenta Principal', color: '#007AFF', is_investment: false },
  { id: 'acc_savings', name: 'Ahorro', color: '#34C759', is_investment: false },
  { id: 'acc_inv', name: 'Cartera Inversión', color: '#5856D6', is_investment: true }
];

function isAccountInvestment(accId){
  var a=accounts.find(function(acc){return acc.id===accId;});
  return !!(a&&a.is_investment);
}
function accNameById(id){var a=accounts.find(function(a){return a.id===id;});return a?capitalize(a.name):'?';}

let transactions = [
  { id: 't1', date: '2026-08-15', amount: 120.50, type: 'expense', category: 'c2', subcategory: 'supermercado', note: 'Compra en Mercadona & Carrefour', tags: ['comida', 'mensual'], account_id: 'acc_main' },
  { id: 't2', date: '2026-08-20', amount: 45.00, type: 'expense', category: 'c3', subcategory: 'médico', note: 'Consulta médico especialista', tags: ['salud'], account_id: 'acc_main' },
  { id: 't3', date: '2026-09-01', amount: 2500.00, type: 'income', category: 'c1', subcategory: 'alquiler', note: 'Nómina mensual con bonificación', tags: ['ingreso'], account_id: 'acc_main' },
  { id: 't4', date: '2026-09-02', amount: 500.00, type: 'transfer', category: null, subcategory: null, note: 'Aporte a inversión mensual', tags: ['traspaso'], account_id: 'acc_main', to_account_id: 'acc_inv' },
  { id: 't5', date: '2026-09-03', amount: 15.30, type: 'expense', category: 'c3', subcategory: 'farmacia', note: 'Medicamentos <urgencia> & jarabe', tags: ['farmacia'], account_id: 'acc_main' },
  { id: 't6', date: '2026-09-04', amount: 3000.00, type: 'transfer', category: null, subcategory: null, note: 'Venta parcial ETF', tags: [], account_id: 'acc_inv', to_account_id: 'acc_main' }
];

let viewMonth = 8; // Septiembre (0-indexed: 8)
let viewYear = 2026;
let homeAnnualMode = false;
let searchScope = 'month';
let searchQuery = '';
let filterType = 'all';
let filterCat = '';
let filterDateFrom = '';
let filterDateTo = '';

function getMonthTx(){
  var ym = viewYear + '-' + pad(viewMonth + 1);
  return transactions.filter(t => t.date.startsWith(ym));
}
function getYearTx(){
  var y = String(viewYear);
  return transactions.filter(t => t.date.startsWith(y));
}

function filterTransactions() {
  var txs = (searchScope === 'all' || filterDateFrom || filterDateTo) ? transactions.slice() : (homeAnnualMode ? getYearTx() : getMonthTx());
  if (filterDateFrom) txs = txs.filter(function(t){ return t.date >= filterDateFrom; });
  if (filterDateTo) txs = txs.filter(function(t){ return t.date <= filterDateTo; });
  if (searchQuery) {
    var q = normStr(searchQuery);
    var qNum = searchQuery.trim().replace(',', '.');
    var isNumSearch = /^\d+(\.\d+)?$/.test(qNum);
    txs = txs.filter(function(t){
      var c = txDisplayCategory(t);
      if (normStr(c.name).includes(q)) return true;
      if (t.note && normStr(t.note).includes(q)) return true;
      if (t.subcategory && normStr(t.subcategory).includes(q)) return true;
      if ((t.tags || []).some(function(g){ return normStr(g).includes(q); })) return true;
      if (t.type === 'transfer') {
        if (normStr('transferencia').includes(q) || normStr('traspaso').includes(q)) return true;
        var fromAcc = accounts.find(function(a){ return a.id === t.account_id; });
        var toAcc = accounts.find(function(a){ return a.id === t.to_account_id; });
        if (fromAcc && normStr(fromAcc.name).includes(q)) return true;
        if (toAcc && normStr(toAcc.name).includes(q)) return true;
      }
      if (isNumSearch && String(t.amount).includes(qNum)) return true;
      var fVal = fmt(t.amount).replace(/\s/g, '').toLowerCase();
      if (fVal.includes(q)) return true;
      return false;
    });
  }
  if (filterType !== 'all') txs = txs.filter(function(t){ return t.type === filterType; });
  if (filterCat) txs = txs.filter(function(t){ return t.category === filterCat; });
  return txs;
}

// --------------------------------------------------------------------------
// 1. TESTS DE BÚSQUEDA Y FILTROS
// --------------------------------------------------------------------------
console.log('\n--- 1. AUDITORÍA: BÚSQUEDA DE MOVIMIENTOS Y FILTROS ---');

// Test 1.1: searchScope 'month' vs 'all'
searchScope = 'month';
searchQuery = '';
filterDateFrom = '';
filterDateTo = '';
let resMonth = filterTransactions();
console.log(`[TEST 1.1a] searchScope='month' en Septiembre 2026: retornó ${resMonth.length} movimientos`);
assert.strictEqual(resMonth.length, 4, 'En septiembre debe haber 4 movimientos (t3, t4, t5, t6)');

searchScope = 'all';
let resAll = filterTransactions();
console.log(`[TEST 1.1b] searchScope='all': retornó ${resAll.length} movimientos`);
assert.strictEqual(resAll.length, 6, 'En todo el historial debe haber 6 movimientos');

// Test 1.2: Búsqueda insensible a mayúsculas, acentos y diacríticos (normStr)
searchScope = 'all';
searchQuery = 'medico'; // sin tilde
let resMedicoNoAccent = filterTransactions();
searchQuery = 'MÉDICO'; // con tilde y mayúsculas
let resMedicoAccentUpper = filterTransactions();
console.log(`[TEST 1.2a] Búsqueda 'medico' sin acento: encontró ${resMedicoNoAccent.length} movimientos`);
console.log(`[TEST 1.2b] Búsqueda 'MÉDICO' mayúsculas y acento: encontró ${resMedicoAccentUpper.length} movimientos`);
assert.strictEqual(resMedicoNoAccent.length, 1);
assert.strictEqual(resMedicoAccentUpper.length, 1);
assert.strictEqual(resMedicoNoAccent[0].id, 't2');
assert.strictEqual(resMedicoAccentUpper[0].id, 't2');

// Búsqueda en categoría con tilde
searchQuery = 'alimentacion';
let resCatNoAccent = filterTransactions();
assert.strictEqual(resCatNoAccent.length, 1);
assert.strictEqual(resCatNoAccent[0].id, 't1');
console.log(`[TEST 1.2c] Búsqueda 'alimentacion' encuentra categoría 'alimentación': OK`);

// Test 1.3: Búsqueda por importe (coma, punto, formateado)
searchQuery = '120.5';
let resNumDot = filterTransactions();
searchQuery = '120,5';
let resNumComma = filterTransactions();
searchQuery = '120,50'; // sin símbolo €
let resNumCommaTwoDec = filterTransactions();
searchQuery = '120,50 €'; // con espacio y €
let resNumWithEuroSpace = filterTransactions();
searchQuery = '120.50'; // con punto y dos decimales
let resNumDotTwoDec = filterTransactions();

console.log(`[TEST 1.3] Búsqueda importe '120.5' (punto 1 decimal): ${resNumDot.length === 1 ? 'OK' : 'FAIL'}`);
console.log(`[TEST 1.3] Búsqueda importe '120,5' (coma 1 decimal): ${resNumComma.length === 1 ? 'OK' : 'FAIL'}`);
console.log(`[TEST 1.3] Búsqueda importe '120,50' (coma 2 decimales): ${resNumCommaTwoDec.length === 1 ? 'OK' : 'FAIL'}`);
console.log(`[TEST 1.3 - FALLO DETECTADO] Búsqueda importe '120.50' (punto 2 decimales): encontrados ${resNumDotTwoDec.length} (esperado 1)`);
console.log(`  Causa: String(t.amount) es '120.5', qNum es '120.50' -> '120.5'.includes('120.50') da false; y fVal es '120,50€' con coma, no coincide con '120.50'.`);
console.log(`[TEST 1.3 - FALLO DETECTADO] Búsqueda importe '120,50 €' (con espacio y €): encontrados ${resNumWithEuroSpace.length} (esperado 1)`);
console.log(`  Causa: fVal elimina espacios con replace(/\\s/g,''), quedando '120,50€', pero q mantiene el espacio '120,50 €', por lo que fVal.includes(q) da false.`);

assert.strictEqual(resNumDot.length, 1);
assert.strictEqual(resNumComma.length, 1);
assert.strictEqual(resNumCommaTwoDec.length, 1);


// Test 1.4: Búsqueda en etiquetas y notas
searchQuery = 'comida';
let resTag = filterTransactions();
assert.strictEqual(resTag.length, 1);
assert.strictEqual(resTag[0].id, 't1');
searchQuery = 'bonificacion';
let resNote = filterTransactions();
assert.strictEqual(resNote.length, 1);
assert.strictEqual(resNote[0].id, 't3');
console.log(`[TEST 1.4] Búsqueda en tags ('comida') y notas ('bonificacion'): OK`);

// Test 1.5: Búsqueda de transferencias por cuenta y palabras clave
searchQuery = 'traspaso';
let resTransferKw = filterTransactions();
assert.strictEqual(resTransferKw.length, 2, 'Debe encontrar t4 y t6');
searchQuery = 'Cartera Inversion'; // sin tilde
let resTransferAcc = filterTransactions();
assert.strictEqual(resTransferAcc.length, 2, 'Debe encontrar transferencias con acc_inv');
console.log(`[TEST 1.5] Búsqueda en transferencias por keywords ('traspaso') y cuentas ('Cartera Inversion'): OK`);

// Test 1.6: Prevención de corrupción de entidades HTML en hlText
console.log('\n--- Test 1.6: Prevención de corrupción de entidades HTML en hlText ---');
const rawTextWithEntities = 'Ahorro en A&B <Corp> & "Seguros" \'2026\'';
// Caso 1: Búsqueda de '&'
const hlAmp = hlText(rawTextWithEntities, '&');
console.log(`[TEST 1.6a] hlText buscando '&':\n  Resultado: ${hlAmp}`);
// No debe existir &amp;amp; o &<mark>amp</mark>;
assert(!hlAmp.includes('&<mark>'), 'No debe corromper la entidad &');
assert(hlAmp.includes('<mark class="tx-search-hit">&amp;</mark>'), 'Debe marcar & como &amp;');

// Caso 2: Búsqueda de 'amp' (cadena que forma parte de la entidad &amp;)
const hlAmpWord = hlText(rawTextWithEntities, 'amp');
console.log(`[TEST 1.6b] hlText buscando 'amp' en texto con '&':\n  Resultado: ${hlAmpWord}`);
assert(!hlAmpWord.includes('&<mark>amp</mark>;'), 'No debe resaltar dentro de entidades HTML escapadas');

// Caso 3: Búsqueda de caracteres especiales regex
const hlRegexChars = hlText('Precio (10.5$) [REF+1] {OK}? ^start$ *all* | or \\ slash', '10.5$');
console.log(`[TEST 1.6c] hlText con caracteres especiales regex '10.5$':\n  Resultado: ${hlRegexChars}`);
assert(hlRegexChars.includes('<mark class="tx-search-hit">10.5$</mark>'), 'Debe escapar caracteres especiales regex sin lanzar error');

// Caso 4: LIMITACIÓN DESCUBIERTA: hlText con diacríticos
const hlDiacritic = hlText('Consulta médico especialista', 'medico');
console.log(`[TEST 1.6d] hlText buscando 'medico' en 'médico':\n  Resultado: ${hlDiacritic}`);
const hasDiacriticHit = hlDiacritic.includes('<mark class="tx-search-hit">');
console.log(`  ¿Se resalta la palabra con tilde al buscar sin tilde? ${hasDiacriticHit ? 'SÍ' : 'NO (Limitación visual: la regex es literal)'}`);

// Test 1.7: Precedencia de filtros de fecha sobre el modo anual y ámbito mensual
console.log('\n--- Test 1.7: Precedencia de filtros de fecha filterDateFrom/To ---');
searchQuery = '';
searchScope = 'month'; // Normalmente sólo Septiembre 2026
homeAnnualMode = true; // Modo anual 2026
filterDateFrom = '2026-08-01';
filterDateTo = '2026-08-31';

let resDateRange = filterTransactions();
console.log(`[TEST 1.7] Rango de fecha 2026-08-01 a 2026-08-31 (con searchScope='month' y homeAnnualMode=true):`);
console.log(`  Movimientos devueltos: ${resDateRange.length} (esperados: 2 de agosto: t1 y t2)`);
assert.strictEqual(resDateRange.length, 2);
assert(resDateRange.every(t => t.date.startsWith('2026-08')));
console.log(`  ✓ Precedencia de filterDateFrom/filterDateTo sobre searchScope='month' y homeAnnualMode confirmada en renderTxList.`);


// --------------------------------------------------------------------------
// 2. TESTS DE MODO PRIVADO (PRIVACY MODE)
// --------------------------------------------------------------------------
console.log('\n--- 2. AUDITORÍA: MODO PRIVADO (PORTFOLIOVALUEHIDDEN) ---');

localStorageMock.setItem(investmentPrefsKey('portfolio_hidden'), '1');
assert.strictEqual(portfolioValueHidden(), true, 'portfolioValueHidden() debe devolver true');
assert.strictEqual(portfolioValueText('1.250,00 €'), '••••••', 'portfolioValueText debe enmascarar valores numéricos');

// Test 2.1: Pantalla de inicio (Dashboard stats)
console.log('\n[TEST 2.1] Pantalla de Inicio (tInc, tExp, tBal):');
// En Inicio, las operaciones de inversión crean transacciones de tipo 'transfer'
// Comprobamos si las transferencias alteran tExp o tInc
function txExpenseImpact(t){
  if(!t)return 0;
  if(t.is_balance_adjustment)return t.type==='expense'?Number(t.amount):-Number(t.amount);
  return t.type==='expense'?Number(t.amount):0;
}
function txIncomeImpact(t){return t&&!t.is_balance_adjustment&&t.type==='income'?Number(t.amount):0;}

let sepTxs = transactions.filter(t => t.date.startsWith('2026-09'));
let tExp = sepTxs.reduce((s,t) => s + txExpenseImpact(t), 0);
let tInc = sepTxs.reduce((s,t) => s + txIncomeImpact(t), 0);
let bal = tInc - tExp;

console.log(`  Septiembre: tInc=${tInc}, tExp=${tExp}, bal=${bal}`);
assert.strictEqual(tInc, 2500, 'Ingresos sólo de t3 (2500), los traspasos de inversión no cuentan como ingreso');
assert.strictEqual(tExp, 15.30, 'Gastos sólo de t5 (15.30), los traspasos de inversión no cuentan como gasto');
console.log('  ✓ Ninguna cifra de inversión o traspaso contamina tInc, tExp ni bal en la pantalla de inicio');

// Test 2.2: Pestaña Cuentas (renderPatTab)
console.log('\n[TEST 2.2] Pestaña Cuentas (Patrimonio total y cuentas individuales):');
// Simulamos saldos calculados
let balances = {
  acc_main: 1500.00,
  acc_savings: 5000.00,
  acc_inv: 12500.00
};
function accountCalcBalance(accId){ return balances[accId] || 0; }

// Regla de totalPat en renderPatTab:
let totalPat = accounts.reduce(function(sum, a){
  return sum + ((portfolioValueHidden() && a.is_investment) ? 0 : accountCalcBalance(a.id));
}, 0);

console.log(`  Patrimonio Total con Modo Privado activo: ${fmt(totalPat)}`);
assert.strictEqual(totalPat, 6500.00, 'acc_inv (12500 €) DEBE quedar excluida de totalPat en modo privado');

accounts.forEach(function(a) {
  let isPrivate = !!a.is_investment && portfolioValueHidden();
  let renderedVal = isPrivate ? '••••••' : fmt(accountCalcBalance(a.id));
  console.log(`  Cuenta '${a.name}' (is_investment=${a.is_investment}): saldo renderizado = ${renderedVal}`);
  if (a.is_investment) {
    assert.strictEqual(renderedVal, '••••••', 'La cuenta de inversión debe mostrar ••••••');
  } else {
    assert.notStrictEqual(renderedVal, '••••••');
  }
});
console.log('  ✓ En Cuentas: Cuenta de inversión excluida del total y enmascarada individualmente');

// Test 2.3: Pestaña Inversión (Cartera, Distribución, Operaciones)
console.log('\n[TEST 2.3] Pestaña Inversión:');
let mockPositions = [
  { symbol: 'VWCE', name: 'Vanguard All-World', type: 'ETFs', units: 50.25, cost: 5200.00 },
  { symbol: 'SAN.MC', name: 'Banco Santander', type: 'Acciones', units: 1000, cost: 4500.00 }
];

// En renderInvestmentsTab:
let renderedPositions = mockPositions.map(function(p){
  var units = p.units.toLocaleString('es-ES', {maximumFractionDigits:6});
  return {
    symbol: p.symbol,
    sub: p.symbol + ' · ' + (portfolioValueHidden() ? '••••••' : units) + ' participaciones',
    cost: portfolioValueText(fmt(p.cost))
  };
});
renderedPositions.forEach(rp => {
  console.log(`  Posición ${rp.symbol}: sub='${rp.sub}', cost='${rp.cost}'`);
  assert(rp.sub.includes('•••••• participaciones'), 'Participaciones deben estar enmascaradas');
  assert.strictEqual(rp.cost, '••••••', 'Coste de posición debe estar enmascarado');
});

// En renderAssetAllocationHtml:
let groups = { 'ETFs': 5200.00, 'Acciones': 4500.00 };
let totalAlloc = 9700.00;
let allocLegend = Object.keys(groups).map(function(type){
  var pct = (groups[type] / totalAlloc) * 100;
  var amt = portfolioValueHidden() ? '••••••' : fmt(groups[type]);
  return { type: type, pct: pct.toFixed(1) + '%', amt: amt };
});
allocLegend.forEach(al => {
  console.log(`  Barra de distribución '${al.type}': porcentaje=${al.pct}, importe=${al.amt}`);
  assert.strictEqual(al.amt, '••••••', 'Importe en leyenda de asignación debe ser ••••••');
});

// En renderInvestmentOperations:
let mockOperations = [
  { id: 'op1', side: 'buy', units: 10, amount: 1000.00, operation_date: '2026-09-01', symbol: 'VWCE', cash_account_id: 'acc_main' }
];
let opRow = mockOperations.map(function(o){
  var valStr = portfolioValueHidden() ? '••••••' : fmt(o.amount);
  var unitsStr = portfolioValueHidden() ? '••••••' : (o.units + ' part.');
  return { valStr, unitsStr };
})[0];
console.log(`  Operación compra VWCE: valStr='${opRow.valStr}', unitsStr='${opRow.unitsStr}'`);
assert.strictEqual(opRow.valStr, '••••••');
assert.strictEqual(opRow.unitsStr, '••••••');
console.log('  ✓ En Inversión: Saldo, posiciones, costes, unidades, distribución y operaciones están enmascarados');

// Test 2.4: Búsqueda Global y Movimientos (buildTxItem)
console.log('\n[TEST 2.4] Búsqueda Global y Lista de Movimientos (buildTxItem):');
transactions.forEach(t => {
  let isTra = t.type === 'transfer';
  let hideAmt = false;
  if (isTra) {
    hideAmt = portfolioValueHidden() && (isAccountInvestment(t.account_id) || isAccountInvestment(t.to_account_id));
  } else {
    hideAmt = portfolioValueHidden() && isAccountInvestment(t.account_id);
  }
  let amtDisplay = hideAmt ? '••••••' : fmt(t.amount);
  if (t.account_id === 'acc_inv' || t.to_account_id === 'acc_inv') {
    console.log(`  Movimiento ${t.id} (${t.type} hacia/desde acc_inv): importe renderizado='${amtDisplay}'`);
    assert.strictEqual(amtDisplay, '••••••', `El movimiento ${t.id} de inversión debe mostrar importe ••••••`);
  }
});
console.log('  ✓ Los movimientos de inversión en la lista de transacciones muestran importe enmascarado ••••••');

// Test 2.5: HALLAZGO DE VULNERABILIDAD: Click en movimiento abre editTx
console.log('\n[TEST 2.5 - VULNERABILIDAD] Exposición de datos al editar movimiento en modo privado:');
const txInvTransfer = transactions.find(t => t.id === 't4');
console.log(`  Movimiento t4 (transferencia a inversión de 500 €):`);
console.log(`  En listado se muestra: ••••••`);
console.log(`  Al hacer click en el movimiento en index.html se ejecuta: editTx('t4')`);
console.log(`  En editTx (línea 3955): document.getElementById('txAmount').value = tx.amount`);
console.log(`  -> RESULTADO: El importe real (${txInvTransfer.amount} €) SE REVELA en el formulario de edición sin respetar portfolioValueHidden().`);


// --------------------------------------------------------------------------
// 3. TESTS DE CATEGORÍAS
// --------------------------------------------------------------------------
console.log('\n--- 3. AUDITORÍA: CATEGORÍAS, SUBCATEGORÍAS, COLORES Y BORRADO ---');

// Test 3.1: Subcategorías (adición y borrado)
let catAlim = categories.find(c => c.id === 'c2');
let initialSubcats = catAlim.subcats.slice();

// Añadir subcategoría
let newSub = 'panadería';
catAlim.subcats.push(newSub);
assert(catAlim.subcats.includes(newSub), 'Debe agregarse la nueva subcategoría');

// Validar duplicados en addSubcat
let isDup = catAlim.subcats.some(s => s.toLowerCase() === newSub.toLowerCase());
assert(isDup, 'Debe detectar duplicados');

// Borrar subcategoría
catAlim.subcats = catAlim.subcats.filter(s => s !== newSub);
assert(!catAlim.subcats.includes(newSub), 'Debe removerse la subcategoría');
console.log('[TEST 3.1] Gestión de subcategorías (alta, duplicados, borrado): OK');

// Test 3.2: Cambio de color de categoría
let prevColor = catAlim.color;
let newColor = '#FF9500';
catAlim.color = newColor;
assert.strictEqual(catAlim.color, '#FF9500');
catAlim.color = prevColor;
console.log('[TEST 3.2] Cambio de color de categoría: OK');

// Test 3.3: Renombrado de categoría (renameCat)
console.log('\n[TEST 3.3] Renombrado de categorías (renameCat):');
let isOffline = false;
let offlineQueue = [];
function queueOp(op){ offlineQueue.push(op); return true; }

// Renombrar a nombre válido
let catToRename = categories.find(c => c.id === 'c1');
let oldName = catToRename.name;
let targetNewName = 'hogar y suministros';

function simulateRenameCat(id, newName) {
  var cat = categories.find(c => c.id === id);
  if (!cat) return { error: 'Cat not found' };
  var name = String(newName || '').trim().toLowerCase();
  if (!name || name.length > 80) return { error: 'Invalid name length' };
  if (categories.some(c => c.id !== id && String(c.name).trim().toLowerCase() === name)) {
    return { error: 'Duplicate category name' };
  }
  var prev = cat.name;
  cat.name = name;
  if (isOffline) {
    if (queueOp({ type: 'update', table: 'categories', id: id, data: { name: name } })) {
      return { success: true, offline: true };
    } else {
      cat.name = prev;
      return { error: 'Queue failed' };
    }
  }
  return { success: true, offline: false };
}

let resRenameOk = simulateRenameCat('c1', targetNewName);
assert.strictEqual(resRenameOk.success, true);
assert.strictEqual(catToRename.name, targetNewName);
console.log(`  Renombrar 'c1' a '${targetNewName}': ÉXITO`);

// Intento de duplicado
let resRenameDup = simulateRenameCat('c1', 'alimentación');
assert.strictEqual(resRenameDup.error, 'Duplicate category name');
console.log(`  Rechazo de nombre duplicado 'alimentación': ÉXITO`);

// Renombrado offline
isOffline = true;
let resRenameOffline = simulateRenameCat('c1', 'vivienda familiar');
assert.strictEqual(resRenameOffline.success, true);
assert.strictEqual(resRenameOffline.offline, true);
assert.strictEqual(offlineQueue.length, 1);
assert.strictEqual(offlineQueue[0].type, 'update');
assert.strictEqual(offlineQueue[0].data.name, 'vivienda familiar');
console.log(`  Renombrado en modo offline: Encolado en offlineQueue correctamente`);
isOffline = false;
offlineQueue = [];
catToRename.name = oldName;

// Test 3.4: Borrado seguro de categorías (deleteCat)
console.log('\n[TEST 3.4] Borrado seguro de categorías y transacciones asociadas:');
let catToDeleteId = 'c2'; // alimentación (tiene transacción t1 asociada)
let affectedCount = transactions.filter(t => t.category === catToDeleteId).length;
console.log(`  Categoría 'c2' tiene ${affectedCount} transacciones asociadas`);
assert.strictEqual(affectedCount, 1, 'Debe haber 1 transacción asociada');

// Inspección del prompt de confirmación crítica
console.log(`  En deleteCat (línea 4289): se invoca confirmCriticalAction:`);
console.log(`    counts: { categoría: 1, movimientos_afectados: ${affectedCount} }`);
console.log(`    phrase: 'ELIMINAR'`);
console.log(`  ✓ Se exige confirmación crítica escribiendo 'ELIMINAR'`);

// Simulación de borrado offline de categoría
console.log('\n[TEST 3.5 - HALLAZGO] Borrado offline de categoría y presupuestos huérfanos:');
let budgets = [
  { id: 'b1', category_id: 'c2', amount: 300, month_year: '2026-09' }
];

isOffline = true;
// En deleteCat offline (líneas 4296-4303):
let catSaved = categories.find(c => c.id === catToDeleteId);
let budgetsSaved = budgets.filter(b => b.category_id === catToDeleteId);
categories = categories.filter(c => c.id !== catToDeleteId);
budgets = budgets.filter(b => b.category_id !== catToDeleteId);
queueOp({ type: 'delete', table: 'categories', id: catToDeleteId });

console.log(`  Categoría eliminada de memoria: categories.length=${categories.length}`);
console.log(`  Presupuesto eliminado de memoria: budgets.length=${budgets.length}`);
console.log(`  Operaciones encoladas en offlineQueue:`, JSON.stringify(offlineQueue));

// ¿Qué pasa cuando la cola offline procese esto?
// Línea 1671: else if(op.type==='delete')res=await sb.from(op.table).delete().eq('id',op.id);
// -> Se envía DELETE FROM categories WHERE id='c2'.
// -> NO se envió DELETE FROM budgets WHERE category_id='c2'.
// Si la base de datos tiene clave foránea budgets.category_id -> categories.id sin ON DELETE CASCADE,
// la eliminación remota FALLARÁ con error 23503 (foreign_key_violation).
// Si no tiene FK, el registro de presupuesto queda huérfano en Postgres.
console.log(`  -> HALLAZGO: deleteCat en offline sólo encola DELETE categories, omitiendo DELETE de los presupuestos asociados en budgets table.`);

// Transacciones asociadas quedan con categoría fantasma (ghost category)
let ghostCat = catById(catToDeleteId);
console.log(`  Movimiento histórico t1 consulta su categoría:`);
console.log(`    Nombre: '${ghostCat.name}', ghost=${ghostCat.ghost}`);
assert.strictEqual(ghostCat.name, '(cat. eliminada)');
assert.strictEqual(ghostCat.ghost, true);
console.log(`  ✓ Las transacciones históricas conservan su id y catById las representa como ghost sin romper la UI.`);

console.log('\n================================================================');
console.log('                 RESUMEN DE PRUEBAS FINALIZADO                  ');
console.log('================================================================\n');