/**
 * test-audit-agent7.js
 * Suite completa de auditoría y simulación para el Auditor 7 de FinTrack:
 * 1. Cifrado local Web Crypto (AES-GCM 256) e IndexedDB ('fintrack-secure-cache')
 * 2. Modo Offline y cola de sincronización (offlineQueue, queueOp, processOfflineQueue)
 * 3. Función clearLocalCacheAndResync y recuperación de estado fresco
 * 4. Resiliencia, degradación, concurrencia y aislamiento multiusuario
 */

const assert = require('assert');
const { webcrypto } = require('crypto');

const crypto = webcrypto;

console.log('================================================================');
console.log(' AUDITORÍA AGENTE 7: CACHÉ CIFRADA, MODO OFFLINE Y RESINCRONIZACIÓN');
console.log('================================================================\n');

// ----------------------------------------------------
// Mocks para localStorage, IndexedDB y Supabase
// ----------------------------------------------------

class MockLocalStorage {
  constructor() {
    this.store = new Map();
    this.failOnSet = false;
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    if (this.failOnSet) {
      const err = new Error('QuotaExceededError: The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

class MockObjectStore {
  constructor(map) {
    this.map = map;
  }
  get(key) {
    const req = { onsuccess: null, onerror: null, result: this.map.get(key) };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
  put(value, key) {
    this.map.set(key, value);
    const req = { onsuccess: null, onerror: null, result: key };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
}

class MockIndexedDB {
  constructor() {
    this.databases = new Map();
    this.unavailable = false;
  }
  open(dbName, version) {
    if (this.unavailable) {
      const req = { onsuccess: null, onerror: null, error: new Error('IndexedDB no disponible o bloqueado') };
      setTimeout(() => {
        if (req.onerror) req.onerror({ target: req });
      }, 0);
      return req;
    }
    if (!this.databases.has(dbName)) {
      this.databases.set(dbName, new Map());
    }
    const dbMap = this.databases.get(dbName);
    const dbInstance = {
      objectStoreNames: {
        contains: (name) => name === 'keys'
      },
      createObjectStore: (name) => {
        return new MockObjectStore(dbMap);
      },
      transaction: (storeName, mode) => {
        return {
          objectStore: () => new MockObjectStore(dbMap)
        };
      }
    };
    const req = {
      result: dbInstance,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null
    };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
}

// ----------------------------------------------------
// Código reflejo de FinTrack (index.html)
// ----------------------------------------------------

let localStorage = new MockLocalStorage();
let indexedDB = new MockIndexedDB();

let secureCacheKeyPromise = null;
let secureCacheDbPromise = null;

function secureCacheStorageKey(uid) {
  return 'ft_cache_secure_' + uid;
}

function cacheBytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return Buffer.from(out, 'latin1').toString('base64');
}

function cacheB64ToBytes(value) {
  const bin = Buffer.from(value, 'base64').toString('latin1');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function secureCacheDatabase() {
  if (secureCacheDbPromise) return secureCacheDbPromise;
  secureCacheDbPromise = new Promise((resolve, reject) => {
    if (!indexedDB) return reject(new Error('IndexedDB no disponible'));
    const req = indexedDB.open('fintrack-secure-cache', 1);
    req.onupgradeneeded = function() {
      if (!req.result.objectStoreNames.contains('keys')) req.result.createObjectStore('keys');
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() {
      secureCacheDbPromise = null;
      reject(req.error || new Error('No se pudo abrir el almacén seguro'));
    };
  });
  return secureCacheDbPromise;
}

async function secureCacheKey() {
  if (secureCacheKeyPromise) return secureCacheKeyPromise;
  secureCacheKeyPromise = (async function() {
    try {
      if (!crypto || !crypto.subtle) throw new Error('Cifrado local no disponible');
      const db = await secureCacheDatabase();
      const stored = await new Promise((resolve, reject) => {
        const r = db.transaction('keys', 'readonly').objectStore('keys').get('device-key');
        r.onsuccess = function() { resolve(r.result); };
        r.onerror = function() { reject(r.error); };
      });
      if (stored) return stored;
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await new Promise((resolve, reject) => {
        const r = db.transaction('keys', 'readwrite').objectStore('keys').put(key, 'device-key');
        r.onsuccess = function() { resolve(); };
        r.onerror = function() { reject(r.error); };
      });
      return key;
    } catch (err) {
      secureCacheKeyPromise = null;
      throw err;
    }
  })();
  return secureCacheKeyPromise;
}

async function saveSecureLocalCache(uid, payload) {
  const key = await secureCacheKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, raw);
  localStorage.setItem(secureCacheStorageKey(uid), JSON.stringify({
    version: 1,
    iv: cacheBytesToB64(iv),
    data: cacheBytesToB64(new Uint8Array(cipher))
  }));
  localStorage.removeItem('ft_cache_' + uid);
}

async function readSecureLocalCache(uid) {
  const stored = localStorage.getItem(secureCacheStorageKey(uid));
  if (stored) {
    try {
      const envelope = JSON.parse(stored);
      const key = await secureCacheKey();
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: cacheB64ToBytes(envelope.iv) },
        key,
        cacheB64ToBytes(envelope.data)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      // Degradación defensiva: solo borra si el ciphertext está alterado o el JSON es corrupto
      if (e && (e.name === 'OperationError' || e.name === 'SyntaxError')) {
        localStorage.removeItem(secureCacheStorageKey(uid));
      }
      return null;
    }
  }
  const legacy = localStorage.getItem('ft_cache_' + uid);
  if (!legacy) return null;
  try {
    const parsed = JSON.parse(legacy);
    await saveSecureLocalCache(uid, parsed);
    return parsed;
  } catch (e) {
    if (e && e.name === 'SyntaxError') {
      localStorage.removeItem('ft_cache_' + uid);
    }
    return null;
  }
}

// Variables de estado offline
let currentUser = { id: 'usr-42', email: 'user@example.com' };
let isOffline = false;
let offlineQueue = [];
let syncState = 'ok';
let toastMessages = [];
let isProcessingOfflineQueue = false;

function setSync(s) {
  syncState = s;
}

function showSuccessToast(msg) {
  toastMessages.push(msg);
}

function queueKey() {
  return 'ft_queue_' + (currentUser ? currentUser.id : 'anon');
}

function queueOp(op) {
  offlineQueue.push(op);
  try {
    localStorage.setItem(queueKey(), JSON.stringify(offlineQueue));
    return true;
  } catch (e) {
    offlineQueue.pop();
    setSync('err');
    showSuccessToast('No hay espacio local para guardar este cambio');
    return false;
  }
}

// Mock de Supabase
let supabaseMockResponses = {
  shouldFailNetwork: false,
  failTable: null,
  failOperationId: null,
  delayMs: 0,
  executedCount: 0,
  inserted: [],
  updated: [],
  deleted: []
};

const sb = {
  from: (table) => {
    return {
      upsert: async (data, opts) => {
        supabaseMockResponses.executedCount++;
        if (supabaseMockResponses.delayMs > 0) {
          await new Promise(r => setTimeout(r, supabaseMockResponses.delayMs));
        }
        if (supabaseMockResponses.shouldFailNetwork) {
          throw new Error('Network request failed: TypeError: Failed to fetch');
        }
        if (supabaseMockResponses.failTable === table || (data && data.id === supabaseMockResponses.failOperationId)) {
          return { error: { message: 'DB Constraint error', code: '42P01' } };
        }
        supabaseMockResponses.inserted.push({ table, data });
        return { data: [data], error: null };
      },
      update: (data) => ({
        eq: async (col, val) => {
          supabaseMockResponses.executedCount++;
          if (supabaseMockResponses.delayMs > 0) {
            await new Promise(r => setTimeout(r, supabaseMockResponses.delayMs));
          }
          if (supabaseMockResponses.shouldFailNetwork) {
            throw new Error('Network request failed: TypeError: Failed to fetch');
          }
          if (supabaseMockResponses.failTable === table || val === supabaseMockResponses.failOperationId) {
            return { error: { message: 'Row not found or updated error', code: 'PGRST116' } };
          }
          supabaseMockResponses.updated.push({ table, data, id: val });
          return { data: [data], error: null };
        }
      }),
      delete: () => ({
        eq: async (col, val) => {
          supabaseMockResponses.executedCount++;
          if (supabaseMockResponses.delayMs > 0) {
            await new Promise(r => setTimeout(r, supabaseMockResponses.delayMs));
          }
          if (supabaseMockResponses.shouldFailNetwork) {
            throw new Error('Network request failed: TypeError: Failed to fetch');
          }
          if (supabaseMockResponses.failTable === table || val === supabaseMockResponses.failOperationId) {
            return { error: { message: 'Row not found or delete error' } };
          }
          supabaseMockResponses.deleted.push({ table, id: val });
          return { error: null };
        }
      }),
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: [], error: null })
          })
        })
      })
    };
  }
};

