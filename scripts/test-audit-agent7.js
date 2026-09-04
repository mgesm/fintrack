/**
 * test-audit-agent7.js
 * Suite completa de auditoría y simulación para el Agente 7 de FinTrack:
 * 1. Cifrado local Web Crypto (AES-GCM 256) e IndexedDB ('fintrack-secure-cache')
 * 2. Modo Offline y cola de sincronización (offlineQueue, queueOp, processOfflineQueue)
 * 3. Función clearLocalCacheAndResync y recuperación de estado fresco
 * 4. Resiliencia, degradación, concurrencia y aislamiento multiusuario
 */

const assert = require('assert');
const { webcrypto } = require('crypto');

const crypto = webcrypto;

console.log('====================================================');
console.log(' AUDITORÍA AGENTE 7: CACHÉ CIFRADA, OFFLINE Y RESYNC');
console.log('====================================================\n');

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
      const err = new Error('QuotaExceededError: DomException');
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
// Código exacto de FinTrack (index.html)
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
    req.onerror = function() { reject(req.error || new Error('No se pudo abrir el almacén seguro')); };
  });
  return secureCacheDbPromise;
}

async function secureCacheKey() {
  if (secureCacheKeyPromise) return secureCacheKeyPromise;
  secureCacheKeyPromise = (async function() {
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
      localStorage.removeItem(secureCacheStorageKey(uid));
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
    localStorage.removeItem('ft_cache_' + uid);
    return null;
  }
}

// Variables de estado offline
let currentUser = { id: 'usr-42', email: 'user@example.com' };
let isOffline = false;
let offlineQueue = [];
let syncState = 'ok';
let toastMessages = [];

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
  if (!currentUser || !offlineQueue.length) return;
  setSync('syncing');
  const failed = [];
  for (let i = 0; i < offlineQueue.length; i++) {
    const op = offlineQueue[i];
    let res;
    try {
      if (op.type === 'insert') res = await sb.from(op.table).upsert(op.data, { onConflict: 'id' });
      else if (op.type === 'update') res = await sb.from(op.table).update(op.data).eq('id', op.id);
      else if (op.type === 'delete') res = await sb.from(op.table).delete().eq('id', op.id);
    } catch (e) {
      failed.push(op);
      res = null;
    }
    if (res && res.error) failed.push(op);
    else if (res && op.type === 'insert' && op.table === 'recurrence_exclusions' && !isRecurrenceExcluded(op.data.recur_series_id, op.data.skipped_date)) {
      recurrenceExclusions.push(op.data);
    }
  }
  offlineQueue = failed;
  localStorage.setItem(queueKey(), JSON.stringify(offlineQueue));
  setSync(failed.length ? 'err' : 'ok');
}

