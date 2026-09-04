// test-investment-sim.js
// Simulación y auditoría del módulo de inversión y cartera en FinTrack

function runAudit() {
  console.log('=== AUDITORÍA DEL MÓDULO DE INVERSIÓN Y CARTERA EN FINTRACK ===\n');

  // 1. Implementación actual de investmentPositionList en index.html
  function current_investmentPositionList(operations) {
    var bySymbol = {};
    operations.forEach(function(o) {
      var key = o.symbol;
      if (!bySymbol[key]) bySymbol[key] = { symbol: key, name: o.product_name || key, type: o.product_type || 'Producto', units: 0, cost: 0 };
      var p = bySymbol[key], u = Number(o.units), a = Number(o.amount);
      if (o.side === 'buy') {
        p.units += u;
        p.cost += a;
      } else if (p.units > 0) {
        p.cost -= p.cost * (u / p.units);
        p.units -= u;
      }
    });
    return Object.keys(bySymbol).map(function(k) { return bySymbol[k]; }).filter(function(p) { return p.units > 0.0000001; });
  }

  // Versión corregida con ordenación cronológica (ascendente)
  function fixed_investmentPositionList(operations) {
    var bySymbol = {};
    // Ordenar de más antiguo a más reciente por operation_date y luego por id
    var sortedOps = operations.slice().sort(function(a, b) {
      var d = String(a.operation_date).localeCompare(String(b.operation_date));
      if (d !== 0) return d;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    sortedOps.forEach(function(o) {
      var key = o.symbol;
      if (!bySymbol[key]) bySymbol[key] = { symbol: key, name: o.product_name || key, type: o.product_type || 'Producto', units: 0, cost: 0 };
      var p = bySymbol[key], u = Number(o.units), a = Number(o.amount);
      if (o.side === 'buy') {
        p.units += u;
        p.cost += a;
      } else if (p.units > 0) {
        p.cost -= p.cost * (u / p.units);
        p.units -= u;
        if (p.units <= 0.0000001) {
          p.units = 0;
          p.cost = 0;
        }
      }
    });
    return Object.keys(bySymbol).map(function(k) { return bySymbol[k]; }).filter(function(p) { return p.units > 0.0000001; });
  }

  // TEST SCENARIO 1: Orden de las operaciones (Ascendente vs Descendente)
  console.log('--- TEST 1: Impacto del orden de operaciones (Descendente vs Cronológico) ---');
  var opsChronological = [
    { id: '1', symbol: 'SAN.MC', product_name: 'Banco Santander', product_type: 'Acciones', side: 'buy', units: 100, amount: 400, operation_date: '2026-01-10' },
    { id: '2', symbol: 'SAN.MC', product_name: 'Banco Santander', product_type: 'Acciones', side: 'sell', units: 40, amount: 200, operation_date: '2026-02-15' }
  ];
  // Como Supabase devuelve order('operation_date', { ascending: false }):
  var opsAsReturnedBySupabase = [
    { id: '2', symbol: 'SAN.MC', product_name: 'Banco Santander', product_type: 'Acciones', side: 'sell', units: 40, amount: 200, operation_date: '2026-02-15' },
    { id: '1', symbol: 'SAN.MC', product_name: 'Banco Santander', product_type: 'Acciones', side: 'buy', units: 100, amount: 400, operation_date: '2026-01-10' }
  ];

  var resDesc = current_investmentPositionList(opsAsReturnedBySupabase);
  var resAsc = current_investmentPositionList(opsChronological);
  var resFixed = fixed_investmentPositionList(opsAsReturnedBySupabase);

  console.log('Esperado: 60 participaciones, coste = 240 €');
  console.log('Con orden Supabase (DESC) en código actual:', resDesc);
  console.log('Con orden cronológico (ASC) en código actual:', resAsc);
  console.log('Con orden corregido (fixed_investmentPositionList):', resFixed);

  // TEST SCENARIO 2: Ventas parciales múltiples y precisión matemática
  console.log('\n--- TEST 2: Ventas parciales múltiples y coste medio ponderado ---');
  var opsPartial = [
    { id: '1', symbol: 'VWCE', product_name: 'Vanguard All-World', product_type: 'ETFs', side: 'buy', units: 10, amount: 1000, operation_date: '2026-01-01' }, // 10 @ 100 = 1000 (coste/u: 100)
    { id: '2', symbol: 'VWCE', product_name: 'Vanguard All-World', product_type: 'ETFs', side: 'buy', units: 10, amount: 1200, operation_date: '2026-02-01' }, // 10 @ 120 = 1200 (total 20 u, coste: 2200, coste/u: 110)
    { id: '3', symbol: 'VWCE', product_name: 'Vanguard All-World', product_type: 'ETFs', side: 'sell', units: 5, amount: 650, operation_date: '2026-03-01' },  // vende 5 @ 130 (coste 5*110 = 550, rem coste = 1650, rem u = 15, coste/u: 110)
    { id: '4', symbol: 'VWCE', product_name: 'Vanguard All-World', product_type: 'ETFs', side: 'sell', units: 5, amount: 700, operation_date: '2026-04-01' },  // vende 5 @ 140 (coste 5*110 = 550, rem coste = 1100, rem u = 10, coste/u: 110)
  ];
  var resPartial = fixed_investmentPositionList(opsPartial);
  console.log('Resultado ventas parciales:', resPartial);
  var p1 = resPartial[0];
  console.log(`Unidades restantes: ${p1.units} (Esperado: 10)`);
  console.log(`Coste restante: ${p1.cost} € (Esperado: 1100 €)`);
  console.log(`Coste por unidad: ${p1.cost / p1.units} € (Esperado: 110 €)`);

  // TEST SCENARIO 3: Venta total y residuo infinitesimal (units <= 0.0000001)
  console.log('\n--- TEST 3: Venta total y residuos numéricos (units <= 0.0000001) ---');
  var opsDust = [
    { id: '1', symbol: 'BTC', product_name: 'Bitcoin', product_type: 'Cripto', side: 'buy', units: 1.00000000, amount: 60000, operation_date: '2026-01-01' },
    { id: '2', symbol: 'BTC', product_name: 'Bitcoin', product_type: 'Cripto', side: 'sell', units: 0.33333333, amount: 25000, operation_date: '2026-02-01' },
    { id: '3', symbol: 'BTC', product_name: 'Bitcoin', product_type: 'Cripto', side: 'sell', units: 0.33333333, amount: 25000, operation_date: '2026-03-01' },
    { id: '4', symbol: 'BTC', product_name: 'Bitcoin', product_type: 'Cripto', side: 'sell', units: 0.33333334, amount: 26000, operation_date: '2026-04-01' }
  ];
  // Total vendido: 0.33333333 + 0.33333333 + 0.33333334 = 1.00000000
  var resDustCurrent = current_investmentPositionList(opsDust.slice());
  console.log('Resultado venta total en current_investmentPositionList:', resDustCurrent);

  // Caso donde unidades son deliberadamente menores a 1e-7:
  var opsTiny = [
    { id: '1', symbol: 'SATS', product_name: 'Satoshi Micro', product_type: 'Cripto', side: 'buy', units: 0.00000008, amount: 5, operation_date: '2026-01-01' }
  ];
  console.log('Posición con units = 0.00000008 (<= 0.0000001):', current_investmentPositionList(opsTiny));

  // TEST SCENARIO 4: Intento de vender más de lo disponible
  console.log('\n--- TEST 4: Intento de sobreventa (units > available) ---');
  var opsOversell = [
    { id: '1', symbol: 'TEF.MC', product_name: 'Telefónica', product_type: 'Acciones', side: 'buy', units: 10, amount: 40, operation_date: '2026-01-01' },
    { id: '2', symbol: 'TEF.MC', product_name: 'Telefónica', product_type: 'Acciones', side: 'sell', units: 15, amount: 60, operation_date: '2026-02-01' }
  ];
  var resOversell = current_investmentPositionList(opsOversell);
  console.log('Resultado en positionList tras sobreventa:', resOversell);

  // 2. Auditoría de Asset Allocation
  console.log('\n--- TEST 5: Asset Allocation (normalizeAssetType, colores y modo privado) ---');
  function normalizeAssetType(raw) {
    if (!raw) return 'Otros';
    var t = String(raw).toLowerCase().trim();
    if (t.indexOf('etf') !== -1) return 'ETFs';
    if (t.indexOf('fondo') !== -1 || t.indexOf('fund') !== -1) return 'Fondos';
    if (t.indexOf('acci') !== -1 || t.indexOf('stock') !== -1 || t.indexOf('equity') !== -1 || t.indexOf('share') !== -1) return 'Acciones';
    if (t.indexOf('cripto') !== -1 || t.indexOf('crypto') !== -1 || t.indexOf('btc') !== -1 || t.indexOf('eth') !== -1) return 'Cripto';
    if (t.indexOf('bono') !== -1 || t.indexOf('bond') !== -1 || t.indexOf('renta fija') !== -1) return 'Renta fija';
    return 'Otros';
  }

  var testTypes = [
    'Acción', 'Acciones Santander', 'Stock', 'Common Stock', 'Equity', 'Share',
    'Fondo de inversión', 'Mutual Fund', 'Index Fund',
    'ETF', 'iShares Core ETF',
    'Cripto', 'Cryptocurrency', 'BTC', 'ETH', 'Digital Currency',
    'Bono del Estado', 'Government Bond', 'Renta Fija Corto Plazo',
    'Commodity', 'Oro', null, undefined, ''
  ];

  testTypes.forEach(function(t) {
    console.log(`Tipo: "${t}" -> Normalizado: "${normalizeAssetType(t)}"`);
  });

  var ASSET_TYPE_COLORS = {
    'Acciones': '#007AFF',
    'Fondos': '#34C759',
    'ETFs': '#5856D6',
    'Cripto': '#FF9500',
    'Renta fija': '#30B0C7',
    'Otros': '#8E8E93'
  };

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
      return `<div class="invest-alloc-seg" style="width:${pct.toFixed(1)}%;background:${col}" title="${type}: ${pct.toFixed(1)}%"></div>`;
    }).join('');
    var legend = sorted.map(function(type) {
      var pct = (groups[type] / total) * 100;
      var col = ASSET_TYPE_COLORS[type] || '#8E8E93';
      var amt = isPrivate ? '••••••' : `${groups[type].toFixed(2)} €`;
      return `<div class="invest-alloc-item"><span class="invest-alloc-dot" style="background:${col}"></span><span>${type}</span><strong>${pct.toFixed(1)}%</strong><small>(${amt})</small></div>`;
    }).join('');
    return `<div class="invest-allocation"><div class="invest-alloc-head"><span>Distribución de cartera</span><small>Por tipo de activo</small></div><div class="invest-alloc-bar">${segs}</div><div class="invest-alloc-legend">${legend}</div></div>`;
  }

  console.log('\n--- Simulación Asset Allocation con Cartera Mixta ---');
  var mixedPositions = [
    { symbol: 'SAN.MC', name: 'Banco Santander', type: 'Acciones', units: 100, cost: 400 },
    { symbol: 'VWCE', name: 'Vanguard All-World', type: 'ETF', units: 10, cost: 1100 },
    { symbol: 'IE00BYX5MX67', name: 'Fidelity S&P 500', type: 'Fondo de inversión', units: 50, cost: 800 },
    { symbol: 'BTC', name: 'Bitcoin', type: 'Cripto', units: 0.05, cost: 3000 }
  ];

  console.log('\n1. Modo Normal (sin cotizaciones en vivo, basado en coste):');
  console.log(renderAssetAllocationHtml(mixedPositions, null, false));

  console.log('\n2. Modo Privado (portfolioValueHidden = true):');
  console.log(renderAssetAllocationHtml(mixedPositions, null, true));

  console.log('\n3. Con cotizaciones en vivo (validQuotes):');
  var quotes = [
    { p: { symbol: 'SAN.MC' }, value: 450 },
    { p: { symbol: 'VWCE' }, value: 1250 },
    { p: { symbol: 'IE00BYX5MX67' }, value: 850 },
    { p: { symbol: 'BTC' }, value: 3500 }
  ];
  console.log(renderAssetAllocationHtml(mixedPositions, quotes, false));

  console.log('\n4. Cartera vacía (positions = []):');
  console.log(`HTML generado: "${renderAssetAllocationHtml([], null, false)}" (Cadena vacía: ${renderAssetAllocationHtml([], null, false) === ''})`);

  // 3. Simulación de Tesorería y Plusvalías
  console.log('\n--- TEST 6: Consistencia de Tesorería y Contabilidad de Plusvalías ---');
  function simulateTreasuryFlow() {
    var cashAccount = { id: 'acc_cash', balance: 5000 };
    var invAccount = { id: 'invacc_1', balance: 0 };
    console.log(`Saldo inicial: Efectivo = ${cashAccount.balance} €, Inversión = ${invAccount.balance} €`);

    // Compra de 10 acciones @ 100€ = 1000€
    var buyAmount = 1000;
    cashAccount.balance -= buyAmount;
    invAccount.balance += buyAmount;
    console.log(`Tras compra de 1.000 €: Efectivo = ${cashAccount.balance} €, Inversión = ${invAccount.balance} €, Total = ${cashAccount.balance + invAccount.balance} €`);

    // Venta de 10 acciones con plusvalía @ 150€ = 1500€
    // En FinTrack, record_investment_operation hace una transferencia directa de 1500€ desde inv_id hacia cash_id:
    var sellAmount = 1500;
    invAccount.balance -= sellAmount;
    cashAccount.balance += sellAmount;
    console.log(`Tras venta por 1.500 € (plusvalía +500 €): Efectivo = ${cashAccount.balance} €, Inversión = ${invAccount.balance} €, Total = ${cashAccount.balance + invAccount.balance} €`);
    console.log(`¡ATENCIÓN! La cuenta de Inversión tiene saldo negativo (${invAccount.balance} €) y el total del patrimonio calculado no aumenta (${cashAccount.balance + invAccount.balance} €) debido a que no se genera asiento de ganancia patrimonial (ingreso), sino una mera transferencia.`);

    // Borrado de la venta:
    invAccount.balance += sellAmount;
    cashAccount.balance -= sellAmount;
    console.log(`Tras borrar la operación de venta: Efectivo = ${cashAccount.balance} €, Inversión = ${invAccount.balance} €, Total = ${cashAccount.balance + invAccount.balance} € (Restaurado exactamente al estado tras la compra)`);
  }

  simulateTreasuryFlow();
}

runAudit();