let recurrenceExclusions = [];
function isRecurrenceExcluded(seriesId, skippedDate) {
  return recurrenceExclusions.some(x => x.recur_series_id === seriesId && x.skipped_date === skippedDate);
}

async function processOfflineQueue() {
  if (!currentUser || !offlineQueue.length || isProcessingOfflineQueue) return;
  isProcessingOfflineQueue = true;
  setSync('syncing');
  const failed = [];
  try {
    for (let i = 0; i < offlineQueue.length; i++) {
      const op = offlineQueue[i];
      let res;
      try {
        if (op.type === 'insert') {
          let conflictTarget = 'id';
          if (op.table === 'transaction_voids') conflictTarget = 'user_id,transaction_id';
          else if (op.table === 'recurrence_exclusions') conflictTarget = 'user_id,recur_series_id,skipped_date';
          res = await sb.from(op.table).upsert(op.data, { onConflict: conflictTarget });
        } else if (op.type === 'update') {
          res = await sb.from(op.table).update(op.data).eq('id', op.id);
        } else if (op.type === 'delete') {
          res = await sb.from(op.table).delete().eq('id', op.id);
        }
      } catch (e) {
        failed.push(op);
        res = null;
      }
      if (res && res.error) {
        if (res.error.code === '23505') {
          // Conflicto de clave única ya resuelto en base de datos
        } else {
          failed.push(op);
        }
      } else if (res && op.type === 'insert' && op.table === 'recurrence_exclusions' && !isRecurrenceExcluded(op.data.recur_series_id, op.data.skipped_date)) {
        recurrenceExclusions.push(op.data);
      }
    }
    offlineQueue = failed;
    localStorage.setItem(queueKey(), JSON.stringify(offlineQueue));
    setSync(failed.length ? 'err' : 'ok');
  } finally {
    isProcessingOfflineQueue = false;
  }
}

