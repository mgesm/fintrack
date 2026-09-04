// scripts/audit-recurrence-voids-sim.js
// Auditoría y simulación integral de Recurrencias, Exclusiones y Anulaciones (Transaction Voids) en FinTrack.

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// --- Lógica fiel extraída de index.html ---
function addInterval(d, interval, anchorDay) {
  var nd = new Date(d.getTime());
  if (interval === 'weekly') { nd.setDate(nd.getDate() + 7); return nd; }
  if (interval === 'biweekly') { nd.setDate(nd.getDate() + 14); return nd; }
  var targetDay = anchorDay || nd.getDate();
  nd.setDate(1);
  if (interval === 'yearly') nd.setFullYear(nd.getFullYear() + 1);
  else nd.setMonth(nd.getMonth() + 1);
  var dim = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
  nd.setDate(Math.min(targetDay, dim));
  return nd;
}

function recurrenceSeriesKey(t) {
  if (t && t.recur_series_id) return t.recur_series_id;
  var interval = (t && t.recur_interval) || 'monthly';
  var anchor = (t && t.recur_anchor_date) || '';
  return 'legacy|' + (t && t.type || '') + '|' + (t && t.category || '') + '|' + (t && t.account_id || '') + '|' + Number(t && t.amount || 0) + '|' + interval + '|' + anchor + '|' + (t && t.subcategory || '') + '|' + (t && t.note || '');
}

function accountTouchesAccount(t, accountId, accountsCount) {
  accountsCount = accountsCount || 1;
  return !t.is_balance_adjustment && (t.account_id === accountId || t.to_account_id === accountId || (!t.account_id && t.type !== 'transfer' && accountsCount === 1));
}

function accountTxDelta(t, accountId, accountsList) {
  accountsList = accountsList || [{ id: accountId }];
  if (t.is_balance_adjustment) return 0;
  if (t.type === 'transfer') {
    var d = 0;
    var toExists = t.to_account_id && accountsList.some(function(a) { return a.id === t.to_account_id; });
    var fromExists = t.account_id && accountsList.some(function(a) { return a.id === t.account_id; });
    if (t.account_id === accountId && toExists) d -= Number(t.amount);
    if (t.to_account_id === accountId && fromExists) d += Number(t.amount);
    return d;
  }
  if (!(t.account_id === accountId || (!t.account_id && accountsList.length === 1))) return 0;
  return t.type === 'expense' ? -Number(t.amount) : Number(t.amount);
}

function accountVoidDelta(voided, accountId, baseDate, asOfDate, accountsList) {
  accountsList = accountsList || [{ id: accountId }];
  var tx = voided && voided.transaction_data;
  if (!tx || !accountTouchesAccount(tx, accountId, accountsList.length)) return 0;
  var voidedDate = String(voided.voided_at || '').slice(0, 10);
  if (!voidedDate || voidedDate <= baseDate || voidedDate > asOfDate || tx.date > baseDate) return 0;
  return -accountTxDelta(tx, accountId, accountsList);
}

