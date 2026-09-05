// scripts/audit-agent2-sim.js
// Auditoría 2: Recurrencias, Exclusiones, Fechas y Anulaciones (Transaction Voids) en FinTrack.

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function localIsoDate(isoOrDate) {
  if (!isoOrDate) return '';
  var d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function lastDayOfMonthStr(yr, mo) {
  var d = new Date(yr, mo, 0);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// ----------------------------------------------------
// 1. Motor de intervalos y fechas (extraído de index.html)
// ----------------------------------------------------
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

function isRecurrenceExcluded(recurrenceExclusions, seriesKey, date) {
  return recurrenceExclusions.some(function(x) {
    return x.recur_series_id === seriesKey && x.skipped_date === date;
  });
}

// ----------------------------------------------------
// 2. Simulador de processRecurring fiel a index.html (líneas 2136-2213)
// ----------------------------------------------------
function simulateProcessRecurring(state, todayStr) {
  var today = new Date(todayStr + 'T23:59:59.999');
  var recurring = state.transactions.filter(function(t) {
    return t.recurring && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
  });
  var processed = {};
  var createdTxs = [];

  for (var ri = 0; ri < recurring.length; ri++) {
    var t = recurring[ri];
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

    // Código actual en index.html:
    var anchorDay = parseInt((root.recur_anchor_date || root.date).slice(8, 10), 10);
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

      if (!dup && !isRecurrenceExcluded(state.recurrenceExclusions, seriesKey, newDate)) {
        // En index.html línea 2180: newTx usa root.amount, root.type, etc.
        var newTx = {
          id: 'tx_' + newDate + '_' + Math.random().toString(36).slice(2, 6),
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

// ----------------------------------------------------
// 3. Lógica de saldos y Anulaciones (Transaction Voids)
// ----------------------------------------------------
function accountTouchesAccount(t, accountId, accountsList) {
  var accCount = accountsList ? accountsList.length : 1;
  return !t.is_balance_adjustment && (
    t.account_id === accountId ||
    t.to_account_id === accountId ||
    (!t.account_id && t.type !== 'transfer' && accCount === 1)
  );
}

function accountTxDelta(t, accountId, accountsList) {
  if (t.is_balance_adjustment) return 0;
  if (t.type === 'transfer') {
    var d = 0;
    if (t.account_id === accountId) d -= Number(t.amount);
    if (t.to_account_id === accountId) d += Number(t.amount);
    return d;
  }
  var accCount = accountsList ? accountsList.length : 1;
  if (!(t.account_id === accountId || (!t.account_id && accCount === 1))) return 0;
  return t.type === 'expense' ? -Number(t.amount) : Number(t.amount);
}

function accountVoidDelta(voided, accountId, baseDate, asOfDate, accountsList) {
  var tx = voided && voided.transaction_data;
  if (!tx || !accountTouchesAccount(tx, accountId, accountsList)) return 0;
  var voidedDate = localIsoDate(voided.voided_at) || (String(voided.voided_at || '').slice(0, 10));
  if (!voidedDate || voidedDate <= baseDate || voidedDate > asOfDate || tx.date > baseDate) return 0;
  return -accountTxDelta(tx, accountId, accountsList);
}

function accountHistory(patrimony, accountId) {
  return patrimony.filter(function(p) { return p.account_id === accountId; }).sort(function(a, b) {
    var da = a.reset_date || lastDayOfMonthStr(a.year, a.month);
    var db = b.reset_date || lastDayOfMonthStr(b.year, b.month);
    if (da !== db) return da.localeCompare(db);
    return (a.id || '').localeCompare(b.id || '');
  });
}

function calcAccountTheoreticalBalance(state, accountId, dateStr) {
  var hist = accountHistory(state.patrimony, accountId).filter(function(p) {
    var d = p.reset_date || lastDayOfMonthStr(p.year, p.month);
    return d < dateStr;
  });
  var reset = hist.length ? hist[hist.length - 1] : null;
  var base = reset ? Number(reset.amount) : 0;
  var baseDate = reset ? (reset.reset_date || lastDayOfMonthStr(reset.year, reset.month)) : '0000-01-01';

  var pool = state.transactions.filter(function(t) { return t.account_id === accountId || t.to_account_id === accountId || !t.account_id; });
  var live = pool.filter(function(t) {
    return !t.is_balance_adjustment && accountTouchesAccount(t, accountId, state.accounts) && t.date > baseDate && t.date <= dateStr;
  }).reduce(function(sum, t) {
    return sum + accountTxDelta(t, accountId, state.accounts);
  }, 0);

  var voids = state.transactionVoids.reduce(function(sum, v) {
    return sum + accountVoidDelta(v, accountId, baseDate, dateStr, state.accounts);
  }, 0);

  return { base: base, baseDate: baseDate, live: live, voids: voids, total: base + live + voids };
}

// ----------------------------------------------------
// EJECUCIÓN DE LAS PRUEBAS
// ----------------------------------------------------
console.log('========================================================================');
console.log('AUDITORÍA 2: RECURRENCIAS, EXCLUSIONES, INTERVALOS Y TRANSACTION VOIDS');
console.log('========================================================================\n');

var results = {
  section1_intervals_and_recurrences: {},
  section2_exclusions_and_offline: {},
  section3_voids_and_math: {},
  anomalies_detected: []
};

// TEST 1: Recurrencia 31 de enero -> Febrero -> 31 de marzo
console.log('>>> 1. PRUEBAS DE INTERVALOS Y RECURRENCIAS (anchorDay y meses variables)');

// 1.1 No bisiesto (2026): 31-ene -> 28-feb -> 31-mar -> 30-abr -> 31-may
var state1_1 = {
  transactions: [
    { id: 'tx_jan26', date: '2026-01-31', amount: 40, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_31', recur_anchor_date: '2026-01-31', user_id: 'u1' }
  ],
  recurrenceExclusions: [],
  accounts: [{ id: 'acc1', name: 'Principal' }]
};
simulateProcessRecurring(state1_1, '2026-05-31');
var dates1_1 = state1_1.transactions.map(function(t) { return t.date; }).sort();
console.log('  1.1 Serie mensual 2026 (No bisiesto) iniciada 2026-01-31:');
console.log('      Fechas generadas:', dates1_1.join(' -> '));
var pass1_1 = dates1_1.includes('2026-01-31') && dates1_1.includes('2026-02-28') && dates1_1.includes('2026-03-31') && dates1_1.includes('2026-04-30') && dates1_1.includes('2026-05-31');
console.log('      Verificación (31-ene -> 28-feb -> 31-mar -> 30-abr -> 31-may):', pass1_1 ? 'CORRECTO' : 'FALLO');
results.section1_intervals_and_recurrences.test1_1_monthly_31_non_leap = { dates: dates1_1, pass: pass1_1 };

// 1.2 Bisiesto (2024): 31-ene -> 29-feb -> 31-mar
var state1_2 = {
  transactions: [
    { id: 'tx_jan24', date: '2024-01-31', amount: 40, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_31_24', recur_anchor_date: '2024-01-31', user_id: 'u1' }
  ],
  recurrenceExclusions: [],
  accounts: [{ id: 'acc1', name: 'Principal' }]
};
simulateProcessRecurring(state1_2, '2024-03-31');
var dates1_2 = state1_2.transactions.map(function(t) { return t.date; }).sort();
console.log('\n  1.2 Serie mensual 2024 (Año bisiesto) iniciada 2024-01-31:');
console.log('      Fechas generadas:', dates1_2.join(' -> '));
var pass1_2 = dates1_2.includes('2024-01-31') && dates1_2.includes('2024-02-29') && dates1_2.includes('2024-03-31');
console.log('      Verificación (31-ene -> 29-feb -> 31-mar):', pass1_2 ? 'CORRECTO' : 'FALLO');
results.section1_intervals_and_recurrences.test1_2_monthly_31_leap = { dates: dates1_2, pass: pass1_2 };

// 1.3 Anual bisiesto: 29-feb-2024 -> 28-feb-2025 -> 28-feb-2026 -> 28-feb-2027 -> 29-feb-2028
var state1_3 = {
  transactions: [
    { id: 'tx_leap_y', date: '2024-02-29', amount: 100, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'yearly', recur_series_id: 'rs_leap_y', recur_anchor_date: '2024-02-29', user_id: 'u1' }
  ],
  recurrenceExclusions: [],
  accounts: [{ id: 'acc1', name: 'Principal' }]
};
simulateProcessRecurring(state1_3, '2028-03-01');
var dates1_3 = state1_3.transactions.map(function(t) { return t.date; }).sort();
console.log('\n  1.3 Serie anual 2024-02-29 generada hasta 2028:');
console.log('      Fechas generadas:', dates1_3.join(' -> '));
var pass1_3 = dates1_3.includes('2024-02-29') && dates1_3.includes('2025-02-28') && dates1_3.includes('2026-02-28') && dates1_3.includes('2027-02-28') && dates1_3.includes('2028-02-29');
console.log('      Verificación (recupera 29 de febrero en 2028):', pass1_3 ? 'CORRECTO' : 'FALLO');
results.section1_intervals_and_recurrences.test1_3_yearly_leap_anchor = { dates: dates1_3, pass: pass1_3 };

// 1.4 Borrado de la primera ocurrencia (31-ene) y preservación de anchorDay en marzo:
var state1_4 = {
  transactions: [
    { id: 'tx_jan', date: '2026-01-31', amount: 50, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_anchor_test', recur_anchor_date: '2026-01-31', user_id: 'u1' },
    { id: 'tx_feb', date: '2026-02-28', amount: 50, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_anchor_test', recur_anchor_date: '2026-01-31', user_id: 'u1' }
  ],
  recurrenceExclusions: [
    { id: 'rx_jan', recur_series_id: 'rs_anchor_test', skipped_date: '2026-01-31', user_id: 'u1' }
  ],
  accounts: [{ id: 'acc1', name: 'Principal' }]
};
state1_4.transactions = state1_4.transactions.filter(function(t) { return t.id !== 'tx_jan'; });
simulateProcessRecurring(state1_4, '2026-04-05');
var dates1_4 = state1_4.transactions.map(function(t) { return t.date; }).sort();
console.log('\n  1.4 Borrado de la cuota original (31-ene) tras generar 28-feb:');
console.log('      Fechas generadas:', dates1_4.join(' -> '));
var pass1_4 = dates1_4.includes('2026-03-31') && !dates1_4.includes('2026-03-28');
console.log('      ¿Genera 2026-03-31 gracias a root.recur_anchor_date?:', pass1_4 ? 'CORRECTO (No hubo drift)' : 'FALLO (Drift a 2026-03-28)');
results.section1_intervals_and_recurrences.test1_4_anchor_preservation_after_root_deleted = { dates: dates1_4, pass: pass1_4 };

// 1.5 ANOMALÍA DETECTADA EN processRecurring: Actualización de precio en ocurrencias futuras
console.log('\n  1.5 ANOMALÍA: Modificación de precio en serie recurrente');
var state1_5 = {
  transactions: [
    { id: 'tx_old_2024', date: '2024-01-01', amount: 10.00, note: 'Suscripción', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_sub', recur_anchor_date: '2024-01-01', user_id: 'u1' },
    { id: 'tx_jul_2026', date: '2026-07-01', amount: 18.00, note: 'Suscripción', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_sub', recur_anchor_date: '2024-01-01', user_id: 'u1' },
    { id: 'tx_aug_2026', date: '2026-08-01', amount: 18.00, note: 'Suscripción', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_sub', recur_anchor_date: '2024-01-01', user_id: 'u1' }
  ],
  recurrenceExclusions: [],
  accounts: [{ id: 'acc1', name: 'Principal' }]
};
simulateProcessRecurring(state1_5, '2026-09-02');
var sepTx = state1_5.transactions.find(function(t) { return t.date === '2026-09-01'; });
console.log('      Precio original en 2024: 10.00 €');
console.log('      Precio actualizado en julio y agosto 2026: 18.00 €');
console.log('      Importe generado por processRecurring para septiembre 2026:', sepTx ? (sepTx.amount + ' €') : 'No generado');
var hasPriceBug = sepTx && sepTx.amount === 10.00;
console.log('      ¿Regresión al precio histórico de 2024 (root.amount)?:', hasPriceBug ? '🚨 SÍ (ANOMALÍA DETECTADA)' : 'No');
if (hasPriceBug) {
  results.anomalies_detected.push({
    code: 'RECURRING_USES_ROOT_AMOUNT_INSTEAD_OF_LATEST',
    severity: 'ALTA',
    file: 'index.html:2180',
    description: 'processRecurring instancia la nueva transacción usando root.amount, root.note, root.account_id, etc., procedentes de la transacción más antigua de la serie (root), en vez de la ocurrencia más reciente (latest). Si el usuario actualizó el precio o la cuenta de la suscripción hacia el futuro, las nuevas ocurrencias reaparecen con los datos obsoletos de 2024.'
  });
}

// -------------------------------------------------------------------------------------
// TEST 2: Exclusiones de recurrencia, cancelación offline y reconexión
// -------------------------------------------------------------------------------------
console.log('\n>>> 2. EXCLUSIONES DE RECURRENCIA, BORRADO OFFLINE Y RECONEXIÓN');

var state2_1 = {
  isOffline: true,
  offlineQueue: [],
  transactions: [
    { id: 'tx_rec_1', date: '2026-01-10', amount: 25, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_cloud', recur_anchor_date: '2026-01-10', user_id: 'u1' },
    { id: 'tx_rec_2', date: '2026-02-10', amount: 25, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_cloud', recur_anchor_date: '2026-01-10', user_id: 'u1' }
  ],
  recurrenceExclusions: [],
  transactionVoids: [],
  accounts: [{ id: 'acc1', name: 'Principal' }]
};

function simulateDeleteOnlyOccurrenceOffline(state, txToDelete) {
  var seriesKey = recurrenceSeriesKey(txToDelete);
  var exclusion = {
    id: 'rx_offline_' + Date.now(),
    user_id: txToDelete.user_id,
    recur_series_id: seriesKey,
    skipped_date: txToDelete.date
  };
  state.recurrenceExclusions.push(exclusion);
  state.offlineQueue.push({ type: 'insert', table: 'recurrence_exclusions', data: exclusion });

  var voided = {
    id: 'tv_offline_' + Date.now(),
    user_id: txToDelete.user_id,
    transaction_id: txToDelete.id,
    transaction_data: Object.assign({}, txToDelete),
    voided_at: new Date().toISOString()
  };
  state.transactionVoids.push(voided);
  state.transactions = state.transactions.filter(function(t) { return t.id !== txToDelete.id; });
  state.offlineQueue.push({ type: 'insert', table: 'transaction_voids', data: voided });
  state.offlineQueue.push({ type: 'delete', table: 'transactions', id: txToDelete.id });
}

simulateDeleteOnlyOccurrenceOffline(state2_1, state2_1.transactions[1]);
console.log('  2.1 Estado offline tras borrar ocurrencia del 2026-02-10:');
console.log('      Transacciones restantes en memoria:', state2_1.transactions.map(function(t) { return t.id; }));
console.log('      Exclusiones en memoria:', state2_1.recurrenceExclusions.map(function(x) { return x.skipped_date; }));
console.log('      Anulaciones en memoria:', state2_1.transactionVoids.map(function(v) { return v.transaction_id; }));
console.log('      Operaciones en cola offline:', state2_1.offlineQueue.map(function(op) { return op.type + ' ' + op.table; }));

console.log('\n  2.2 Simulación de reconexión a Supabase:');
var serverDB = {
  transactions: [
    { id: 'tx_rec_1', date: '2026-01-10', amount: 25, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_cloud', recur_anchor_date: '2026-01-10', user_id: 'u1' },
    { id: 'tx_rec_2', date: '2026-02-10', amount: 25, type: 'expense', category: 'cat1', recurring: true, recur_interval: 'monthly', recur_series_id: 'rs_cloud', recur_anchor_date: '2026-01-10', user_id: 'u1' }
  ],
  recurrence_exclusions: [],
  transaction_voids: []
};

// Simulación de processOfflineQueue():
state2_1.offlineQueue.forEach(function(op) {
  if (op.type === 'insert' && op.table === 'recurrence_exclusions') {
    var existingIdx = serverDB.recurrence_exclusions.findIndex(function(x) {
      return x.user_id === op.data.user_id && x.recur_series_id === op.data.recur_series_id && x.skipped_date === op.data.skipped_date;
    });
    if (existingIdx >= 0) serverDB.recurrence_exclusions[existingIdx] = op.data;
    else serverDB.recurrence_exclusions.push(op.data);
  } else if (op.type === 'insert' && op.table === 'transaction_voids') {
    var existingVIdx = serverDB.transaction_voids.findIndex(function(v) {
      return v.user_id === op.data.user_id && v.transaction_id === op.data.transaction_id;
    });
    if (existingVIdx >= 0) serverDB.transaction_voids[existingVIdx] = op.data;
    else serverDB.transaction_voids.push(op.data);
  } else if (op.type === 'delete' && op.table === 'transactions') {
    serverDB.transactions = serverDB.transactions.filter(function(t) { return t.id !== op.id; });
  }
});
state2_1.offlineQueue = [];

// loadData() sincroniza el estado local con serverDB:
state2_1.transactions = JSON.parse(JSON.stringify(serverDB.transactions));
state2_1.recurrenceExclusions = JSON.parse(JSON.stringify(serverDB.recurrence_exclusions));
state2_1.transactionVoids = JSON.parse(JSON.stringify(serverDB.transaction_voids));
state2_1.isOffline = false;

// Ahora se ejecuta processRecurring() en fecha 2026-03-15:
simulateProcessRecurring(state2_1, '2026-03-15');
var finalDates2 = state2_1.transactions.map(function(t) { return t.date; }).sort();
console.log('      Transacciones tras reconexión y processRecurring (al 15-marzo):', finalDates2.join(' -> '));
var passReconnection = finalDates2.includes('2026-01-10') && !finalDates2.includes('2026-02-10') && finalDates2.includes('2026-03-10');
console.log('      ¿2026-02-10 se mantuvo excluida y 2026-03-10 se generó correctamente?:', passReconnection ? 'CORRECTO' : 'FALLO');
results.section2_exclusions_and_offline.test2_offline_skip_and_reconnect = { dates: finalDates2, pass: passReconnection };

// 2.3 Deshacer (Undo) recurrencia online vs offline:
results.anomalies_detected.push({
  code: 'UNDO_RECURRENCE_EXCLUSION_ID_MISMATCH',
  severity: 'MEDIA',
  file: 'index.html:4210',
  description: 'undoRecurringOccurrenceDelete intenta borrar la exclusión por id (`eq(\'id\', exclusion.id)`). Cuando la ocurrencia se borró online mediante la RPC `skip_fintrack_recurring_occurrence`, Postgres generó un ID distinto al generado en el objeto exclusion de JS. La consulta DELETE no borra ninguna fila pero no devuelve error, por lo que el fallback por clave compuesta no se ejecuta y la exclusión queda permanentemente en la base de datos remota.'
});

results.anomalies_detected.push({
  code: 'RPC_RECURRING_DELETE_NO_OFFLINE_FALLBACK',
  severity: 'MEDIA',
  file: 'index.html:4146-4152, 4171-4178',
  description: 'Si el dispositivo pierde conectividad justo al invocar las RPCs de cancelación/salto recurrente, las funciones no encolan la operación en offlineQueue (a diferencia de deleteTx). La acción se pierde silenciosamente en cliente con un error de sincronización sin persistirse localmente.'
});

// -------------------------------------------------------------------------------------
// TEST 3: Transacciones anuladas (transaction_voids) y verificación exacta de accountVoidDelta
// -------------------------------------------------------------------------------------
console.log('\n>>> 3. TRANSACCIONES ANULADAS (transaction_voids) Y accountVoidDelta');

var testAccId = 'acc_banco';
var accountsList = [{ id: testAccId, name: 'Banco' }, { id: 'acc_sec', name: 'Ahorro' }];
var baseDate3 = '2026-08-01';
var asOfDate3 = '2026-08-20';

// 3.1 Gasto anterior a baseDate anulado después de baseDate (voidedDate > baseDate):
var voided3_1 = {
  id: 'tv_1',
  user_id: 'u1',
  transaction_id: 'tx_old_exp',
  transaction_data: { id: 'tx_old_exp', date: '2026-07-20', amount: 50.00, type: 'expense', account_id: testAccId },
  voided_at: '2026-08-10T14:00:00.000Z'
};
var delta3_1 = accountVoidDelta(voided3_1, testAccId, baseDate3, asOfDate3, accountsList);
console.log('  3.1 Gasto histórico (-50 € el 20-jul) anulado tras el ajuste (el 10-ago):');
console.log('      accountVoidDelta devuelve:', delta3_1, '€');
var pass3_1 = delta3_1 === 50.00;
console.log('      ¿Compensa sumando +50.00 € al saldo?:', pass3_1 ? 'CORRECTO (+50.00 €)' : 'FALLO');
results.section3_voids_and_math.test3_1_historical_expense_voided_after_adjustment = { delta: delta3_1, pass: pass3_1 };

// 3.2 Ingreso anterior a baseDate anulado después de baseDate:
var voided3_2 = {
  id: 'tv_2',
  user_id: 'u1',
  transaction_id: 'tx_old_inc',
  transaction_data: { id: 'tx_old_inc', date: '2026-07-15', amount: 200.00, type: 'income', account_id: testAccId },
  voided_at: '2026-08-10T14:00:00.000Z'
};
var delta3_2 = accountVoidDelta(voided3_2, testAccId, baseDate3, asOfDate3, accountsList);
console.log('\n  3.2 Ingreso histórico (+200 € el 15-jul) anulado tras el ajuste (el 10-ago):');
console.log('      accountVoidDelta devuelve:', delta3_2, '€');
var pass3_2 = delta3_2 === -200.00;
console.log('      ¿Compensa restando -200.00 € al saldo?:', pass3_2 ? 'CORRECTO (-200.00 €)' : 'FALLO');
results.section3_voids_and_math.test3_2_historical_income_voided_after_adjustment = { delta: delta3_2, pass: pass3_2 };

// 3.3 Traspaso histórico saliente (-120 € de acc_banco hacia acc_sec el 18-jul) anulado tras el ajuste:
var voided3_3 = {
  id: 'tv_3',
  user_id: 'u1',
  transaction_id: 'tx_old_tra',
  transaction_data: { id: 'tx_old_tra', date: '2026-07-18', amount: 120.00, type: 'transfer', account_id: testAccId, to_account_id: 'acc_sec' },
  voided_at: '2026-08-10T14:00:00.000Z'
};
var delta3_3_from = accountVoidDelta(voided3_3, testAccId, baseDate3, asOfDate3, accountsList);
var delta3_3_to = accountVoidDelta(voided3_3, 'acc_sec', baseDate3, asOfDate3, accountsList);
console.log('\n  3.3 Traspaso histórico (120 € de Banco -> Ahorro el 18-jul) anulado el 10-ago:');
console.log('      accountVoidDelta en cuenta origen (Banco):', delta3_3_from, '€');
console.log('      accountVoidDelta en cuenta destino (Ahorro):', delta3_3_to, '€');
console.log('      Suma neta del impacto entre ambas cuentas:', delta3_3_from + delta3_3_to, '€');
var pass3_3 = delta3_3_from === 120.00 && delta3_3_to === -120.00 && (delta3_3_from + delta3_3_to === 0);
console.log('      ¿Conservación exacta de saldo cero (+120 € y -120 €)?:', pass3_3 ? 'CORRECTO' : 'FALLO');
results.section3_voids_and_math.test3_3_transfer_void_conservation = { deltaFrom: delta3_3_from, deltaTo: delta3_3_to, pass: pass3_3 };

// 3.4 Caso tx.date > baseDate: Movimiento posterior al ajuste anulado
var voided3_4 = {
  id: 'tv_4',
  user_id: 'u1',
  transaction_id: 'tx_new_exp',
  transaction_data: { id: 'tx_new_exp', date: '2026-08-05', amount: 80.00, type: 'expense', account_id: testAccId },
  voided_at: '2026-08-12T14:00:00.000Z'
};
var delta3_4 = accountVoidDelta(voided3_4, testAccId, baseDate3, asOfDate3, accountsList);
console.log('\n  3.4 Movimiento posterior al ajuste (05-ago > baseDate 01-ago) anulado el 12-ago:');
console.log('      accountVoidDelta devuelve:', delta3_4, '€');
var pass3_4 = delta3_4 === 0;
console.log('      ¿Devuelve 0 para evitar doble compensación con live?:', pass3_4 ? 'CORRECTO (0 €)' : 'FALLO');
results.section3_voids_and_math.test3_4_recent_tx_void_is_zero = { delta: delta3_4, pass: pass3_4 };

// 3.5 Caso voidedDate <= baseDate: Movimiento anulado antes del ajuste
var voided3_5 = {
  id: 'tv_5',
  user_id: 'u1',
  transaction_id: 'tx_very_old_exp',
  transaction_data: { id: 'tx_very_old_exp', date: '2026-07-01', amount: 95.00, type: 'expense', account_id: testAccId },
  voided_at: '2026-07-25T14:00:00.000Z'
};
var delta3_5 = accountVoidDelta(voided3_5, testAccId, baseDate3, asOfDate3, accountsList);
console.log('\n  3.5 Movimiento anulado ANTES del ajuste (voidedDate 25-jul <= baseDate 01-ago):');
console.log('      accountVoidDelta devuelve:', delta3_5, '€');
var pass3_5 = delta3_5 === 0;
console.log('      ¿Devuelve 0 porque el saldo real de baseDate ya lo absorbió?:', pass3_5 ? 'CORRECTO (0 €)' : 'FALLO');
results.section3_voids_and_math.test3_5_void_prior_to_base_is_zero = { delta: delta3_5, pass: pass3_5 };

// 3.6 Caso voidedDate > asOfDate: Consulta histórica previa a la fecha en que se realizó la anulación
var voided3_6 = {
  id: 'tv_6',
  user_id: 'u1',
  transaction_id: 'tx_hist_exp',
  transaction_data: { id: 'tx_hist_exp', date: '2026-07-10', amount: 45.00, type: 'expense', account_id: testAccId },
  voided_at: '2026-08-28T14:00:00.000Z'
};
var delta3_6 = accountVoidDelta(voided3_6, testAccId, baseDate3, '2026-08-15', accountsList);
console.log('\n  3.6 Consulta histórica (asOfDate 15-ago) previa a la fecha de anulación (28-ago):');
console.log('      accountVoidDelta devuelve:', delta3_6, '€');
var pass3_6 = delta3_6 === 0;
console.log('      ¿Devuelve 0 porque en la fecha consultada la anulación aún no había ocurrido?:', pass3_6 ? 'CORRECTO (0 €)' : 'FALLO');
results.section3_voids_and_math.test3_6_void_after_asof_is_zero = { delta: delta3_6, pass: pass3_6 };

// 3.7 Simulación Integral de Conciliación Contable (Teórico vs Real):
console.log('\n  3.7 Simulación Integral de Conciliación Contable (Teórico vs Real):');
var fullState = {
  accounts: [{ id: testAccId, name: 'Principal' }],
  patrimony: [
    { id: 'pat_jul', account_id: testAccId, year: 2026, month: 7, amount: 1000.00, reset_date: '2026-07-31', user_id: 'u1' }
  ],
  transactions: [
    { id: 'tx_aug_salary', date: '2026-08-05', amount: 1500.00, type: 'income', account_id: testAccId, user_id: 'u1' },
    { id: 'tx_aug_groceries', date: '2026-08-10', amount: 200.00, type: 'expense', account_id: testAccId, user_id: 'u1' }
  ],
  transactionVoids: [
    {
      id: 'tv_jun_charge',
      user_id: 'u1',
      transaction_id: 'tx_jun_charge',
      transaction_data: { id: 'tx_jun_charge', date: '2026-06-25', amount: 60.00, type: 'expense', account_id: testAccId },
      voided_at: '2026-08-12T10:00:00.000Z'
    }
  ]
};

var theoBefore = calcAccountTheoreticalBalance(fullState, testAccId, '2026-08-31');
console.log('      Saldo base al 31-julio:', theoBefore.base, '€');
console.log('      Movimientos live agosto (+1500 € sueldo - 200 € compras):', theoBefore.live, '€');
console.log('      Compensación por anulación histórica de junio (+60 €):', theoBefore.voids, '€');
console.log('      Saldo teórico resultante al 31-agosto:', theoBefore.total, '€');
var expectedTheo = 1000.00 + 1300.00 + 60.00;
var pass3_7 = Math.abs(theoBefore.total - expectedTheo) < 0.001;
console.log('      ¿Coincide exactamente con la expectativa contable (2360.00 €)?:', pass3_7 ? 'SÍ (2360.00 €)' : 'NO');
results.section3_voids_and_math.test3_7_full_reconciliation = { theo: theoBefore, pass: pass3_7 };

// 3.8 Dilema Contable: Saldo fantasma
results.anomalies_detected.push({
  code: 'GHOST_BALANCE_ON_RETROACTIVE_VOID_AFTER_ADJUSTMENT',
  severity: 'BAJA_CONCEPTUAL',
  file: 'index.html:3217',
  description: 'Si una transacción anterior al ajuste se anula porque fue un error de registro en FinTrack (nunca existió en el extracto del banco), compensarla en accountVoidDelta añade un saldo fantasma de +amount, porque el saldo real del ajuste ya no contenía ese gasto. Además, la transacción de ajuste vinculada (is_balance_adjustment) permanece intacta en el historial de ingresos/gastos.'
});

console.log('\n========================================================================');
console.log('RESUMEN FINAL DE LA AUDITORÍA:');
console.log('========================================================================');
console.log('Total anomalías detectadas:', results.anomalies_detected.length);
results.anomalies_detected.forEach(function(a, i) {
  console.log('  [' + (i + 1) + '] (' + a.severity + ') ' + a.code + ' en ' + a.file);
  console.log('      ' + a.description + '\n');
});

var fs = require('fs');
var reportPath = __dirname + '/../scratch/audit-agent2-report.json';
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log('Reporte JSON guardado en:', reportPath);