// In-memory caches y datos de FinTrack
let _quoteCache = {};
let _rbCache = {};
let _historyCache = {};
let _txIndexVersion = -1;
let _txIndexLength = -1;
let _monthTxCache = {};
let _yearTxCache = {};
let transactions = [];
let categories = [];
let accounts = [];
let patrimony = [];
let budgets = [];
let transactionVoids = [];
let investmentOperations = [];
let loadDataInFlight = false;
let txVersion = 0;

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

function saveLocalCache() {
  txVersion++;
  clearBalanceCache();
  invalidateTxIndices();
  if (!currentUser) return;
  saveSecureLocalCache(currentUser.id, {
    transactions, categories, accounts, patrimony, budgets,
    recurrenceExclusions, transactionVoids, investmentOperations
  }).catch(err => console.warn('No se pudo cifrar caché local', err));
}

async function mockLoadData() {
  if (loadDataInFlight) return false;
  loadDataInFlight = true;
  try {
    const cd = await readSecureLocalCache(currentUser.id);
    if (cd) {
      transactions = cd.transactions || [];
      categories = cd.categories || [];
    }
    if (isOffline) return false;
    if (offlineQueue.length) await processOfflineQueue();

    if (supabaseMockResponses.shouldFailNetwork) {
      throw new Error('Network error on loadData');
    }

    // Datos frescos desde Supabase
    categories = [{ id: 'c1', name: 'Alimentación' }];
    transactions = [{ id: 'tx-cloud-1', amount: 15.5, category: 'c1' }];
    accounts = [{ id: 'acc-1', name: 'Banco Principal' }];
    await saveSecureLocalCache(currentUser.id, {
      transactions, categories, accounts, patrimony: [], budgets: [],
      recurrenceExclusions: [], transactionVoids: [], investmentOperations: []
    });
    setSync('ok');
    return true;
  } catch (e) {
    setSync('err');
    return false;
  } finally {
    loadDataInFlight = false;
  }
}

