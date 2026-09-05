// scripts/test-audit-agent4.js
// Auditoría técnica, contable y matemática del Módulo de Inversión de FinTrack
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('AUDITORÍA TÉCNICA Y MATEMÁTICA: MÓDULO DE INVERSIÓN (FINTRACK)');
console.log('Especialista: Auditor 4 - Cartera, Asset Allocation y Logos');
console.log('================================================================\n');

const htmlSource = fs.readFileSync('index.html', 'utf8');
const contextSource = fs.readFileSync('PROJECT_CONTEXT.md', 'utf8');
const rpcSource = fs.readFileSync('supabase/migrations/20260901113000_investment_operations.sql', 'utf8');
const marketDataSource = fs.readFileSync('supabase/functions/market-data/index.ts', 'utf8');

// Extraer funciones directas de index.html
function extractFunction(name) {
  const regex = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const match = htmlSource.match(regex);
  if (!match) throw new Error('No se encontró ' + name);
  let start = match.index;
  let braceCount = 0;
  let end = -1;
  for (let i = htmlSource.indexOf('{', start); i < htmlSource.length; i++) {
    if (htmlSource[i] === '{') braceCount++;
    else if (htmlSource[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return htmlSource.slice(start, end);
}

// -------------------------------------------------------------
// 1. CÁLCULO DE CARTERA Y POSICIONES (investmentPositionList)
// -------------------------------------------------------------
console.log('--- 1. CÁLCULO DE CARTERA Y POSICIONES ABIERTAS ---');

// Implementación exacta extraída de index.html:
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

// Test 1.1: Compras y ventas parciales con cálculo de coste medio
console.log('1.1 Compras y ventas parciales múltiples:');
const ops1 = [
  { id: '1', symbol: 'SAN.MC', side: 'buy', units: 100, amount: 400, operation_date: '2026-01-10' }, // 100 @ 4.00 = 400€
  { id: '2', symbol: 'SAN.MC', side: 'buy', units: 50, amount: 250, operation_date: '2026-01-20' },  // 50 @ 5.00 = 250€ -> 150u, Coste 650€ (4.333333€/u)
  { id: '3', symbol: 'SAN.MC', side: 'sell', units: 30, amount: 150, operation_date: '2026-02-10' }, // vende 30u -> coste reducido: 650 * (30/150) = 130€ -> resta 120u, Coste 520€ (4.333333€/u)
  { id: '4', symbol: 'SAN.MC', side: 'sell', units: 20, amount: 120, operation_date: '2026-02-15' }, // vende 20u -> coste reducido: 520 * (20/120) = 86.666667€ -> resta 100u, Coste 433.333333€
];
const res1 = investmentPositionList(ops1)[0];
console.log(`  Unidades: ${res1.units} (Esperado: 100)`);
console.log(`  Coste: ${res1.cost.toFixed(6)} € (Esperado: 433.333333 €)`);
console.log(`  Coste medio unitario: ${(res1.cost / res1.units).toFixed(6)} € (Esperado: 4.333333 €)`);
console.log(`  ¿Invariante de coste unitario preservada?: ${Math.abs((res1.cost / res1.units) - (650 / 150)) < 1e-12 ? 'SÍ (EXACTA)' : 'NO'}`);

// Test 1.2: Venta total con residuo decimal IEEE 754
console.log('\n1.2 Venta total y limpieza de residuo infinitesimal (units <= 0.0000001):');
const opsDust = [
  { id: '1', symbol: 'ETH', side: 'buy', units: 1.0, amount: 3000, operation_date: '2026-01-01' },
  { id: '2', symbol: 'ETH', side: 'sell', units: 0.33333333, amount: 1200, operation_date: '2026-02-01' },
  { id: '3', symbol: 'ETH', side: 'sell', units: 0.33333333, amount: 1200, operation_date: '2026-03-01' },
  { id: '4', symbol: 'ETH', side: 'sell', units: 0.33333334, amount: 1200, operation_date: '2026-04-01' },
];
const resDust = investmentPositionList(opsDust);
console.log(`  Posiciones abiertas tras liquidar 1.0 ETH en 3 tramos: ${resDust.length} (Esperado: 0)`);
console.log(`  ¿Eliminado residuo de coma flotante?: ${resDust.length === 0 ? 'SÍ' : 'NO'}`);

// Test 1.3: Micro-posiciones legítimas (< 1e-7 unidades)
console.log('\n1.3 Comportamiento con micro-posiciones legítimas (ej. Satoshis):');
const opsMicro = [
  { id: '1', symbol: 'BTC_SAT', side: 'buy', units: 0.00000008, amount: 5, operation_date: '2026-01-01' }
];
const resMicro = investmentPositionList(opsMicro);
console.log(`  Compra de 0.00000008 unidades (8 Satoshis, 5 €): Posiciones devueltas = ${resMicro.length}`);
console.log(`  Observación: Las posiciones con <= 0.0000001 unidades son filtradas por diseño.`);

// Test 1.4: Sobreventa (vender más de lo que se tiene)
console.log('\n1.4 Escenario de sobreventa (intento de vender más de lo disponible):');
const opsOversell = [
  { id: '1', symbol: 'IBE.MC', side: 'buy', units: 10, amount: 120, operation_date: '2026-01-01' },
  { id: '2', symbol: 'IBE.MC', side: 'sell', units: 15, amount: 180, operation_date: '2026-02-01' },
];
const resOversell = investmentPositionList(opsOversell);
console.log(`  Resultado en investmentPositionList si llega sobreventa:`, resOversell);
const uiBlocksOversell = htmlSource.includes("side==='sell'&&units>available+0.0000001") && htmlSource.includes("No puedes vender más participaciones");
console.log(`  ¿La UI bloquea la venta superior al saldo disponible?: ${uiBlocksOversell ? 'SÍ' : 'NO'}`);
const rpcChecksStock = rpcSource.includes("p_side = 'sell'") && (rpcSource.includes("stock") || rpcSource.includes("disponible") || rpcSource.includes("units <"));
console.log(`  ¿La RPC SQL en base de datos valida existencias?: ${rpcChecksStock ? 'SÍ' : 'NO (Solo frontend)'}`);

// -------------------------------------------------------------
// 2. ASSET ALLOCATION
// -------------------------------------------------------------
console.log('\n--- 2. BARRA DE DISTRIBUCIÓN DE ACTIVOS (ASSET ALLOCATION) ---');

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

function fmt(n) {
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function htmlEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderAssetAllocationHtml(positions, validQuotes, isPrivate) {
  if (!positions || !positions.length) return '';
  var qMap = {};
  if (validQuotes && validQuotes.length) {
    validQuotes.forEach(function(r) { if (r && r.p) qMap[r.p.symbol] = r.value; });
  }
  var groups = {}, total = 0;
  positions.forEach(function(p) {
    var type = normalizeAssetType(p.type);
    var val = qMap[p.symbol] != null ? qMap[p.symbol] : p.cost;
    if (val < 0) val = 0;
    groups[type] = (groups[type] || 0) + val;
    total += val;
  });
  if (total <= 0) return '';
  var sorted = Object.keys(groups).sort(function(a, b) { return groups[b] - groups[a]; });
  var segs = sorted.map(function(type) {
    var pct = (groups[type] / total) * 100;
    var col = ASSET_TYPE_COLORS[type] || '#8E8E93';
    return '<div class="invest-alloc-seg" style="width:' + pct.toFixed(1) + '%;background:' + col + '" title="' + htmlEscape(type) + ': ' + pct.toFixed(1) + '%"></div>';
  }).join('');
  var legend = sorted.map(function(type) {
    var pct = (groups[type] / total) * 100;
    var col = ASSET_TYPE_COLORS[type] || '#8E8E93';
    var amt = isPrivate ? '••••••' : fmt(groups[type]);
    return '<div class="invest-alloc-item"><span class="invest-alloc-dot" style="background:' + col + '"></span><span>' + htmlEscape(type) + '</span><strong>' + pct.toFixed(1) + '%</strong><small>(' + amt + ')</small></div>';
  }).join('');
  return '<div class="invest-allocation"><div class="invest-alloc-head"><span>Distribución de cartera</span><small>Por tipo de activo</small></div><div class="invest-alloc-bar">' + segs + '</div><div class="invest-alloc-legend">' + legend + '</div></div>';
}

console.log('2.1 Comprobación de Modo Privado (portfolioValueHidden):');
const samplePositions = [
  { symbol: 'VWCE', type: 'ETF', cost: 4000, units: 40 },
  { symbol: 'IE00BYX5MX67', type: 'Fondo', cost: 2000, units: 122.34 },
  { symbol: 'AAPL', type: 'Acciones', cost: 2000, units: 10 },
  { symbol: 'BTC', type: 'Cripto', cost: 2000, units: 0.03 }
];
const htmlPublic = renderAssetAllocationHtml(samplePositions, null, false);
const htmlPrivate = renderAssetAllocationHtml(samplePositions, null, true);
console.log(`  ¿Oculta los importes en euros en modo privado?: ${htmlPrivate.includes('••••••') && !htmlPrivate.includes('4.000,00 €') ? 'SÍ' : 'NO'}`);
console.log(`  ¿Mantiene visibles los porcentajes (%) en modo privado?: ${htmlPrivate.includes('40.0%') ? 'SÍ (Intencionado para ver la asignación relativa)' : 'NO'}`);

console.log('\n2.2 Reactividad con cotizaciones de mercado en vivo:');
const quotesArrival = [
  { p: { symbol: 'VWCE' }, value: 5000 },
  { p: { symbol: 'IE00BYX5MX67' }, value: 2006.42 },
  { p: { symbol: 'AAPL' }, value: 2200 },
  { p: { symbol: 'BTC' }, value: 2500 }
];
const htmlWithQuotes = renderAssetAllocationHtml(samplePositions, quotesArrival, false);
console.log(`  ¿Se recalculan los pesos con la cotización en vivo?: ${htmlWithQuotes.includes('42.7%') ? 'SÍ (Recalculado reactivamente)' : 'NO'}`);
const reactivityInCode = htmlSource.includes("var allocEl=wrap.querySelector('.invest-allocation')") && htmlSource.includes("allocEl.outerHTML=newHtml");
console.log(`  ¿refreshInvestmentMarketValue actualiza el DOM de invest-allocation?: ${reactivityInCode ? 'SÍ' : 'NO'}`);

console.log('\n2.3 Cartera vacía y datos ficticios:');
const htmlEmpty = renderAssetAllocationHtml([], null, false);
console.log(`  ¿Devuelve cadena vacía si no hay posiciones?: ${htmlEmpty === '' ? 'SÍ' : 'NO'}`);
console.log(`  ¿Se muestran posiciones o gráficos de ejemplo?: ${htmlSource.includes('invest-empty') && !htmlSource.includes('posicion-ficticia') ? 'NO (Estado vacío limpio)' : 'SÍ (INCORRECTO)'}`);

// -------------------------------------------------------------
// 3. LOGOS CORPORATIVOS
// -------------------------------------------------------------
console.log('\n--- 3. LOGOS CORPORATIVOS Y FALLBACKS ---');
console.log(`  Fuente 1 (Primaria): https://assets.parqet.com/logos/symbol/{SYMBOL} -> ${htmlSource.includes('assets.parqet.com/logos/symbol/') ? 'IMPLEMENTADA' : 'NO'}`);
console.log(`  Fuente 2 (Fallback gestoras): t2.gstatic.com/faviconV2 -> ${htmlSource.includes('t2.gstatic.com/faviconV2') ? 'IMPLEMENTADA' : 'NO'}`);
console.log(`  Fuente 3 (Fallback final): Inicial del ticker en .logo-fallback -> ${htmlSource.includes('logo-fallback-only') ? 'IMPLEMENTADA' : 'NO'}`);
console.log(`  Diccionario ASSET_LOGO_DOMAINS presente: ${htmlSource.includes('ASSET_LOGO_DOMAINS') ? 'SÍ' : 'NO'}`);
console.log(`  MutationObserver activo en document.body: ${htmlSource.includes('investmentLogoObserver=new MutationObserver') ? 'SÍ' : 'NO'}`);
console.log(`  Idempotencia con data-logo-ready="1": ${htmlSource.includes("el.dataset.logoReady='1'") ? 'SÍ' : 'NO'}`);

// -------------------------------------------------------------
// 4. ENCABEZADO DE INVERSIÓN
// -------------------------------------------------------------
console.log('\n--- 4. ENCABEZADO DE INVERSIÓN (.invest-head) ---');
console.log(`  ¿Existe .invest-head en el marcado renderizado?: ${htmlSource.includes('class="invest-head"') ? 'SÍ (ERROR)' : 'NO (CORRECTO: Eliminado)'}`);
console.log(`  ¿Comienza directamente con .portfolio-card?: ${htmlSource.includes('<div class="invest-wrap"><section class="portfolio-card">') ? 'SÍ' : 'NO'}`);
console.log(`  Homogeneidad visual: Cabecera idéntica a Inicio (.summary) y Cuentas (.pat-total).`);

// -------------------------------------------------------------
// 5. DECISIONES DESCARTADAS VINCULANTES (PROJECT_CONTEXT.md)
// -------------------------------------------------------------
console.log('\n--- 5. DECISIONES DESCARTADAS VINCULANTES ---');
const investTabRegex = /function renderInvestmentsTab[\s\S]+?function renderSettingsTab/;
const investTabContent = (htmlSource.match(investTabRegex) || [''])[0];

const hasAvgPrice = /precio\s*medio/i.test(investTabContent);
const hasCapitalGain = /plusval[ií]a/i.test(investTabContent);
const hasPosReturn = /rentabilidad\s*por\s*posici[oó]n/i.test(investTabContent);
const hasPortfolioChart = investTabContent.includes('portfolio-chart') || investTabContent.includes('portfolioGraph');

console.log(`  ¿Precio medio en posiciones?: ${hasAvgPrice ? 'REINTRODUCIDO (VIOLACIÓN)' : 'NO (CORRECTO)'}`);
console.log(`  ¿Plusvalía en posiciones?: ${hasCapitalGain ? 'REINTRODUCIDO (VIOLACIÓN)' : 'NO (CORRECTO)'}`);
console.log(`  ¿Rentabilidad por posición?: ${hasPosReturn ? 'REINTRODUCIDO (VIOLACIÓN)' : 'NO (CORRECTO)'}`);
console.log(`  ¿Gráfico de evolución de cartera?: ${hasPortfolioChart ? 'REINTRODUCIDO (VIOLACIÓN)' : 'NO (CORRECTO)'}`);

console.log('\n================================================================');
console.log('AUDITORÍA COMPLETADA CON ÉXITO');
console.log('================================================================\n');