// In-memory caches y datos de FinTrack
let _quoteCache = {};
let _rbCache = {};
let _historyCache = {};
let _txIndexVersion = -1;
let _txIndexLength = -1;
let _txByAccount = {};
let transactions = [];
let categories = [];
let accounts = [];
let patrimony = [];
let budgets = [];
let transactionVoids = [];
let investmentOperations = [];
let loadDataInFlight = false;

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

    // Supabase devuelve datos frescos
    categories = [{ id: 'c1', name: 'Alimentación' }];
    transactions = [{ id: 'tx-cloud-1', amount: 15.5, category: 'c1' }];
    await saveSecureLocalCache(currentUser.id, {
      transactions, categories, accounts: [], patrimony: [], budgets: [],
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

// ====================================================
// EJECUCIÓN DE LAS PRUEBAS
// ====================================================

async function runTests() {
  const issues = [];
  let passedCount = 0;

  console.log('--- TEST 1: Cifrado y Descifrado con AES-GCM 256 ---');
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
    assert.deepStrictEqual(decrypted, samplePayload, 'El payload descifrado debe coincidir exactamente con el original');
    console.log('✓ Cifrado y descifrado nominal verificado correctamente.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 1:', err.message);
    issues.push({ section: '1. Cifrado Web Crypto', issue: err.message, severity: 'ALTA' });
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
    issues.push({ section: '1. Migración Legacy', issue: err.message, severity: 'MEDIA' });
  }

  console.log('\n--- TEST 3: Resiliencia ante corrupción de ciphertext o manipulación ---');
  try {
    const corruptUid = 'usr-corrupt-1';
    await saveSecureLocalCache(corruptUid, { secret: 'datos' });
    const stored = JSON.parse(localStorage.getItem(secureCacheStorageKey(corruptUid)));
    // Corromper el ciphertext
    const badData = Buffer.from(stored.data, 'base64');
    badData[badData.length - 1] ^= 0xFF; // alterar último byte
    stored.data = badData.toString('base64');
    localStorage.setItem(secureCacheStorageKey(corruptUid), JSON.stringify(stored));

    const result = await readSecureLocalCache(corruptUid);
    assert.strictEqual(result, null, 'Descifrado corrupto debe retornar null');
    assert.strictEqual(localStorage.getItem(secureCacheStorageKey(corruptUid)), null, 'Debe eliminar el elemento corrupto de localStorage');
    console.log('✓ Caché corrupta descartada limpiamente y eliminada del almacenamiento.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 3:', err.message);
    issues.push({ section: '1. Caché Corrupta', issue: err.message, severity: 'MEDIA' });
  }

  console.log('\n--- TEST 4: Análisis de fallo en IndexedDB / WebCrypto (Degradación y Borrado Indeseado) ---');
  try {
    const dbErrUid = 'usr-dberr-1';
    await saveSecureLocalCache(dbErrUid, { data: 'valiosa' });

    // Simular que IndexedDB deja de estar accesible
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;
    indexedDB.unavailable = true;

    try {
      await readSecureLocalCache(dbErrUid);
    } catch (e) {}

    const remainingInStorage = localStorage.getItem(secureCacheStorageKey(dbErrUid));
    if (remainingInStorage === null) {
      const msg = 'Si IndexedDB falla temporalmente (bloqueo, cuota o modo incógnito), readSecureLocalCache atrapa el fallo de secureCacheKey() en catch(e) y BORRA permanentemente los datos válidos del localStorage (localStorage.removeItem) creyendo que están corruptos.';
      console.warn('⚠️ DETECTADO PROBLEMA:', msg);
      issues.push({ section: '1. Web Crypto / IndexedDB Fallback', issue: msg, severity: 'ALTA' });
    } else {
      console.log('✓ No se eliminaron los datos ante fallo de IndexedDB.');
      passedCount++;
    }

    indexedDB.unavailable = false;
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;
  } catch (err) {
    console.error('✕ Fallo en TEST 4:', err.message);
  }

  console.log('\n--- TEST 5: Eliminación destructiva de caché legacy si falla la migración ---');
  try {
    const legacyFailUid = 'usr-legacy-fail';
    localStorage.setItem('ft_cache_' + legacyFailUid, JSON.stringify({ saldo: 15000 }));
    
    // Si IndexedDB falla durante el intento de migración
    indexedDB.unavailable = true;
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;

    await readSecureLocalCache(legacyFailUid);

    const legacyRemaining = localStorage.getItem('ft_cache_' + legacyFailUid);
    if (legacyRemaining === null) {
      const msg = 'Si saveSecureLocalCache falla durante la migración (ej. IndexedDB bloqueado o no soportado), el bloque catch(e) borra localStorage.removeItem("ft_cache_" + uid), destruyendo los datos originales en texto plano en lugar de conservarlos.';
      console.warn('⚠️ DETECTADO PROBLEMA:', msg);
      issues.push({ section: '1. Destrucción de Caché Legacy en Fallo de Migración', issue: msg, severity: 'ALTA' });
    } else {
      console.log('✓ La caché legacy se conserva si falla el cifrado.');
      passedCount++;
    }

    indexedDB.unavailable = false;
    secureCacheKeyPromise = null;
    secureCacheDbPromise = null;
  } catch (err) {
    console.error('✕ Fallo en TEST 5:', err.message);
  }

  console.log('\n--- TEST 6: Cola Offline (queueOp) y cuota de almacenamiento llena ---');
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
    console.error('✕ Fallo en TEST 6:', err.message);
    issues.push({ section: '2. Modo Offline / QuotaExceeded', issue: err.message, severity: 'MEDIA' });
  }

  console.log('\n--- TEST 7: Sincronización offline con fallos parciales de red ---');
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
    assert.strictEqual(offlineQueue[0].data.id, 'tx-fail-cloud', 'La operación pendiente debe ser la rechazada por el servidor');
    assert.strictEqual(syncState, 'err', 'El estado de sincronización debe ser err si queda alguna operación fallida');

    const persistedQueue = JSON.parse(localStorage.getItem(queueKey()));
    assert.strictEqual(persistedQueue.length, 1, 'LocalStorage debe actualizarse solo con las pendientes');
    assert.strictEqual(persistedQueue[0].data.id, 'tx-fail-cloud');
    console.log('✓ Sincronización parcial: las operaciones exitosas se eliminan de la cola y las fallidas permanecen persistidas.');
    passedCount++;
  } catch (err) {
    console.error('✕ Fallo en TEST 7:', err.message);
    issues.push({ section: '2. Sincronización Parcial de Red', issue: err.message, severity: 'MEDIA' });
  }

  console.log('\n--- TEST 8: Condición de carrera por concurrencia en processOfflineQueue ---');
  try {
    offlineQueue = [];
    supabaseMockResponses.inserted = [];
    supabaseMockResponses.failOperationId = null;
    supabaseMockResponses.executedCount = 0;
    supabaseMockResponses.delayMs = 20; // simular latencia de red

    const opRace1 = { type: 'insert', table: 'transactions', data: { id: 'tx-race-1', amount: 100 } };
    queueOp(opRace1);

    // Disparar dos llamadas simultáneas a processOfflineQueue sin bloqueo de exclusión mutua
    const p1 = processOfflineQueue();
    const p2 = processOfflineQueue();
    await Promise.all([p1, p2]);

    if (supabaseMockResponses.executedCount > 1) {
      const msg = `processOfflineQueue carece de flag de reentrancia (mutex). Al ejecutarse concurrentemente (ej. evento online + forceSync simultáneo), la misma operación se ejecutó ${supabaseMockResponses.executedCount} veces contra el servidor.`;
      console.warn('⚠️ DETECTADO PROBLEMA:', msg);
      issues.push({ section: '2. Concurrencia en Cola Offline', issue: msg, severity: 'MEDIA' });
    } else {
      console.log('✓ processOfflineQueue cuenta con protección ante ejecuciones concurrentes.');
      passedCount++;
    }
    supabaseMockResponses.delayMs = 0;
  } catch (err) {
    console.error('✕ Fallo en TEST 8:', err.message);
  }

  console.log('\n--- TEST 9: Persistencia ante cierre de app y aislamiento entre usuarios ---');
  try {
    offlineQueue = [];
    currentUser = { id: 'user-alice' };
    const opAlice = { type: 'insert', table: 'transactions', data: { id: 'tx-alice-1', amount: 120 } };
    queueOp(opAlice);

    // Simular cierre de sesión
    // En index.html signOut():
    // offlineQueue NO se resetea a []
    
    // Simular inicio de sesión de Bob (sin cola previa en localStorage)
    currentUser = { id: 'user-bob' };
    const queueBob = localStorage.getItem(queueKey());
    if (queueBob) {
      try { offlineQueue = JSON.parse(queueBob) || []; } catch(e) {}
    }
    
    if (offlineQueue.length > 0 && offlineQueue[0].data.id === 'tx-alice-1') {
      const msg = 'Fuga de operaciones entre usuarios (Cross-User Queue Leak). Si el Usuario A cierra sesión con cambios pendientes en memoria y el Usuario B inicia sesión en el mismo navegador sin cambios pendientes locales, la variable global offlineQueue NO se resetea a [] y las operaciones de A se intentan enviar con la sesión y credenciales de B.';
      console.warn('⚠️ DETECTADO PROBLEMA:', msg);
      issues.push({ section: '2. Aislamiento Multiusuario', issue: msg, severity: 'CRÍTICA' });
    } else {
      console.log('✓ Aislamiento multiusuario verificado.');
      passedCount++;
    }
  } catch (err) {
    console.error('✕ Fallo en TEST 9:', err.message);
  }

  console.log('\n--- TEST 10: Función clearLocalCacheAndResync ---');
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
    console.error('✕ Fallo en TEST 10:', err.message);
    issues.push({ section: '3. clearLocalCacheAndResync', issue: err.message, severity: 'MEDIA' });
  }

  console.log('\n====================================================');
  console.log(` RESUMEN: ${passedCount} pruebas superadas.`);
  if (issues.length) {
    console.log(` SE ENCONTRARON ${issues.length} PROBLEMAS/VULNERABILIDADES:`);
    issues.forEach((iss, idx) => {
      console.log(` ${idx + 1}. [${iss.severity || 'MEDIA'}] [${iss.section}]:\n    ${iss.issue}`);
    });
  } else {
    console.log(' TODOS LOS COMPONENTES FUNCIONAN SEGÚN LO ESPERADO.');
  }
  console.log('====================================================');
}

runTests().catch(e => {
  console.error('Error no capturado en la suite de pruebas:', e);
  process.exit(1);
});