async function clearLocalCacheAndResync(mockConfirmUser = true) {
  if (isOffline) {
    return { ok: false, reason: 'offline' };
  }
  if (loadDataInFlight) {
    return { ok: false, reason: 'in-flight' };
  }
  if (offlineQueue.length) {
    const ok = mockConfirmUser;
    if (!ok) return { ok: false, reason: 'user-cancelled' };
    await processOfflineQueue();
  }
  setSync('syncing');
  if (currentUser) {
    try {
      localStorage.removeItem(secureCacheStorageKey(currentUser.id));
      localStorage.removeItem('ft_cache_' + currentUser.id);
    } catch (e) {}
  }
  _quoteCache = {};
  clearBalanceCache();
  if (typeof invalidateTxIndices === 'function') invalidateTxIndices();
  const ok = await mockLoadData();
  return { ok, reason: ok ? 'success' : 'loadData-failed' };
}

async function signOut(mockConfirmPendingOffline = true) {
  const cKey = 'ft_cache_' + (currentUser ? currentUser.id : '');
  if (offlineQueue.length && !isOffline) {
    await processOfflineQueue();
  }
  if (offlineQueue.length && !mockConfirmPendingOffline) {
    return false;
  }
  if (cKey !== 'ft_cache_' && currentUser) {
    localStorage.removeItem(cKey);
    localStorage.removeItem(secureCacheStorageKey(currentUser.id));
  }
  transactions = [];
  categories = [];
  accounts = [];
  patrimony = [];
  budgets = [];
  recurrenceExclusions = [];
  transactionVoids = [];
  offlineQueue = [];
  investmentOperations = [];
  _monthTxCache = {};
  _yearTxCache = {};
  if (typeof invalidateTxIndices === 'function') invalidateTxIndices();
  txVersion++;
  currentUser = null;
  return true;
}

function showAppForUser(user) {
  currentUser = user;
  offlineQueue = [];
  const queue = localStorage.getItem(queueKey());
  if (queue) {
    try {
      offlineQueue = JSON.parse(queue) || [];
    } catch (e) {}
  }
}

// ====================================================
// EJECUCIÓN DE LAS PRUEBAS
// ====================================================

