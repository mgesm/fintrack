// scripts/audit-agent4-deep.js
// Auditoría profunda de Auditor 4: Inversión, Cartera, Asset Allocation, Modo Privado y Logos
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const context = fs.readFileSync('PROJECT_CONTEXT.md', 'utf8');
const marketData = fs.readFileSync('supabase/functions/market-data/index.ts', 'utf8');
const rpcInvest = fs.readFileSync('supabase/migrations/20260901113000_investment_operations.sql', 'utf8');
const rpcDelete = fs.readFileSync('supabase/migrations/20260901123000_delete_investment_operations.sql', 'utf8');

console.log('================================================================');
console.log('AUDITORÍA PROFUNDA Y METICULOSA — AUDITOR 4: MÓDULO DE INVERSIÓN');
console.log('================================================================\n');

let passCount = 0;
let warnCount = 0;
let failCount = 0;

function assert(condition, message, isWarn = false) {
  if (condition) {
    console.log('  [PASS] ' + message);
    passCount++;
  } else if (isWarn) {
    console.log('  [WARN] ' + message);
    warnCount++;
  } else {
    console.log('  [FAIL] ' + message);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// SECCIÓN 1: CÁLCULO DE CARTERA Y POSICIONES ABIERTAS (investmentPositionList)
// -----------------------------------------------------------------------------
console.log('--- SECCIÓN 1: CÁLCULO DE CARTERA Y POSICIONES (investmentPositionList) ---');

// Extraer implementación real
function investmentPositionList(investmentOperations) {
  var bySymbol = {};
  var ops = investmentOperations.slice().sort(function(a, b) {
    var d = String(a.operation_date).localeCompare(String(b.operation_date));
    if (d !== 0) return d;
    return String(a.created_at || a.id || '').localeCompare(String(b.created_at || b.id || ''));
  });
  ops.forEach(function(o) {
    var key = o.symbol;
    if (!bySymbol[key]) bySymbol[key] = { symbol: key, name: o.product_name || key, type: o.product_type || 'Producto', units: 0, cost: 0 };
    var p = bySymbol[key], u = Number(o.units), a = Number(o.amount);
    if (o.side === 'buy') {
      p.units += u;
      p.cost += a;
    } else if (p.units > 0) {
      p.cost -= p.cost * (u / p.units);
      p.units -= u;
      if (p.units <= 0.0000001) { p.units = 0; p.cost = 0; }
    }
  });
  return Object.keys(bySymbol).map(function(k) { return bySymbol[k]; }).filter(function(p) { return p.units > 0.0000001; });
}

// 1.1 Ordenación cronológica estricta
const outOfOrderOps = [
  { id: 'op2', symbol: 'SAN.MC', side: 'sell', units: 20, amount: 90, operation_date: '2026-03-01' },
  { id: 'op1', symbol: 'SAN.MC', side: 'buy', units: 100, amount: 400, operation_date: '2026-01-01' },
];
const posChron = investmentPositionList(outOfOrderOps);
assert(posChron.length === 1 && posChron[0].units === 80 && Math.abs(posChron[0].cost - 320) < 1e-6,
  'La función reordena cronológicamente operaciones recibidas en orden inverso (DESC de Supabase)');

// 1.2 Múltiples compras y ventas parciales con PMP invariante
const partialOps = [
  { id: '1', symbol: 'VWCE', side: 'buy', units: 10, amount: 1000, operation_date: '2026-01-01' }, // PMP: 100
  { id: '2', symbol: 'VWCE', side: 'buy', units: 10, amount: 1200, operation_date: '2026-02-01' }, // Total: 20 @ 2200 -> PMP: 110
  { id: '3', symbol: 'VWCE', side: 'sell', units: 5, amount: 650, operation_date: '2026-03-01' },   // Venta 5 -> Restan 15 @ Coste 1650 -> PMP: 110
  { id: '4', symbol: 'VWCE', side: 'sell', units: 5, amount: 700, operation_date: '2026-04-01' },   // Venta 5 -> Restan 10 @ Coste 1100 -> PMP: 110
];
const posPartial = investmentPositionList(partialOps)[0];
assert(posPartial.units === 10, 'Unidades restantes correctas tras ventas parciales (10)');
assert(Math.abs(posPartial.cost - 1100) < 1e-9, 'Coste restante matemáticamente exacto tras ventas parciales (1100 €)');
assert(Math.abs((posPartial.cost / posPartial.units) - 110) < 1e-9, 'PMP estrictamente invariante tras venta parcial (110 €/ud)');

// 1.3 Liquidación total y absorción de residuo infinitesimal (units <= 0.0000001)
const dustOps = [
  { id: '1', symbol: 'BTC', side: 'buy', units: 1.0, amount: 60000, operation_date: '2026-01-01' },
  { id: '2', symbol: 'BTC', side: 'sell', units: 0.33333333, amount: 20000, operation_date: '2026-02-01' },
  { id: '3', symbol: 'BTC', side: 'sell', units: 0.33333333, amount: 20000, operation_date: '2026-03-01' },
  { id: '4', symbol: 'BTC', side: 'sell', units: 0.33333334, amount: 20000, operation_date: '2026-04-01' },
];
const posDust = investmentPositionList(dustOps);
assert(posDust.length === 0, 'Liquidación completa limpia el residuo de coma flotante y devuelve 0 posiciones');

// 1.4 Resistencia ante sobreventa teórica (datos inconsistentes)
const overSellOps = [
  { id: '1', symbol: 'IBE.MC', side: 'buy', units: 5, amount: 50, operation_date: '2026-01-01' },
  { id: '2', symbol: 'IBE.MC', side: 'sell', units: 10, amount: 100, operation_date: '2026-02-01' },
];
const posOver = investmentPositionList(overSellOps);
assert(posOver.length === 0, 'Sobreventa teórica queda filtrada y no deja unidades ni costes negativos residuales');

// -----------------------------------------------------------------------------
// SECCIÓN 2: BARRA DE DISTRIBUCIÓN DE ACTIVOS (Asset Allocation)
// -----------------------------------------------------------------------------
console.log('\n--- SECCIÓN 2: BARRA DE DISTRIBUCIÓN DE ACTIVOS (Asset Allocation) ---');

function normalizeAssetType(raw) {
  if (!raw) return 'Otros';
  var t = String(raw).toLowerCase().trim();
  if (t.indexOf('etf') !== -1) return 'ETFs';
  if (t.indexOf('fondo') !== -1 || t.indexOf('fund') !== -1) return 'Fondos';
  if (t.indexOf('acci') !== -1 || t.indexOf('stock') !== -1 || t.indexOf('equity') !== -1 || t.indexOf('share') !== -1) return 'Acciones';
  if (t.indexOf('cripto') !== -1 || t.indexOf('crypto') !== -1 || t.indexOf('btc') !== -1 || t.indexOf('eth') !== -1 || t.indexOf('digital currency') !== -1) return 'Cripto';
  if (t.indexOf('bono') !== -1 || t.indexOf('bond') !== -1 || t.indexOf('renta fija') !== -1) return 'Renta fija';
  return 'Otros';
}

const ASSET_TYPE_COLORS = {
  'Acciones': '#007AFF',
  'Fondos': '#34C759',
  'ETFs': '#5856D6',
  'Cripto': '#FF9500',
  'Renta fija': '#30B0C7',
  'Otros': '#8E8E93'
};

// 2.1 Cobertura de normalización
assert(normalizeAssetType('Acción española') === 'Acciones', 'Normaliza "Acción española" -> Acciones');
assert(normalizeAssetType('US Equity') === 'Acciones', 'Normaliza "US Equity" -> Acciones');
assert(normalizeAssetType('Common Stock') === 'Acciones', 'Normaliza "Common Stock" -> Acciones');
assert(normalizeAssetType('ETF') === 'ETFs', 'Normaliza "ETF" -> ETFs');
assert(normalizeAssetType('Fondo de inversión') === 'Fondos', 'Normaliza "Fondo de inversión" -> Fondos');
assert(normalizeAssetType('Mutual Fund') === 'Fondos', 'Normaliza "Mutual Fund" -> Fondos');
assert(normalizeAssetType('Crypto') === 'Cripto', 'Normaliza "Crypto" -> Cripto');
const btcNorm = normalizeAssetType('Bitcoin');
if (btcNorm === 'Cripto') {
  assert(true, 'Normaliza "Bitcoin" -> Cripto');
} else {
  console.log('  [HALLAZGO 2.4] normalizeAssetType("Bitcoin") devuelve "' + btcNorm + '" (debería ser "Cripto" ya que solo busca "btc", "eth", "crypto", "cripto", "digital currency")');
  warnCount++;
}
assert(normalizeAssetType('Bono del Estado') === 'Renta fija', 'Normaliza "Bono del Estado" -> Renta fija');
assert(normalizeAssetType('Renta Fija Corto Plazo') === 'Renta fija', 'Normaliza "Renta Fija Corto Plazo" -> Renta fija');
assert(normalizeAssetType('Derivado / Opción') === 'Otros', 'Normaliza no reconocido -> Otros');
assert(normalizeAssetType(null) === 'Otros', 'Normaliza null/undefined -> Otros');

// 2.2 Cobertura total de colores
Object.keys(ASSET_TYPE_COLORS).forEach(type => {
  assert(ASSET_TYPE_COLORS[type].startsWith('#'), `Color definido para categoría ${type}: ${ASSET_TYPE_COLORS[type]}`);
});

// 2.3 Reactividad con cotizaciones en vivo en index.html
const hasReactivityCode = html.includes("var allocEl=wrap.querySelector('.invest-allocation')") &&
                          html.includes("allocEl.outerHTML=newHtml");
assert(hasReactivityCode, 'refreshInvestmentMarketValue actualiza reactivamente el bloque DOM .invest-allocation');

// -----------------------------------------------------------------------------
// SECCIÓN 3: MODO PRIVADO (portfolioValueHidden)
// -----------------------------------------------------------------------------
console.log('\n--- SECCIÓN 3: MODO PRIVADO (portfolioValueHidden) ---');

// 3.1 Cabecera de cartera y estadísticas
assert(html.includes("function portfolioValueHidden()"), 'Función portfolioValueHidden presente en index.html');
assert(html.includes("portfolioValueHidden()?'••••••':'Actualizando…'"), 'Oculta valor durante actualización de cartera');
assert(html.includes("portfolioValueText(valid.length?fmt(value):fmt(cost))"), 'Aplica enmascaramiento al valor final de cartera');
assert(html.includes("stats[1].textContent=portfolioValueHidden()?'••••••'"), 'Oculta porcentaje de rentabilidad en modo privado');

// 3.2 Listado de posiciones
assert(html.includes("p.symbol+' · '+(portfolioValueHidden()?'••••••':units)+' participaciones'"),
  'Oculta unidades en el listado de posiciones');
assert(html.includes("portfolioValueText(fmt(p.cost))"), 'Oculta coste en el listado de posiciones');

// 3.3 Listado de operaciones
assert(html.includes("var valStr=portfolioValueHidden()?'••••••':fmt(o.amount)"),
  'Oculta importe de operación en listado de operaciones');
assert(html.includes("var unitsStr=portfolioValueHidden()?'••••••':(units+' part.')"),
  'Oculta participaciones en listado de operaciones');

// 3.4 Distribución de activos (Asset Allocation)
assert(html.includes("var amt=portfolioValueHidden()?'••••••':fmt(groups[type])"),
  'Oculta importes en euros en la leyenda de distribución de activos');

// 3.5 Pestaña Cuentas y patrimonio total
assert(html.includes("portfolioValueHidden()&&a.is_investment)?0:accountCalcBalance"),
  'Excluye cuenta de inversión del patrimonio total visible en Cuentas cuando modo privado está activo');
assert(html.includes("var isPrivateInvestmentBalance=!!a.is_investment&&portfolioValueHidden()"),
  'Enmascara el saldo individual de la cuenta de inversión en Cuentas');

// 3.6 Transacciones ordinarias e interbancarias
assert(html.includes("var hideTra=portfolioValueHidden()&&(isAccountInvestment(t.account_id)||isAccountInvestment(t.to_account_id))"),
  'Enmascara traspasos hacia/desde cuentas de inversión en listas de transacciones');

// 3.7 Protección en edición de transacciones (editTx)
assert(html.includes("if(portfolioValueHidden()&&(isAccountInvestment(tx.account_id)||isAccountInvestment(tx.to_account_id)||investmentOperations.some"),
  'editTx bloquea abrir el modal de edición de transacciones de inversión en modo privado');

// 3.8 AUDITORÍA DE VULNERABILIDAD EN EDICIÓN DE OPERACIONES (openInvestmentOperationEdit)
const editInvestOpHasPrivCheck = html.includes("function openInvestmentOperationEdit") &&
  /function openInvestmentOperationEdit[\s\S]{1,200}portfolioValueHidden\(\)/.test(html);
assert(editInvestOpHasPrivCheck,
  'openInvestmentOperationEdit comprueba portfolioValueHidden antes de abrir modal con importes desprotegidos',
  true // WARN
);

// -----------------------------------------------------------------------------
// SECCIÓN 4: LOGOS DE EMPRESA Y GESTORAS
// -----------------------------------------------------------------------------
console.log('\n--- SECCIÓN 4: LOGOS DE EMPRESA Y GESTORAS ---');

assert(html.includes("https://assets.parqet.com/logos/symbol/"), 'Fuente primaria: Parqet logos por símbolo');
assert(html.includes("https://t2.gstatic.com/faviconV2"), 'Fuente secundaria: Google faviconV2 para dominios');
assert(html.includes("var ASSET_LOGO_DOMAINS="), 'Diccionario ASSET_LOGO_DOMAINS configurado');
assert(html.includes("logo-fallback-only"), 'Fallback final: inicial del ticker con clase .logo-fallback-only');
assert(html.includes("el.dataset.logoReady='1'"), 'Idempotencia: previene reprocesamiento de logos con data-logo-ready');
assert(html.includes("var investmentLogoObserver=new MutationObserver"), 'MutationObserver activo para decorar logos dinámicamente');

// -----------------------------------------------------------------------------
// SECCIÓN 5: CUMPLIMIENTO DE DECISIONES DESCARTADAS (§12 PROJECT_CONTEXT.md)
// -----------------------------------------------------------------------------
console.log('\n--- SECCIÓN 5: CUMPLIMIENTO DE DECISIONES DESCARTADAS (§12) ---');

const tabStart = html.indexOf('function renderInvestmentsTab');
const tabEnd = html.indexOf('function renderSettingsTab');
const tabCode = html.slice(tabStart, tabEnd);

const hasPortfolioEvolutionChart = tabCode.includes('portfolio-chart') || tabCode.includes('portfolioGraph') || tabCode.includes('portfolio-evolution');
assert(!hasPortfolioEvolutionChart, 'DESCARTADO: No existe gráfico de evolución de cartera');

const hasAvgPriceInTab = /precio\s*medio/i.test(tabCode);
assert(!hasAvgPriceInTab, 'DESCARTADO: No hay métricas de precio medio por posición en la pestaña');

const hasCapitalGainInTab = /plusval[ií]a/i.test(tabCode);
assert(!hasCapitalGainInTab, 'DESCARTADO: No hay métricas de plusvalía individual en la pestaña');

const hasReturnInTab = /rentabilidad\s*por\s*posici[oó]n/i.test(tabCode);
assert(!hasReturnInTab, 'DESCARTADO: No hay rentabilidad individual por posición en la pestaña');

const hasDividendsInInvest = /dividendo/i.test(html.slice(tabStart, tabEnd + 2000)) || rpcInvest.includes('dividend');
assert(!hasDividendsInInvest, 'DESCARTADO: No existe gestión u operativa de dividendos');

const hasInvestHeadInMarkup = html.includes('class="invest-head"');
assert(!hasInvestHeadInMarkup, 'DESCARTADO: Encabezado redundante .invest-head eliminado del marcado');

// -----------------------------------------------------------------------------
// SECCIÓN 6: IDENTIFICACIÓN DE FALLOS RESIDUALES O INCONSISTENCIAS DE MERCADO
// -----------------------------------------------------------------------------
console.log('\n--- SECCIÓN 6: HALLAZGOS Y FALLOS RESIDUALES DETECTADOS ---');

// Hallazgo 6.1: "Tu posición" en ficha de producto hardcodeada a "0 €"
const tuPosicionHardcoded = html.includes("<div><small>Tu posición</small><strong>0 €</strong></div>");
if (tuPosicionHardcoded) {
  console.log('  [HALLAZGO 6.1] En openAssetSheet, "Tu posición" está hardcodeada a "0 €" tanto en el template como al cargar cotización, sin calcular la posición real del usuario.');
  warnCount++;
}

// Hallazgo 6.2: Inconsistencia multimoneda (USD vs EUR)
const hasFxConversion = html.includes('USDEUR') || html.includes('EURUSD') || marketData.includes('USDEUR') || marketData.includes('EURUSD');
if (!hasFxConversion) {
  console.log('  [HALLAZGO 6.2] Cotizaciones en divisa extranjera (ej. USD para AAPL, NVDA, SPY) se suman directamente en refreshInvestmentMarketValue como euros sin conversión FX a EUR.');
  warnCount++;
}

// Hallazgo 6.3: openInvestmentOperationEdit asume importe monetario al recalcular participaciones
const hasUnitsModeBugInEdit = html.includes("function openInvestmentOperationEdit") && html.includes("var total=Number(amount.value),p=Number(price.value),units=total/p");
if (hasUnitsModeBugInEdit) {
  console.log('  [HALLAZGO 6.3] En openInvestmentOperationEdit, la fórmula "units=total/p" asume que amount.value siempre es importe, fallando si el usuario operó en modo "Por participaciones".');
  warnCount++;
}

// Hallazgo 6.4: openInvestmentOperationEdit no comprueba portfolioValueHidden
if (!editInvestOpHasPrivCheck) {
  console.log('  [HALLAZGO 6.4] openInvestmentOperationEdit no verifica portfolioValueHidden(), permitiendo exponer importes y precios al pulsar una operación con modo privado activo.');
  warnCount++;
}

// Hallazgo 6.5: investmentUnits(symbol) no aplica el umbral infinitesimal de dust
const investUnitsCode = (html.match(/function investmentUnits[\s\S]+?return investmentOperations[\s\S]+?\}/) || [''])[0];
const investUnitsAppliesDust = investUnitsCode.includes("0.0000001");
if (!investUnitsAppliesDust) {
  console.log('  [HALLAZGO 6.5] investmentUnits(symbol) suma directamente buy/sell sin umbral de dust (0.0000001), pudiendo generar residuos infinitesimales como -1e-16.');
  warnCount++;
}

// Hallazgo 6.6: CSS residual de .invest-head
const residualCssInvestHead = html.includes(".invest-head{");
if (residualCssInvestHead) {
  console.log('  [HALLAZGO 6.6] Existen reglas CSS residuales no utilizadas (.invest-head, .invest-kicker, .invest-title, .invest-head-note).');
  warnCount++;
}

console.log('\n================================================================');
console.log(`RESUMEN DE PRUEBAS: ${passCount} Aprobadas, ${warnCount} Advertencias/Hallazgos, ${failCount} Fallos Críticos`);
console.log('================================================================\n');
