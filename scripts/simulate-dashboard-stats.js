/**
 * Script de simulación y auditoría matemática para Agente 5:
 * Presupuestos, Dashboard y Visualizaciones en FinTrack (index.html)
 */

const assert = require('assert');

// 1. Funciones matemáticas y lógicas extraídas de index.html

function fmt(n) {
  n = Number(n);
  if (!isFinite(n)) n = 0;
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtShort(n) {
  n = Number(n);
  if (!isFinite(n)) n = 0;
  return Math.abs(n) >= 10000
    ? (n / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k €'
    : n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function budgetGradientColor(pct) {
  pct = Math.max(0, Math.min(pct, 100));
  var green = [52, 199, 89], amber = [255, 149, 0], red = [255, 59, 48], c1, c2, t;
  if (pct <= 80) { c1 = green; c2 = amber; t = pct / 80; }
  else { c1 = amber; c2 = red; t = (pct - 80) / 20; }
  var r = Math.round(c1[0] + (c2[0] - c1[0]) * t),
      g = Math.round(c1[1] + (c2[1] - c1[1]) * t),
      b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function txExpenseImpact(t) {
  if (!t) return 0;
  if (t.is_balance_adjustment) return t.type === 'expense' ? Number(t.amount) : -Number(t.amount);
  return t.type === 'expense' ? Number(t.amount) : 0;
}

function txIncomeImpact(t) {
  return t && !t.is_balance_adjustment && t.type === 'income' ? Number(t.amount) : 0;
}

function donutRgb(hex) {
  hex = (hex || '#8E8E93').replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return [parseInt(hex.substr(0, 2), 16) || 140, parseInt(hex.substr(2, 2), 16) || 140, parseInt(hex.substr(4, 2), 16) || 150];
}

function donutHit(canvasWidth, canvasHeight, clientX, clientY, entries, total, size) {
  if (!total) return null;
  var cx = canvasWidth / 2, cy = canvasHeight / 2;
  var dx = clientX - cx, dy = clientY - cy, dist = Math.sqrt(dx * dx + dy * dy);
  var ring = Math.max(20, size * 0.135), radius = cx - ring / 2 - 2;
  if (dist < radius - ring / 2 - 8 || dist > radius + ring / 2 + 8) return null;
  var a = Math.atan2(dy, dx) + Math.PI / 2;
  if (a < 0) a += Math.PI * 2;
  var acc = 0;
  for (var i = 0; i < entries.length; i++) {
    var seg = (entries[i].value / total) * Math.PI * 2;
    if (a >= acc && a < acc + seg) return entries[i].id;
    acc += seg;
  }
  return null;
}

function runSimulation() {
  console.log('=====================================================');
  console.log('SIMULACIÓN AUDITORÍA AGENTE 5 - FINTRACK');
  console.log('=====================================================\n');

  const findings = [];

  // ----------------------------------------------------
  // TEST SUITE 1: Presupuesto y Gradiente de Color
  // ----------------------------------------------------
  console.log('--- TEST SUITE 1: Presupuestos y Gradiente ---');
  const testPcts = [-20, 0, 40, 80, 90, 100, 150];
  testPcts.forEach(pct => {
    const col = pct >= 100 ? 'var(--red)' : budgetGradientColor(pct);
    console.log(`pct: ${pct}% -> color: ${col}`);
  });

  assert.strictEqual(budgetGradientColor(-10), 'rgb(52,199,89)', 'Valores negativos deben clampear a verde');
  assert.strictEqual(budgetGradientColor(0), 'rgb(52,199,89)', '0% debe ser verde');
  assert.strictEqual(budgetGradientColor(80), 'rgb(255,149,0)', '80% debe ser ámbar puro');
  assert.strictEqual(budgetGradientColor(100), 'rgb(255,59,48)', '100% debe ser rojo puro');
  assert.strictEqual(budgetGradientColor(150), 'rgb(255,59,48)', 'Valores >100 deben clampear a rojo');
  console.log('✓ budgetGradientColor interpolación y límites correctos');

  const testBudgets = [
    { tExp: 500, tb: 1000, desc: 'Gasto normal 50%' },
    { tExp: 1000, tb: 1000, desc: 'Gasto al límite 100%' },
    { tExp: 1500, tb: 1000, desc: 'Gasto sobrepasado 150%' },
    { tExp: 0, tb: 1000, desc: 'Cero gastos' },
    { tExp: -100, tb: 1000, desc: 'Gasto neto negativo por ajuste de saldo alcista' }
  ];

  testBudgets.forEach(tc => {
    const pct = Math.min(Math.round(tc.tExp / tc.tb * 100), 100);
    const col = tc.tExp / tc.tb * 100 >= 100 ? 'var(--red)' : budgetGradientColor(tc.tExp / tc.tb * 100);
    console.log(`[${tc.desc}] tExp=${tc.tExp}, tb=${tc.tb} -> bar pct=${pct}%, col=${col}`);
    if (pct < 0) {
      findings.push({
        area: 'Presupuesto mensual',
        severity: 'Baja',
        issue: 'Barra de presupuesto con ancho negativo si tExp < 0',
        detail: `Si un ajuste de saldo positivo supera los gastos del mes, tExp es negativo (${tc.tExp}€), provocando pct = ${pct}%, lo que genera width: ${pct}% en CSS en lugar de Math.max(0, pct).`
      });
    }
  });

  // ----------------------------------------------------
  // TEST SUITE 2: Totales del Dashboard y Ajustes de Saldo
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 2: Dashboard Totals y Ajustes de Saldo ---');
  const scenarios = [
    {
      name: 'Mes estándar',
      txs: [
        { type: 'income', amount: 2500, date: '2026-09-01' },
        { type: 'expense', amount: 450, category: 'alimentación', date: '2026-09-02' },
        { type: 'expense', amount: 120, category: 'ocio', date: '2026-09-03' }
      ]
    },
    {
      name: 'Mes con ajuste de saldo alcista (+200€ dinero encontrado)',
      txs: [
        { type: 'income', amount: 2000, date: '2026-09-01' },
        { type: 'expense', amount: 300, category: 'alimentación', date: '2026-09-02' },
        { type: 'income', amount: 200, is_balance_adjustment: true, date: '2026-09-03' }
      ]
    },
    {
      name: 'Mes con ajuste de saldo bajista (-150€ dinero desaparecido)',
      txs: [
        { type: 'income', amount: 1500, date: '2026-09-01' },
        { type: 'expense', amount: 500, category: 'alimentación', date: '2026-09-02' },
        { type: 'expense', amount: 150, is_balance_adjustment: true, date: '2026-09-03' }
      ]
    },
    {
      name: 'Mes solo con ajustes de saldo (+500€)',
      txs: [
        { type: 'income', amount: 500, is_balance_adjustment: true, date: '2026-09-01' }
      ]
    },
    {
      name: 'Mes sin transacciones',
      txs: []
    }
  ];

  scenarios.forEach(sc => {
    const txs = sc.txs;
    const tExp = txs.reduce((s, t) => s + txExpenseImpact(t), 0);
    const tInc = txs.reduce((s, t) => s + txIncomeImpact(t), 0);
    const bal = tInc - tExp;
    const netAdj = txs.reduce((s, t) => s + (t.is_balance_adjustment ? txExpenseImpact(t) : 0), 0);
    const noteText = Math.abs(netAdj) > 0.005 ? 'Actualización de gastos: ' + (netAdj < 0 ? '−' : '+') + fmt(Math.abs(netAdj)) : '';
    const noteCol = netAdj < 0 ? 'var(--green)' : 'var(--red)';

    console.log(`\nEscenario: ${sc.name}`);
    console.log(`  Ingresos (tInc): ${fmt(tInc)} [fmtShort: ${fmtShort(tInc)}]`);
    console.log(`  Gastos (tExp): ${fmt(tExp)} [fmtShort: ${fmtShort(tExp)}]`);
    console.log(`  Balance (bal): ${fmt(bal)} [fmtShort: ${fmtShort(Math.abs(bal))}] (color: ${bal >= 0 ? 'green' : 'red'})`);
    console.log(`  Nota Ajuste: "${noteText}" (color: ${noteCol})`);

    const realInc = txs.filter(t => !t.is_balance_adjustment && t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realExp = txs.filter(t => !t.is_balance_adjustment && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const adjInc = txs.filter(t => t.is_balance_adjustment && t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const adjExp = txs.filter(t => t.is_balance_adjustment && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const expectedNetDelta = (realInc + adjInc) - (realExp + adjExp);
    assert.strictEqual(bal, expectedNetDelta, `El balance calculado (${bal}) debe ser exactamente igual al delta financiero (${expectedNetDelta})`);
  });

  // ----------------------------------------------------
  // TEST SUITE 3: Donut Canvas y Hit Testing
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 3: Donut Canvas y Detección de Clics ---');
  const dummyEntries = [
    { id: 'cat1', color: '#FF3B30', value: 300 },
    { id: 'cat2', color: '#007AFF', value: 200 },
    { id: 'cat3', color: '#34C759', value: 500 }
  ];
  const chartTotal = 1000;
  const size = 190;

  const centerHit = donutHit(size, size, 95, 95, dummyEntries, chartTotal, size);
  assert.strictEqual(centerHit, null, 'El centro del donut no debe disparar hit');

  const outsideHit = donutHit(size, size, 180, 180, dummyEntries, chartTotal, size);
  assert.strictEqual(outsideHit, null, 'Puntos exteriores no deben disparar hit');

  const hitSector1 = donutHit(size, size, 95 + 56, 95 - 56, dummyEntries, chartTotal, size);
  assert.strictEqual(hitSector1, 'cat1', 'Punto a 45° debe corresponder a cat1');
  console.log(`✓ donutHit detectó correctamente cat1 en sector superior-derecho: ${hitSector1}`);

  const zeroTotalHit = donutHit(size, size, 95 + 56, 95 - 56, dummyEntries, 0, size);
  assert.strictEqual(zeroTotalHit, null, 'Con total 0 donutHit debe retornar null');
  console.log('✓ donutHit con total 0 retorna null de forma segura');

  // ----------------------------------------------------
  // TEST SUITE 4: Estadísticas Anuales y Fechas
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 4: Estadísticas Anuales y Gestión de Meses ---');
  const realNow = new Date(2026, 8, 4); // 4 de Septiembre de 2026
  const realY = realNow.getFullYear(); // 2026
  const realM = realNow.getMonth(); // 8 (Septiembre, 0-indexed)

  function testAnnualStatsForYear(chartYear, transactions) {
    function isFutureMonth(i) {
      return chartYear > realY || (chartYear === realY && i > realM);
    }

    const incData = Array(12).fill(0);
    const expData = Array(12).fill(0);
    const savData = [];

    const yearTxs = transactions.filter(t => t.date && t.date.slice(0, 4) === String(chartYear));
    yearTxs.forEach(t => {
      const m = parseInt(String(t.date).slice(5, 7), 10) - 1;
      if (m >= 0 && m < 12) {
        if (t.type === 'income') incData[m] += Number(t.amount) || 0;
        else if (t.type === 'expense') expData[m] += Number(t.amount) || 0;
      }
    });
    for (let m = 0; m < 12; m++) savData.push(incData[m] - expData[m]);

    const monthsWithData = [];
    for (let mi = 0; mi < 12; mi++) {
      if ((incData[mi] > 0 || expData[mi] > 0) && !isFutureMonth(mi)) {
        monthsWithData.push(mi);
      }
    }

    const pastMonthsWithData = monthsWithData.filter(i => chartYear < realY || (chartYear === realY && i < realM));

    let stats = null;
    if (monthsWithData.length) {
      const maxExpIdx = monthsWithData.reduce((a, b) => expData[b] > expData[a] ? b : a);
      const maxIncIdx = monthsWithData.reduce((a, b) => incData[b] > incData[a] ? b : a);
      const sumInc = monthsWithData.reduce((s, i) => s + incData[i], 0);
      const avgInc = sumInc / monthsWithData.length;

      let pastStats = null;
      if (pastMonthsWithData.length) {
        const minExpIdx = pastMonthsWithData.reduce((a, b) => expData[b] < expData[a] ? b : a);
        const maxSavIdx = pastMonthsWithData.reduce((a, b) => savData[b] > savData[a] ? b : a);
        const sumExpPast = pastMonthsWithData.reduce((s, i) => s + expData[i], 0);
        const sumIncPast = pastMonthsWithData.reduce((s, i) => s + incData[i], 0);
        const avgExpPast = sumExpPast / pastMonthsWithData.length;
        const savAmount = sumIncPast - sumExpPast;
        const savRate = sumIncPast > 0 ? savAmount / sumIncPast * 100 : null;
        const daysInPastMonths = pastMonthsWithData.reduce((s, i) => s + new Date(chartYear, i + 1, 0).getDate(), 0);
        const avgDailyTotal = daysInPastMonths > 0 ? sumExpPast / daysInPastMonths : null;

        pastStats = {
          minExpIdx,
          minExp: expData[minExpIdx],
          maxSavIdx,
          maxSav: savData[maxSavIdx],
          avgExpPast,
          savRate,
          savAmount,
          daysInPastMonths,
          avgDailyTotal
        };
      }

      stats = {
        monthsWithData,
        pastMonthsWithData,
        maxExpIdx,
        maxExp: expData[maxExpIdx],
        maxIncIdx,
        maxInc: incData[maxIncIdx],
        avgInc,
        pastStats
      };
    }
    return { incData, expData, savData, stats };
  }

  const txDataset2026 = [
    { date: '2026-01-05', type: 'income', amount: 3000 },
    { date: '2026-01-10', type: 'expense', amount: 1200 },
    { date: '2026-02-05', type: 'income', amount: 2500 },
    { date: '2026-02-14', type: 'expense', amount: 800 },
    { date: '2026-03-05', type: 'income', amount: 2500 },
    { date: '2026-03-20', type: 'expense', amount: 2200 },
    { date: '2026-09-01', type: 'income', amount: 2800 },
    { date: '2026-09-03', type: 'expense', amount: 400 },
    { date: '2026-11-15', type: 'expense', amount: 500 }
  ];

  const res2026 = testAnnualStatsForYear(2026, txDataset2026);
  console.log('Meses con datos computados para 2026:', res2026.stats.monthsWithData);
  console.log('Meses cerrados computados para 2026:', res2026.stats.pastMonthsWithData);

  assert.ok(!res2026.stats.monthsWithData.includes(10), 'Noviembre (mes futuro 10) NO debe estar en monthsWithData');
  assert.ok(res2026.stats.monthsWithData.includes(8), 'Septiembre (mes en curso 8) DEBE estar en monthsWithData');
  assert.ok(!res2026.stats.pastMonthsWithData.includes(8), 'Septiembre (mes en curso 8) NO debe estar en pastMonthsWithData');
  assert.deepStrictEqual(res2026.stats.pastMonthsWithData, [0, 1, 2], 'Meses cerrados deben ser exactamente Enero(0), Febrero(1) y Marzo(2)');

  assert.strictEqual(res2026.stats.pastStats.minExpIdx, 1, 'Mes menos gastado debe ser Febrero (idx 1), no Septiembre');
  assert.strictEqual(res2026.stats.pastStats.minExp, 800, 'Gasto de mes menos gastado debe ser 800');
  console.log('✓ Mes menos gastado protegido contra sesgo del mes en curso');

  assert.strictEqual(res2026.stats.maxExpIdx, 2, 'Mes más gastado debe ser Marzo (idx 2)');
  assert.strictEqual(res2026.stats.maxExp, 2200);
  console.log('✓ Mes más gastado calculado correctamente');

  assert.strictEqual(res2026.stats.pastStats.daysInPastMonths, 90, 'Total días Ene+Feb+Mar 2026 debe ser 90');
  assert.strictEqual(res2026.stats.pastStats.avgDailyTotal, 4200 / 90);
  console.log(`✓ Gasto diario medio: ${res2026.stats.pastStats.avgDailyTotal.toFixed(2)} €/día (${res2026.stats.pastStats.daysInPastMonths} días)`);

  assert.strictEqual(res2026.stats.pastStats.savAmount, 3800);
  assert.strictEqual(res2026.stats.pastStats.savRate, 47.5);
  console.log(`✓ Tasa de ahorro media calculada: ${res2026.stats.pastStats.savRate.toFixed(1)}% (+${res2026.stats.pastStats.savAmount} €)`);

  const bisiestoTxs = [
    { date: '2024-02-10', type: 'expense', amount: 580 }
  ];
  const res2024 = testAnnualStatsForYear(2024, bisiestoTxs);
  assert.strictEqual(res2024.stats.pastStats.daysInPastMonths, 29, 'Febrero 2024 bisiesto debe tener 29 días');
  assert.strictEqual(res2024.stats.pastStats.avgDailyTotal, 580 / 29, 'Gasto diario medio en Feb 2024 debe ser 20€');
  console.log('✓ Cálculo de días bisiestos en año anterior validado correctamente');

  // ----------------------------------------------------
  // TEST SUITE 5: Comparativa vs Mes Anterior (Cutoff)
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 5: Comparativa vs Mes Anterior con Cutoff ---');
  const curTxs = [
    { type: 'expense', amount: 50, date: '2026-09-02' },
    { type: 'expense', amount: 80, date: '2026-09-04' },
    { type: 'expense', amount: 200, date: '2026-09-15' }
  ];
  const prevTxs = [
    { type: 'expense', amount: 40, date: '2026-08-01' },
    { type: 'expense', amount: 60, date: '2026-08-04' },
    { type: 'expense', amount: 500, date: '2026-08-20' }
  ];
  const todayDay = 4;
  function dayOf(dateStr) { return parseInt(String(dateStr).slice(8, 10), 10) || 0; }
  const curExp = curTxs.filter(t => t.type === 'expense' && dayOf(t.date) <= todayDay).reduce((s, t) => s + t.amount, 0);
  const prevExp = prevTxs.filter(t => t.type === 'expense' && dayOf(t.date) <= todayDay).reduce((s, t) => s + t.amount, 0);
  assert.strictEqual(curExp, 130, 'curExp hasta día 4 debe ser 130 (50+80)');
  assert.strictEqual(prevExp, 100, 'prevExp hasta día 4 debe ser 100 (40+60)');
  const expDiff = curExp - prevExp;
  assert.strictEqual(expDiff, 30, 'Diferencia de gasto vs día 4 del mes anterior debe ser +30€');
  console.log(`✓ Comparativa de corte: ${curExp}€ vs ${prevExp}€ (dif: +${expDiff}€ vs día ${todayDay} de ago.)`);

  console.log('\n=====================================================');
  console.log('SIMULACIÓN FINALIZADA CON ÉXITO: TODOS LOS TESTS PASARON');
  console.log('=====================================================');

  return findings;
}

const detectedFindings = runSimulation();
console.log('\nHallazgos detectados en la simulación:', JSON.stringify(detectedFindings, null, 2));