// Simulador de processRecurring según index.html
function simulateProcessRecurring(state, todayStr) {
  var today = new Date(todayStr + 'T23:59:59.999');
  var recurring = state.transactions.filter(function(t) {
    return t.recurring && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
  });
  var processed = {};
  var createdTxs = [];

  for (var i = 0; i < recurring.length; i++) {
    var t = recurring[i];
    var interval = t.recur_interval || 'monthly';
    var seriesKey = recurrenceSeriesKey(t);
    if (processed[seriesKey]) continue;
    processed[seriesKey] = true;

    var related = recurring.filter(function(tx) {
      var txInterval = tx.recur_interval || 'monthly';
      if (t.recur_series_id) return tx.recur_series_id === t.recur_series_id;
      return !tx.recur_series_id && tx.category === t.category && tx.type === t.type &&
        tx.account_id === t.account_id && Math.abs(tx.amount - t.amount) < 0.01 &&
        txInterval === interval && (tx.subcategory || '') === (t.subcategory || '') &&
        (tx.note || '') === (t.note || '');
    });

    var root = related[0];
    related.forEach(function(tx) {
      if (new Date(tx.date + 'T12:00:00') < new Date(root.date + 'T12:00:00')) root = tx;
    });

    // LÓGICA DE INDEX.HTML línea 2073:
    // var anchorDay=parseInt(root.date.slice(8,10),10);
    var anchorDay = parseInt(root.date.slice(8, 10), 10);
    var endDate = root.recur_end_date ? new Date(root.recur_end_date + 'T12:00:00') : null;
    var lastDate = new Date(root.date + 'T12:00:00');
    related.forEach(function(tx) {
      var d = new Date(tx.date + 'T12:00:00');
      if (d > lastDate) lastDate = d;
    });

    var next = addInterval(lastDate, interval, anchorDay);
    while (next <= today && (!endDate || next <= endDate)) {
      var newDate = next.getFullYear() + '-' + pad(next.getMonth() + 1) + '-' + pad(next.getDate());
      var dup = state.transactions.find(function(tx) {
        if (root.recur_series_id) return tx.recur_series_id === root.recur_series_id && tx.date === newDate;
        return tx.category === root.category && tx.type === root.type && tx.account_id === root.account_id &&
          Math.abs(tx.amount - root.amount) < 0.01 && (tx.recur_interval || 'monthly') === interval && tx.date === newDate;
      });
      var isExcluded = state.recurrenceExclusions.some(function(x) {
        return x.recur_series_id === seriesKey && x.skipped_date === newDate;
      });

      if (!dup && !isExcluded) {
        var newTx = {
          id: 'tx_sim_' + newDate + '_' + Math.random().toString(36).slice(2, 6),
          type: root.type,
          amount: root.amount,
          category: root.category,
          subcategory: root.subcategory || null,
          note: root.note || null,
          date: newDate,
          recurring: true,
          recur_interval: interval,
          recur_end_date: root.recur_end_date || null,
          tags: root.tags || [],
          account_id: root.account_id || null,
          to_account_id: null,
          recur_series_id: root.recur_series_id || null,
          recur_anchor_date: root.recur_anchor_date || root.date,
          user_id: root.user_id
        };
        state.transactions.unshift(newTx);
        createdTxs.push(newTx);
      }
      next = addInterval(next, interval, anchorDay);
    }
  }
  return createdTxs;
}

// ==========================================
// EJECUCIÓN DE PRUEBAS Y AUDITORÍA
// ==========================================

console.log('========================================================================');
console.log('  FINTRACK: AUDITORÍA Y SIMULACIÓN PROFUNDA DE RECURRENCIAS Y ANULACIONES');
console.log('========================================================================\n');

// ----------------------------------------------------------------------
// SIMULACIÓN 1: Recurrencia 31 de Enero -> Febrero -> Marzo
// ----------------------------------------------------------------------
console.log('>>> TEST 1: Recurrencia mensual que inicia el 31 de enero');