async function runTests() {
  const architecturalObservations = [];
  let passedCount = 0;

  console.log('--- TEST 1: Cifrado y Descifrado con AES-GCM 256 (Web Crypto + IndexedDB) ---');
  try {
    const samplePayload = {
      transactions: [{ id: 'tx1', amount: 42.50, description: 'Supermercado' }],
      categories: [{ id: 'cat1', name: 'Comida' }],
      accounts: [{ id: 'acc1', name: 'Cuenta Corriente' }]
    };

    await saveSecureLocalCache(currentUser.id, samplePayload);
    const storedRaw = localStorage.getItem(secureCacheStorageKey(currentUser.id));
    assert(storedRaw !== null, 'Debe haber guardado el sobre cifrado en localStorage');
    const envelope = JSON.parse(storedRaw);
    assert.strictEqual(envelope.version, 1, 'La versión del sobre debe ser 1');
    assert(typeof envelope.iv === 'string', 'El IV debe estar en base64');
    assert(typeof envelope.data === 'string', 'El ciphertext debe estar en base64');
    assert(!storedRaw.includes('Supermercado'), 'El contenido confidencial no debe estar en texto plano');

    const decrypted = await readSecureLocalCache(currentUser.id);
    assert.deepStrictEqual(decrypted, samplePayload, 'El payload descifrado debe coincidir con el original');
    console.log('✓ Cifrado y descifrado nominal verificado correctamente.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 1:', err.message);
  }

  console.log('\n--- TEST 2: Migración transparente desde caché heredada (ft_cache_<uid>) ---');
  try {
    const legacyPayload = {
      transactions: [{ id: 'txLegacy', amount: 100 }],
      categories: [{ id: 'catLegacy', name: 'Hogar' }]
    };
    const legacyUid = 'usr-legacy-99';
    localStorage.setItem('ft_cache_' + legacyUid, JSON.stringify(legacyPayload));

    const migrated = await readSecureLocalCache(legacyUid);
    assert.deepStrictEqual(migrated, legacyPayload, 'Debe leer correctamente la caché heredada');
    assert(localStorage.getItem('ft_cache_' + legacyUid) === null, 'Debe haber eliminado la clave heredada en texto plano');
    assert(localStorage.getItem(secureCacheStorageKey(legacyUid)) !== null, 'Debe haber guardado la clave cifrada nueva');
    console.log('✓ Migración de caché legacy a cifrada verificada correctamente.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 2:', err.message);
  }

  console.log('\n--- TEST 3: Resiliencia ante corrupción de ciphertext o manipulación (OperationError) ---');
  try {
    const corruptUid = 'usr-corrupt-1';
    await saveSecureLocalCache(corruptUid, { secret: 'datos' });
    const stored = JSON.parse(localStorage.getItem(secureCacheStorageKey(corruptUid)));
    // Corromper el ciphertext para provocar OperationError en AES-GCM
    const badData = Buffer.from(stored.data, 'base64');
    badData[badData.length - 1] ^= 0xFF;
    stored.data = badData.toString('base64');
    localStorage.setItem(secureCacheStorageKey(corruptUid), JSON.stringify(stored));

    const result = await readSecureLocalCache(corruptUid);
    assert.strictEqual(result, null, 'Descifrado corrupto debe retornar null');
    assert.strictEqual(localStorage.getItem(secureCacheStorageKey(corruptUid)), null, 'Debe eliminar el elemento corrupto de localStorage');
    console.log('✓ Caché manipulada descartada limpiamente y eliminada del almacenamiento (OperationError verificado).');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 3:', err.message);
  }

  console.log('\n--- TEST 4: Resiliencia ante JSON corrupto en envelope (SyntaxError) ---');
  try {
    const syntaxErrUid = 'usr-syntax-err';
    localStorage.setItem(secureCacheStorageKey(syntaxErrUid), '{ invalid-json-payload ');

    const result = await readSecureLocalCache(syntaxErrUid);
    assert.strictEqual(result, null, 'Envelope corrupto debe retornar null');
    assert.strictEqual(localStorage.getItem(secureCacheStorageKey(syntaxErrUid)), null, 'Debe limpiar la clave con JSON inválido');
    console.log('✓ Envelope corrupto detectado y limpiado correctamente (SyntaxError verificado).');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 4:', err.message);
  }

  console.log('\n--- TEST 5: Resistencia de caché válida si IndexedDB falla temporalmente ---');
  try {
    const dbErrUid = 'usr-dberr-1';
    await saveSecureLocalCache(dbErrUid, { data: 'valiosa' });

    // Simular indisponibilidad temporal de IndexedDB
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;
    indexedDB.unavailable = true;

    const result = await readSecureLocalCache(dbErrUid);
    assert.strictEqual(result, null, 'Retorna null temporalmente si no puede acceder a IndexedDB');

    const remainingInStorage = localStorage.getItem(secureCacheStorageKey(dbErrUid));
    assert.notStrictEqual(remainingInStorage, null, 'Los datos cifrados NO deben borrarse ante un error temporal de BD');

    indexedDB.unavailable = false;
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;

    // Al restaurarse IndexedDB, los datos siguen intactos y se pueden leer
    const recovered = await readSecureLocalCache(dbErrUid);
    assert.deepStrictEqual(recovered, { data: 'valiosa' }, 'Los datos se recuperan exitosamente al restablecerse IndexedDB');
    console.log('✓ Protección de datos ante indisponibilidad transitoria de IndexedDB verificada.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 5:', err.message);
  }

  console.log('\n--- TEST 6: Conservación de caché legacy si falla el cifrado en la migración ---');
  try {
    const legacyFailUid = 'usr-legacy-fail';
    localStorage.setItem('ft_cache_' + legacyFailUid, JSON.stringify({ saldo: 15000 }));

    indexedDB.unavailable = true;
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;

    await readSecureLocalCache(legacyFailUid);

    const legacyRemaining = localStorage.getItem('ft_cache_' + legacyFailUid);
    assert.notStrictEqual(legacyRemaining, null, 'La caché legacy no debe borrarse si falla el cifrado por caída de BD');

    indexedDB.unavailable = false;
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;
    console.log('✓ Caché legacy preservada con éxito ante fallos en la migración.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 6:', err.message);
  }

  console.log('\n--- TEST 7: Cola Offline (queueOp) y cuota de almacenamiento llena (QuotaExceededError) ---');
  try {
    offlineQueue = [];
    localStorage.clear();

    const op1 = { type: 'insert', table: 'transactions', data: { id: 'tx-off-1', amount: 50 } };
    const success1 = queueOp(op1);
    assert.strictEqual(success1, true, 'queueOp debe tener éxito');
    assert.strictEqual(offlineQueue.length, 1);
    assert(localStorage.getItem(queueKey()).includes('tx-off-1'), 'Debe persistir en localStorage');

    // Simular QuotaExceededError
    localStorage.failOnSet = true;
    const op2 = { type: 'insert', table: 'transactions', data: { id: 'tx-off-2', amount: 99 } };
    const success2 = queueOp(op2);
    assert.strictEqual(success2, false, 'queueOp debe fallar cuando localStorage está lleno');
    assert.strictEqual(offlineQueue.length, 1, 'Debe hacer pop() y mantener el tamaño original');
    assert.strictEqual(syncState, 'err', 'Debe marcar estado de sincronización en error');
    assert(toastMessages.includes('No hay espacio local para guardar este cambio'), 'Debe mostrar toast informativo al usuario');

    localStorage.failOnSet = false;
    console.log('✓ Manejo de cuota local excedida verificado (reversión atómica y notificación).');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 7:', err.message);
  }

  console.log('\n--- TEST 8: Sincronización offline con fallos parciales de red (processOfflineQueue) ---');
  try {
    offlineQueue = [];
    supabaseMockResponses.inserted = [];
    supabaseMockResponses.failOperationId = 'tx-fail-cloud';

    const opSuccess = { type: 'insert', table: 'transactions', data: { id: 'tx-success-1', amount: 10 } };
    const opFailure = { type: 'insert', table: 'transactions', data: { id: 'tx-fail-cloud', amount: 20 } };
    const opSuccess2 = { type: 'update', table: 'transactions', id: 'tx-success-2', data: { amount: 30 } };

    queueOp(opSuccess);
    queueOp(opFailure);
    queueOp(opSuccess2);
    assert.strictEqual(offlineQueue.length, 3);

    await processOfflineQueue();

    assert.strictEqual(offlineQueue.length, 1, 'Solo debe quedar la operación fallida');
    assert.strictEqual(offlineQueue[0].data.id, 'tx-fail-cloud', 'La operación pendiente debe ser la rechazada');
    assert.strictEqual(syncState, 'err', 'El estado de sincronización debe ser err si queda alguna operación fallida');

    const persistedQueue = JSON.parse(localStorage.getItem(queueKey()));
    assert.strictEqual(persistedQueue.length, 1, 'LocalStorage debe actualizarse solo con las pendientes');
    assert.strictEqual(persistedQueue[0].data.id, 'tx-fail-cloud');
    console.log('✓ Sincronización parcial: las operaciones exitosas se eliminan y las fallidas permanecen persistidas.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 8:', err.message);
  }

  console.log('\n--- TEST 9: Mutex de concurrencia isProcessingOfflineQueue ---');
  try {
    offlineQueue = [];
    supabaseMockResponses.inserted = [];
    supabaseMockResponses.failOperationId = null;
    supabaseMockResponses.executedCount = 0;
    supabaseMockResponses.delayMs = 25; // Latencia controlada

    const opRace1 = { type: 'insert', table: 'transactions', data: { id: 'tx-race-1', amount: 100 } };
    queueOp(opRace1);

    // Disparar dos llamadas simultáneas a processOfflineQueue
    const p1 = processOfflineQueue();
    const p2 = processOfflineQueue();
    await Promise.all([p1, p2]);

    assert.strictEqual(supabaseMockResponses.executedCount, 1, 'El mutex isProcessingOfflineQueue debe evitar ejecuciones concurrentes');
    assert.strictEqual(offlineQueue.length, 0, 'La cola debe haber quedado vaciada tras completarse');
    assert.strictEqual(isProcessingOfflineQueue, false, 'El flag isProcessingOfflineQueue debe volver a false');

    supabaseMockResponses.delayMs = 0;
    console.log('✓ Mutex isProcessingOfflineQueue verificado: previene ejecuciones duplicadas concurrentes.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 9:', err.message);
  }

  console.log('\n--- TEST 10: Aislamiento multiusuario en signOut y cambio de usuario ---');
  try {
    // Parte A: signOut mientras se está ONLINE (debe sincronizar antes de cerrar sesión)
    offlineQueue = [];
    isOffline = false;
    currentUser = { id: 'user-alice' };
    const opAliceOnline = { type: 'insert', table: 'transactions', data: { id: 'tx-alice-online', amount: 80 } };
    queueOp(opAliceOnline);
    await signOut(); // Sincroniza y limpia
    assert.strictEqual(offlineQueue.length, 0, 'La cola de Alice online debió sincronizarse y quedar vacía');

    // Parte B: signOut mientras se está OFFLINE (debe conservar ft_queue_<uid> en storage pero vaciar memoria)
    showAppForUser({ id: 'user-alice' });
    isOffline = true;
    const opAliceOffline = { type: 'insert', table: 'transactions', data: { id: 'tx-alice-off', amount: 120 } };
    queueOp(opAliceOffline);
    assert.strictEqual(offlineQueue.length, 1);

    // Alice cierra sesión estando offline (confirma que desea conservar cambios para luego)
    await signOut(true);

    assert.strictEqual(currentUser, null, 'currentUser debe ser null tras signOut');
    assert.strictEqual(offlineQueue.length, 0, 'offlineQueue en memoria debe quedar vacía tras signOut');

    // Bob inicia sesión en el mismo dispositivo
    showAppForUser({ id: 'user-bob' });

    assert.strictEqual(offlineQueue.length, 0, 'Bob NO debe heredar la cola offline de Alice');
    assert.strictEqual(localStorage.getItem(queueKey()), null, 'La clave de Bob en localStorage debe estar vacía');

    // Bob realiza una operación propia
    const opBob = { type: 'insert', table: 'transactions', data: { id: 'tx-bob-1', amount: 45 } };
    queueOp(opBob);
    assert.strictEqual(offlineQueue.length, 1);
    assert.strictEqual(offlineQueue[0].data.id, 'tx-bob-1');

    // Bob cierra sesión
    await signOut(true);

    // Alice vuelve a iniciar sesión
    showAppForUser({ id: 'user-alice' });
    assert.strictEqual(offlineQueue.length, 1, 'Alice recupera su cola offline pendiente al volver a entrar');
    assert.strictEqual(offlineQueue[0].data.id, 'tx-alice-off', 'La operación recuperada pertenece estrictamente a Alice');

    isOffline = false;
    console.log('✓ Aislamiento multiusuario verificado: separación estricta de colas ft_queue_<uid> y purgado en memoria.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 10:', err.message);
  }

  console.log('\n--- TEST 11: Función clearLocalCacheAndResync ---');
  try {
    currentUser = { id: 'user-sync-test' };
    offlineQueue = [];
    localStorage.clear();
    await saveSecureLocalCache(currentUser.id, { transactions: [{ id: 'tx-old', amount: 1 }] });
    localStorage.setItem('ft_cache_' + currentUser.id, JSON.stringify({ legacy: true }));

    _quoteCache = { 'AAPL': 180 };
    _rbCache = { 'acc1': 500 };
    _historyCache = { 'acc1': [1, 2] };
    _txIndexVersion = 99;
    _txIndexLength = 99;

    // Caso A: Si el usuario está offline, debe abortar
    isOffline = true;
    const resOffline = await clearLocalCacheAndResync(true);
    assert.strictEqual(resOffline.ok, false);
    assert.strictEqual(resOffline.reason, 'offline', 'Debe abortar si no hay conexión a internet');
    isOffline = false;

    // Caso B: Si hay cambios pendientes y el usuario cancela, no debe purgar
    const pendingOp = { type: 'insert', table: 'transactions', data: { id: 'tx-pending-1', amount: 33 } };
    queueOp(pendingOp);
    const resCancel = await clearLocalCacheAndResync(false);
    assert.strictEqual(resCancel.ok, false);
    assert.strictEqual(resCancel.reason, 'user-cancelled', 'Debe respetar la cancelación del usuario');
    assert.strictEqual(offlineQueue.length, 1, 'La cola no debe haber sido tocada');
    assert(localStorage.getItem(secureCacheStorageKey(currentUser.id)) !== null, 'La caché no debe haberse borrado');

    // Caso C: Ejecución completa aceptada
    supabaseMockResponses.failOperationId = null;
    supabaseMockResponses.shouldFailNetwork = false;
    const resSuccess = await clearLocalCacheAndResync(true);

    assert.strictEqual(resSuccess.ok, true, 'Debe completar exitosamente la resincronización');
    assert.deepStrictEqual(_quoteCache, {}, '_quoteCache debe haber sido vaciado');
    assert.deepStrictEqual(_rbCache, {}, '_rbCache debe haber sido vaciado');
    assert.deepStrictEqual(_historyCache, {}, '_historyCache debe haber sido vaciado');
    assert.strictEqual(_txIndexVersion, -1, '_txIndexVersion debe haber sido invalidado (-1)');
    assert.strictEqual(offlineQueue.length, 0, 'La cola offline debió sincronizarse exitosamente');
    assert.strictEqual(transactions[0].id, 'tx-cloud-1', 'Debe haber recuperado los datos frescos desde Supabase');
    assert(localStorage.getItem('ft_cache_' + currentUser.id) === null, 'ft_cache_<uid> debe estar borrado');

    console.log('✓ clearLocalCacheAndResync verificado con éxito: confirmación de cola, purgado de claves, vaciado de índices y recarga fresca.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 11:', err.message);
  }

  console.log('\n--- TEST 12: Simulación de Caída de Red durante Resincronización ---');
  try {
    currentUser = { id: 'user-net-drop' };
    offlineQueue = [];
    localStorage.clear();
    await saveSecureLocalCache(currentUser.id, { transactions: [{ id: 'tx-pre-existing', amount: 77 }] });

    // Simular que la red cae justo cuando loadData intenta contactar Supabase
    supabaseMockResponses.shouldFailNetwork = true;

    const resFail = await clearLocalCacheAndResync(true);
    assert.strictEqual(resFail.ok, false, 'Debe reportar fallo de sincronización si la red cae');
    assert.strictEqual(syncState, 'err', 'El estado de sincronización debe ser err');

    // Como la caché se borró antes de loadData, verificar el estado
    const cachedAfterFail = localStorage.getItem(secureCacheStorageKey(currentUser.id));
    assert.strictEqual(cachedAfterFail, null, 'La caché previa fue borrada');

    supabaseMockResponses.shouldFailNetwork = false;
    console.log('✓ Manejo de caída de red durante resync verificado (notificación de error correcta).');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 12:', err.message);
  }

  // Evaluaciones arquitectónicas y observaciones de resiliencia
  console.log('\n--- ANÁLISIS ARQUITECTÓNICO Y PUNTOS DE ATENCIÓN ---');
  
  // Observación 1: clearLocalCacheAndResync no verifica isProcessingOfflineQueue
  architecturalObservations.push({
    severity: 'BAJA',
    component: 'clearLocalCacheAndResync',
    detail: 'clearLocalCacheAndResync comprueba loadDataInFlight pero no isProcessingOfflineQueue. Si la cola ya se está procesando en segundo plano, la llamada a processOfflineQueue() retorna de inmediato y procede a borrar la caché y llamar a loadData() en concurrencia con el proceso anterior.'
  });

  // Observación 2: Fallo de red en bucle de processOfflineQueue
  architecturalObservations.push({
    severity: 'BAJA',
    component: 'processOfflineQueue',
    detail: 'Si ocurre un error de red (TypeError: Failed to fetch) en el primer elemento de una cola larga, el bucle for continúa ejecutando los restantes en vez de abortar tempranamente, causando múltiples peticiones fallidas consecutivas.'
  });

  // Observación 3: Verificación del valor de retorno de queueOp en saveTx
  architecturalObservations.push({
    severity: 'MEDIA',
    component: 'saveTx / QuotaExceeded',
    detail: 'En saveTx y deleteTx no se evalúa el resultado booleano de queueOp(). Si el almacenamiento local está saturado (QuotaExceededError), el array en memoria transactions/transactionVoids se actualiza pero la operación no queda encolada para sincronizar, produciendo divergencia local no persistida.'
  });

  console.log('\n================================================================');
  console.log(` RESULTADOS: ${passedCount}/12 pruebas unitarias y de simulación SUPERADAS.`);
  console.log(` OBSERVACIONES DE ARQUITECTURA / HARDENING: ${architecturalObservations.length}`);
  architecturalObservations.forEach((obs, idx) => {
    console.log(` ${idx + 1}. [${obs.severity}] [${obs.component}]:\n    ${obs.detail}`);
  });
  console.log('================================================================\n');
}

runTests().catch(e => {
  console.error('Error no capturado en la suite de pruebas:', e);
  process.exit(1);
});
