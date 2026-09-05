const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

console.log('=== VERIFICACION EXHAUSTIVA DE AUDITOR 4 ===');

// 1. investmentPositionList
console.log('\n--- 1. investmentPositionList en index.html ---');
const fnMatch = html.match(/function investmentPositionList\(\)\{[\s\S]+?return Object\.keys\(bySymbol\)[\s\S]+?\}/);
console.log('Existe funcion investmentPositionList:', !!fnMatch);
if (fnMatch) {
  const code = fnMatch[0];
  console.log('Tiene ordenacion cronologica interna:', code.includes('ops=investmentOperations.slice().sort'));
  console.log('Tiene ordenacion por operation_date:', code.includes('a.operation_date'));
  console.log('Formula reduccion coste (p.cost-=p.cost*(u/p.units)):', code.includes('p.cost-=p.cost*(u/p.units)'));
  console.log('Control dust infinitesimal (p.units<=0.0000001):', code.includes('p.units<=0.0000001'));
  console.log('Filtro final de posiciones (p.units>0.0000001):', code.includes('filter(function(p){return p.units>0.0000001;})'));
}

// 2. Asset Allocation
console.log('\n--- 2. Asset Allocation en index.html ---');
console.log('Existe normalizeAssetType:', html.includes('function normalizeAssetType(raw)'));
console.log('Existe ASSET_TYPE_COLORS:', html.includes('var ASSET_TYPE_COLORS='));
console.log('Existe renderAssetAllocationHtml:', html.includes('function renderAssetAllocationHtml(positions,validQuotes)'));
console.log('Oculta importes en modo privado:', html.includes("portfolioValueHidden()?'••••••':fmt(groups[type])"));
console.log('Reactividad en refreshInvestmentMarketValue:', html.includes('allocEl.outerHTML=newHtml'));

// 3. Logos
console.log('\n--- 3. Logos Corporativos ---');
console.log('Primario Parqet:', html.includes('https://assets.parqet.com/logos/symbol/'));
console.log('Secundario gstatic:', html.includes('https://t2.gstatic.com/faviconV2'));
console.log('ASSET_LOGO_DOMAINS:', html.includes('var ASSET_LOGO_DOMAINS='));
console.log('decorateAssetLogo:', html.includes('function decorateAssetLogo('));
console.log('decorateInvestmentLogos:', html.includes('function decorateInvestmentLogos('));
console.log('MutationObserver activo:', html.includes('var investmentLogoObserver=new MutationObserver('));

// 4. Encabezado .invest-head
console.log('\n--- 4. Encabezado Inversion ---');
console.log('class="invest-head" en HTML:', html.includes('class="invest-head"'));
const tabStart = html.indexOf('function renderInvestmentsTab');
const tabEnd = html.indexOf('function renderSettingsTab');
const tabCode = html.slice(tabStart, tabEnd);
console.log('invest-head en renderInvestmentsTab:', tabCode.includes('invest-head'));

// 5. Decisiones descartadas
console.log('\n--- 5. Decisiones Descartadas ---');
console.log('Precio medio en pestaña:', /precio\s*medio/i.test(tabCode));
console.log('Plusvalia en pestaña:', /plusval/i.test(tabCode));
console.log('Rentabilidad por posicion en pestaña:', /rentabilidad\s*por\s*posici/i.test(tabCode));
console.log('Grafico de evolucion de cartera:', tabCode.includes('portfolio-chart') || tabCode.includes('portfolioGraph'));