// Caso 1A: Serie intacta en 2026 (año no bisiesto)
var state1A = {
  transactions: [
    { id: 'tx_jan', date: '2026-01-31', amount: 50, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_netflix', recur_anchor_date: '2026-01-31', user_id: 'u1' }
  ],
  recurrenceExclusions: []
};
var gen1A = simulateProcessRecurring(state1A, '2026-04-05');
console.log('  [Caso 1A - Serie normal 2026]:');
console.log('    Fechas generadas:', state1A.transactions.map(function(t) { return t.date; }).sort());
var dates1A = state1A.transactions.map(function(t) { return t.date; }).sort();
var ok1A = dates1A.includes('2026-01-31') && dates1A.includes('2026-02-28') && dates1A.includes('2026-03-31');
console.log('    ¿Se generó 31-ene -> 28-feb -> 31-mar?:', ok1A ? 'SÍ (Correcto)' : 'NO (Fallo)');

// Caso 1B: Serie en 2024 (año bisiesto)
var state1B = {
  transactions: [
    { id: 'tx_jan24', date: '2024-01-31', amount: 50, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_netflix24', recur_anchor_date: '2024-01-31', user_id: 'u1' }
  ],
  recurrenceExclusions: []
};
var gen1B = simulateProcessRecurring(state1B, '2024-04-05');
console.log('\n  [Caso 1B - Año bisiesto 2024]:');
console.log('    Fechas generadas:', state1B.transactions.map(function(t) { return t.date; }).sort());
var dates1B = state1B.transactions.map(function(t) { return t.date; }).sort();
var ok1B = dates1B.includes('2024-01-31') && dates1B.includes('2024-02-29') && dates1B.includes('2024-03-31');
console.log('    ¿Se generó 31-ene -> 29-feb -> 31-mar?:', ok1B ? 'SÍ (Correcto)' : 'NO (Fallo)');

// Caso 1C: ¿Qué pasa si el usuario borra la primera ocurrencia (31-ene)?
console.log('\n  [Caso 1C - BUG CRÍTICO: Borrado de ocurrencia ancla]');
var state1C = {
  transactions: [
    { id: 'tx_jan', date: '2026-01-31', amount: 50, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_corrupt', recur_anchor_date: '2026-01-31', user_id: 'u1' },
    { id: 'tx_feb', date: '2026-02-28', amount: 50, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_corrupt', recur_anchor_date: '2026-01-31', user_id: 'u1' }
  ],
  recurrenceExclusions: []
};
// Usuario borra SOLO la ocurrencia de enero (deleteOnlyRecurringOccurrence):
state1C.transactions = state1C.transactions.filter(function(t) { return t.id !== 'tx_jan'; });
state1C.recurrenceExclusions.push({ id: 'rx1', recur_series_id: 'rs_corrupt', skipped_date: '2026-01-31', user_id: 'u1' });

// Ahora llega marzo y corre processRecurring:
var gen1C = simulateProcessRecurring(state1C, '2026-04-05');
var dates1C = state1C.transactions.map(function(t) { return t.date; }).sort();
console.log('    Estado de transacciones tras borrado de enero y ejecución en abril:');
console.log('    Fechas generadas:', dates1C);
var hasBug1C = dates1C.includes('2026-03-28') && !dates1C.includes('2026-03-31');
console.log('    ¿Ocurrió la desviación (drift) a 2026-03-28 en vez de 2026-03-31?:', hasBug1C ? '🚨 SÍ, DETECTADO BUG DE ANCLA' : 'No');
console.log('    Explicación: processRecurring calcula `anchorDay = parseInt(root.date.slice(8,10))` usando root.date (28) en lugar de root.recur_anchor_date (31). Desde ese momento toda la serie queda desviada al día 28.');

// Caso 1D: Extinción total de la serie si se borran todas las ocurrencias generadas
console.log('\n  [Caso 1D - BUG DE EXTINCIÓN DE SERIE]');
var state1D = {
  transactions: [
    { id: 'tx_jan', date: '2026-01-31', amount: 50, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_extinct', recur_anchor_date: '2026-01-31', user_id: 'u1' }
  ],
  recurrenceExclusions: []
};
state1D.transactions = [];
state1D.recurrenceExclusions.push({ id: 'rx_jan', recur_series_id: 'rs_extinct', skipped_date: '2026-01-31', user_id: 'u1' });
var gen1D = simulateProcessRecurring(state1D, '2026-05-01');
console.log('    Ocurrencias generadas en mayo:', gen1D.length);
console.log('    ¿Se extinguió la serie para siempre?:', gen1D.length === 0 ? '🚨 SÍ, SERIE ABANDONADA PERMANENTEMENTE' : 'No');
console.log('    Explicación: No existe tabla de reglas de recurrencia. Si todas las transacciones generadas se borran, la serie desaparece del bucle de transactions.');

// ----------------------------------------------------------------------
// SIMULACIÓN 2: Edición y exclusiones (Single edit vs Series edit)
// ----------------------------------------------------------------------
console.log('\n>>> TEST 2: Edición de una sola ocurrencia frente a serie completa');

console.log('  [Caso 2A - BUG: Cuota legacy duplicada si se edita el importe]');
var state2A = {
  transactions: [
    { id: 'tx_leg1', date: '2026-02-01', amount: 30, type: 'expense', category: 'gym', recurring: true, recur_interval: 'monthly', recur_series_id: null, user_id: 'u1' }
  ],
  recurrenceExclusions: []
};
// Simular que processRecurring generó marzo con 30 €:
state2A.transactions.push({ id: 'tx_leg2', date: '2026-03-01', amount: 30, type: 'expense', category: 'gym', recurring: true, recur_interval: 'monthly', recur_series_id: null, user_id: 'u1' });
// Ahora el usuario edita la cuota de marzo para reflejar una subida a 35 € ("Solo esta"):
state2A.transactions[1].amount = 35;
// Corre processRecurring para el 5 de marzo:
simulateProcessRecurring(state2A, '2026-03-05');
var marchLegTxs = state2A.transactions.filter(function(t) { return t.category === 'gym' && t.date === '2026-03-01'; });
console.log('    Transacciones de gym el 2026-03-01:', marchLegTxs.map(function(t) { return t.id + ' (' + t.amount + ' €)'; }));
var hasDupLeg = marchLegTxs.length > 1;
console.log('    ¿Se duplicó la cuota de marzo regenerando los 30 € originales?:', hasDupLeg ? '🚨 SÍ, DUPLICACIÓN EN SERIES LEGACY' : 'No');

console.log('\n  [Caso 2B - BUG: Presupuesto automático (autoRecurBudgetBreakdown) congelado en precio antiguo]');
// autoRecurBudgetBreakdown toma root = transacción más antigua y multiplica root.amount * count.
var seriesHistory = [
  { id: 'tx_old', date: '2024-01-01', amount: 10, note: 'Netflix', recur_series_id: 'rs_net_price', recurring: true },
  { id: 'tx_new', date: '2026-03-01', amount: 18, note: 'Netflix', recur_series_id: 'rs_net_price', recurring: true }
];
// Simulamos autoRecurBudgetBreakdown para abril 2026:
var group = seriesHistory;
var rootBudget = group[0];
group.forEach(function(t) { if (new Date(t.date + 'T12:00:00') < new Date(rootBudget.date + 'T12:00:00')) rootBudget = t; });
var forecastAmt = rootBudget.amount * 1;
console.log('    Precio inicial de Netflix (2024): 10 €.');
console.log('    Precio actualizado en 2026: 18 €.');
console.log('    Previsión de presupuesto calculada para abril 2026:', forecastAmt, '€');
var hasBudgetBug = forecastAmt === 10;
console.log('    ¿Usa el importe de 2024 (10 €) en lugar del precio actual (18 €)?:', hasBudgetBug ? '🚨 SÍ, autoRecurBudgetBreakdown USA root.amount OBSOLETO' : 'No');

console.log('\n  [Caso 2C - BUG CRÍTICO EN UNDO: Deshacer eliminación de ocurrencia]');
console.log('    En skip_fintrack_recurring_occurrence (Postgres):');
console.log('      insert into public.recurrence_exclusions (id, ...)');
console.log('      values (\'rx\' || extract(epoch from clock_timestamp())::bigint || substr(md5(random()::text), 1, 6), ...)');
console.log('    En deleteOnlyRecurringOccurrence (JavaScript):');
console.log('      var exclusion = { id: \'rx\' + Date.now() + Math.random().toString(36).slice(2, 7), ... };');
console.log('    En undoRecurringOccurrenceDelete (JavaScript):');
console.log('      sb.from(\'recurrence_exclusions\').delete().eq(\'id\', exclusion.id);');
console.log('    Resultado: El id generado en JS NUNCA coincide con el id generado por Postgres.');
console.log('    El DELETE en Supabase borra 0 registros. La exclusión queda fija en la base de datos.');

// ----------------------------------------------------------------------
// SIMULACIÓN 3: Cancelación de serie offline y reconexión
// ----------------------------------------------------------------------
console.log('\n>>> TEST 3: Cancelación de serie offline y reconexión');

var offlineState = {
  isOffline: true,
  offlineQueue: [],
  transactions: [
    { id: 'tx_s1', date: '2026-01-15', amount: 20, type: 'expense', recurring: true, recur_series_id: 'rs_net', recur_interval: 'monthly', user_id: 'u1' },
    { id: 'tx_s2', date: '2026-02-15', amount: 20, type: 'expense', recurring: true, recur_series_id: 'rs_net', recur_interval: 'monthly', user_id: 'u1' },
    { id: 'tx_s3', date: '2026-03-15', amount: 20, type: 'expense', recurring: true, recur_series_id: 'rs_net', recur_interval: 'monthly', user_id: 'u1' }
  ],
  transactionVoids: []
};

function simulateDeleteRecurringFromHereOffline(state, targetTx) {
  var seriesKey = targetTx.recur_series_id;
  var all = state.transactions.filter(function(item) { return item.recurring && item.recur_series_id === seriesKey; });
  var past = all.filter(function(item) { return item.date < targetTx.date; });
  var toDelete = all.filter(function(item) { return item.date >= targetTx.date; });
  var stopFields = { recurring: false, recur_interval: null, recur_end_date: null, recur_series_id: null };

  past.forEach(function(item) {
    Object.assign(item, stopFields);
    state.offlineQueue.push({ type: 'update', table: 'transactions', id: item.id, data: stopFields });
  });

  toDelete.forEach(function(item) {
    var v = {
      id: 'tv_' + item.id,
      user_id: item.user_id,
      transaction_id: item.id,
      transaction_data: Object.assign({}, item),
      voided_at: new Date().toISOString()
    };
    state.transactionVoids.push(v);
    state.offlineQueue.push({ type: 'insert', table: 'transaction_voids', data: v });
    state.offlineQueue.push({ type: 'delete', table: 'transactions', id: item.id });
  });

  var deleteIds = {};
  toDelete.forEach(function(item) { deleteIds[item.id] = true; });
  state.transactions = state.transactions.filter(function(item) { return !deleteIds[item.id]; });
}

simulateDeleteRecurringFromHereOffline(offlineState, offlineState.transactions[1]);
console.log('  Estado local offline tras cancelación desde febrero:');
console.log('    Transacciones restantes:', offlineState.transactions.map(function(t) { return t.id + ' (rec=' + t.recurring + ')'; }));
console.log('    Anulaciones registradas:', offlineState.transactionVoids.map(function(v) { return v.transaction_id; }));
console.log('    Operaciones en cola offline:', offlineState.offlineQueue.length);
offlineState.offlineQueue.forEach(function(op, idx) {
  console.log('      Op ' + (idx + 1) + ':', op.type, '->', op.table, (op.id || (op.data && op.data.id)));
});

console.log('\n  Simulando reconexión a red (online -> processOfflineQueue -> loadData -> processRecurring):');
var serverTransactions = [
  { id: 'tx_s1', date: '2026-01-15', amount: 20, type: 'expense', recurring: true, recur_series_id: 'rs_net', recur_interval: 'monthly', user_id: 'u1' },
  { id: 'tx_s2', date: '2026-02-15', amount: 20, type: 'expense', recurring: true, recur_series_id: 'rs_net', recur_interval: 'monthly', user_id: 'u1' },
  { id: 'tx_s3', date: '2026-03-15', amount: 20, type: 'expense', recurring: true, recur_series_id: 'rs_net', recur_interval: 'monthly', user_id: 'u1' }
];
var serverVoids = [];

offlineState.offlineQueue.forEach(function(op) {
  if (op.type === 'update' && op.table === 'transactions') {
    var target = serverTransactions.find(function(t) { return t.id === op.id; });
    if (target) Object.assign(target, op.data);
  } else if (op.type === 'insert' && op.table === 'transaction_voids') {
    serverVoids.push(op.data);
  } else if (op.type === 'delete' && op.table === 'transactions') {
    serverTransactions = serverTransactions.filter(function(t) { return t.id !== op.id; });
  }
});
offlineState.offlineQueue = [];
offlineState.transactions = serverTransactions;
offlineState.transactionVoids = serverVoids;
offlineState.isOffline = false;

var postSyncGen = simulateProcessRecurring(offlineState, '2026-04-15');
console.log('    Ocurrencias regeneradas tras reconexión:', postSyncGen.length);
console.log('    ¿Se mantuvo cancelada la serie?:', postSyncGen.length === 0 ? 'SÍ (Correcto)' : 'NO (Fallo)');

console.log('\n  [RIESGO DETECTADO EN COLA OFFLINE]:');
console.log('    En index.html línea 1641: `sb.from(op.table).upsert(op.data, { onConflict: \'id\' })`');
console.log('    Pero en la tabla transaction_voids, la clave única es `(user_id, transaction_id)`.');
console.log('    Si una transacción ya fue anulada por otro dispositivo o importación, el upsert con onConflict:\'id\' fallará');
console.log('    con error de Postgres: duplicate key value violates unique constraint "transaction_voids_user_id_transaction_id_key".');

// ----------------------------------------------------------------------
// SIMULACIÓN 4: Anulación de movimiento histórico y accountVoidDelta
// ----------------------------------------------------------------------
console.log('\n>>> TEST 4: Anulación histórica y verificación matemática de accountVoidDelta');

var testAccId = 'acc_main';
var baseDate = '2026-01-15';
var baseRealBalance = 1000.00;

var voidedHistoricalExpense = {
  id: 'tv_exp_1',
  user_id: 'u1',
  transaction_id: 'tx_old_exp',
  transaction_data: {
    id: 'tx_old_exp',
    date: '2026-01-10',
    amount: 50.00,
    type: 'expense',
    account_id: testAccId
  },
  voided_at: '2026-01-20T10:00:00.000Z'
};

var delta4A = accountVoidDelta(voidedHistoricalExpense, testAccId, baseDate, '2026-01-25');
console.log('  [Caso 4A: Gasto anterior (-50 € el 10-ene) anulado tras ajuste (20-ene)]');
console.log('    accountVoidDelta devuelve:', delta4A, '€');
console.log('    Impacto en saldo calculado:', baseRealBalance + delta4A, '€ (Base: 1000 € + 50 €)');
console.log('    Verificación: ¿Compensa sumando +50 €?:', delta4A === 50 ? 'SÍ (+50 €)' : 'NO');

var voidedRecentExpense = {
  id: 'tv_exp_2',
  user_id: 'u1',
  transaction_id: 'tx_recent_exp',
  transaction_data: {
    id: 'tx_recent_exp',
    date: '2026-01-18',
    amount: 75.00,
    type: 'expense',
    account_id: testAccId
  },
  voided_at: '2026-01-20T10:00:00.000Z'
};
var delta4B = accountVoidDelta(voidedRecentExpense, testAccId, baseDate, '2026-01-25');
console.log('\n  [Caso 4B: Gasto posterior (18-ene > baseDate 15-ene) anulado el 20-ene]');
console.log('    accountVoidDelta devuelve:', delta4B, '€');
console.log('    ¿Devuelve 0 para evitar doble compensación con `live`?:', delta4B === 0 ? 'SÍ (Correcto)' : 'NO (Fallo)');

var voidedBeforeAdjustment = {
  id: 'tv_exp_3',
  user_id: 'u1',
  transaction_id: 'tx_prior_exp',
  transaction_data: {
    id: 'tx_prior_exp',
    date: '2026-01-05',
    amount: 100.00,
    type: 'expense',
    account_id: testAccId
  },
  voided_at: '2026-01-12T10:00:00.000Z'
};
var delta4C = accountVoidDelta(voidedBeforeAdjustment, testAccId, baseDate, '2026-01-25');
console.log('\n  [Caso 4C: Gasto anulado antes del ajuste (voidedDate 12-ene <= baseDate 15-ene)]');
console.log('    accountVoidDelta devuelve:', delta4C, '€');
console.log('    ¿Devuelve 0 porque el saldo real ya absorbió la anulación?:', delta4C === 0 ? 'SÍ (Correcto)' : 'NO (Fallo)');

console.log('\n  [Caso 4D - BUG DE ZONA HORARIA UTC]');
var voidedAtLocalMidnight = {
  id: 'tv_tz',
  user_id: 'u1',
  transaction_id: 'tx_tz',
  transaction_data: {
    id: 'tx_tz',
    date: '2026-01-10',
    amount: 30.00,
    type: 'expense',
    account_id: testAccId
  },
  voided_at: '2026-01-15T23:30:00.000Z' // 16 de enero 00:30 España (UTC+1)
};
var delta4D = accountVoidDelta(voidedAtLocalMidnight, testAccId, '2026-01-15', '2026-01-25');
console.log('    Anulación realizada localmente el 16-ene a las 00:30 (UTC: 2026-01-15T23:30).');
console.log('    baseDate del ajuste: 2026-01-15.');
console.log('    accountVoidDelta devuelve:', delta4D, '€');
console.log('    ¿Fallo por UTC (voidedDate <= baseDate retorna 0 ignorando la anulación local)?:', delta4D === 0 ? '🚨 SÍ, ANULACIÓN DESECHADA POR COMPARACIÓN UTC' : 'No');

console.log('\n  [Caso 4E - ANÁLISIS CONTABLE: Dilema de Saldo Fantasma e Inconsistencia]');
console.log('    Supongamos:');
console.log('      - 10-ene: Gasto erróneo en FinTrack de 50 € (en el banco nunca ocurrió).');
console.log('      - 15-ene: Usuario concilia cuenta. En el banco hay 1.000 € reales.');
console.log('        FinTrack calculaba teórico: 950 €. Desfase = +50 €.');
console.log('        FinTrack crea transacción vinculada de ajuste `txbal_p1` = +50 € (ingreso).');
console.log('      - 20-ene: Usuario borra el gasto erróneo de 50 € del día 10.');
console.log('        `accountVoidDelta` detecta anulación y añade +50 € al saldo calculado.');
console.log('        Saldo calculado actual = 1000 + 50 = 1.050 €.');
console.log('        PERO en el banco físico sigue habiendo 1.000 €.');
console.log('        Además, la transacción `txbal_p1` (+50 €) sigue sumando a los ingresos de enero.');
console.log('    Conclusión: El borrado retroactivo de un movimiento anterior al snapshot introduce');
console.log('    un desajuste de 50 € en el saldo actual y deja huérfana la transacción de conciliación.');

console.log('\n========================================================================');
console.log('  FIN DE LA AUDITORÍA Y SIMULACIÓN');
console.log('========================================================================');
