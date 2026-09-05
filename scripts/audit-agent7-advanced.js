/**
 * audit-agent7-advanced.js
 * Suite de verificación avanzada y pruebas de estrés para Auditor 7 de FinTrack:
 * - Almacenamiento Cifrado (Web Crypto AES-GCM 256 + IndexedDB)
 * - Cola Offline (concurrencia, colisiones, condiciones de carrera, errores 23505)
 * - Aislamiento multiusuario en signOut y fugas de memoria en índices
 * - clearLocalCacheAndResync y resiliencia ante excepciones
 * - Detección anticipada de falta de red y aviso de almacenamiento
 */

const assert = require('assert');
const { webcrypto } = require('crypto');
const crypto = webcrypto;

console.log('================================================================');
console.log(' AUDITORÍA 7 AVANZADA: CONDICIONES DE CARRERA, AISLAMIENTO Y ROBUSTEZ');
console.log('================================================================\n');

// ----------------------------------------------------
// Mocks
// ----------------------------------------------------
class MockLocalStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(String(k), String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

class MockIndexedDB {
  constructor() { this.databases = new Map(); }
  open(dbName, version) {
    if (!this.databases.has(dbName)) this.databases.set(dbName, new Map());
    const dbMap = this.databases.get(dbName);
    const dbInstance = {
      objectStoreNames: { contains: (n) => n === 'keys' },
      createObjectStore: () => ({
        get: (key) => {
          const req = { onsuccess: null, onerror: null, result: dbMap.get(key) };
          setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
          return req;
        },
        put: (val, key) => {
          dbMap.set(key, val);
          const req = { onsuccess: null, onerror: null, result: key };
          setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
          return req;
        }
      }),
      transaction: () => ({
        objectStore: () => dbInstance.createObjectStore()
      })
    };
    const req = { result: dbInstance, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  }
}

let localStorage = new MockLocalStorage();
let indexedDB = new MockIndexedDB();
let secureCacheDbPromise = null;
let secureCacheKeyPromise = null;

function secureCacheStorageKey(uid) { return 'ft_cache_secure_' + uid; }
function cacheBytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return Buffer.from(out, 'latin1').toString('base64');
}
function cacheB64ToBytes(value) {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function secureCacheDatabase() {
  if (secureCacheDbPromise) return secureCacheDbPromise;
  secureCacheDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('fintrack-secure-cache', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { secureCacheDbPromise = null; reject(req.error); };
  });
  return secureCacheDbPromise;
}

async function secureCacheKey() {
  if (secureCacheKeyPromise) return secureCacheKeyPromise;
  secureCacheKeyPromise = (async () => {
    const db = await secureCacheDatabase();
    const stored = await new Promise((resolve, reject) => {
      const r = db.transaction('keys', 'readonly').objectStore('keys').get('device-key');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (stored) return stored;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise((resolve, reject) => {
      const r = db.transaction('keys', 'readwrite').objectStore('keys').put(key, 'device-key');
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
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
}

async function readSecureLocalCacheCurrent(uid) {
  const stored = localStorage.getItem(secureCacheStorageKey(uid));
  if (!stored) return null;
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
    if (e && (e.name === 'OperationError' || e.name === 'SyntaxError')) {
      localStorage.removeItem(secureCacheStorageKey(uid));
    }
    return null;
  }
}

// Versión endurecida de readSecureLocalCache
async function readSecureLocalCacheHardened(uid) {
  const stored = localStorage.getItem(secureCacheStorageKey(uid));
  if (!stored) return null;
  try {
    const envelope = JSON.parse(stored);
    if (!envelope || !envelope.iv || !envelope.data) throw new Error('Estructura de sobre cifrado inválida');
    const key = await secureCacheKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: cacheB64ToBytes(envelope.iv) },
      key,
      cacheB64ToBytes(envelope.data)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (e) {
    // Si la caché está corrupta (cualquier error de deserialización, clave inválida, base64 truncado)
    // la purgamos para no dejar basura irrecuperable en el almacenamiento local.
    localStorage.removeItem(secureCacheStorageKey(uid));
    return null;
  }
}

// ----------------------------------------------------
// Tests
// ----------------------------------------------------
async function runAdvancedAudit() {
  let passed = 0;
  let total = 0;

  // --------------------------------------------------------------------------
  console.log('--- TEST A: Condición de carrera en offlineQueue al mutar durante sync ---');
  total++;
  try {
    let currentUser = { id: 'usr-race' };
    let offlineQueue = [
      { id: 'op1', type: 'insert', table: 'transactions', data: { id: 'tx-1' } },
      { id: 'op2', type: 'insert', table: 'transactions', data: { id: 'tx-2' } }
    ];
    let isProcessingOfflineQueue = false;

    function queueOp(op) {
      offlineQueue.push(op);
      return true;
    }

    // Simulación del comportamiento ACTUAL de processOfflineQueue
    async function processOfflineQueueCurrent() {
      if (isProcessingOfflineQueue) return;
      isProcessingOfflineQueue = true;
      let failed = [];
      try {
        for (let i = 0; i < offlineQueue.length; i++) {
          let op = offlineQueue[i];
          // Simula latencia de red asíncrona (10ms por op)
          await new Promise(r => setTimeout(r, 10));
          // Éxito en op1 y op2
        }
        // BUG: Asignación directa sobreescribe lo que se haya añadido durante el bucle
        offlineQueue = failed;
      } finally {
        isProcessingOfflineQueue = false;
      }
    }

    // Lanzar proceso de sincronización
    const syncPromise = processOfflineQueueCurrent();

    // Mientras se procesa la cola, el usuario añade una nueva transacción offline
    await new Promise(r => setTimeout(r, 5));
    queueOp({ id: 'op3-new', type: 'insert', table: 'transactions', data: { id: 'tx-3-user-action' } });
    assert.strictEqual(offlineQueue.length, 3, 'El usuario encoló op3 mientras se sincronizaba');

    // Esperar a que termine la sincronización
    await syncPromise;

    // En el código actual, op3 se pierde completamente porque offlineQueue = failed ([]);
    console.log(`  Resultado con código actual: offlineQueue.length = ${offlineQueue.length}`);
    if (offlineQueue.length === 0) {
      console.log('  ⚠️ CONFIRMADO: op3 fue eliminada y destruida silenciosamente por sobreescritura de offlineQueue.');
    }

    // Ahora comprobamos el patrón corregido (Atomic snapshot + filter)
    offlineQueue = [
      { id: 'op1', type: 'insert', table: 'transactions', data: { id: 'tx-1' } },
      { id: 'op2', type: 'insert', table: 'transactions', data: { id: 'tx-2' } }
    ];
    isProcessingOfflineQueue = false;

    async function processOfflineQueueHardened() {
      if (isProcessingOfflineQueue) return;
      isProcessingOfflineQueue = true;
      try {
        const batch = offlineQueue.slice();
        const processedSet = new Set();
        for (let op of batch) {
          await new Promise(r => setTimeout(r, 10));
          processedSet.add(op);
        }
        // Filtrar solo las operaciones exitosamente procesadas del snapshot
        offlineQueue = offlineQueue.filter(op => !processedSet.has(op));
      } finally {
        isProcessingOfflineQueue = false;
      }
    }

    const syncPromiseHardened = processOfflineQueueHardened();
    await new Promise(r => setTimeout(r, 5));
    queueOp({ id: 'op3-new', type: 'insert', table: 'transactions', data: { id: 'tx-3-user-action' } });
    await syncPromiseHardened;

    assert.strictEqual(offlineQueue.length, 1, 'Con la solución corregida, op3 se preserva en la cola');
    assert.strictEqual(offlineQueue[0].id, 'op3-new');
    console.log('✓ TEST A SUPERADO: Demostrada la condición de carrera y validada la solución atómica con snapshot.');
    passed++;
  } catch (err) {
    console.error('✕ TEST A FALLÓ:', err);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST B: Mutex isProcessingOfflineQueue y retorno de Promise ---');
  total++;
  try {
    let isProcessing = false;
    let activePromise = null;

    // Código actual: si isProcessing es true, retorna undefined de inmediato
    async function processQueueCurrent() {
      if (isProcessing) return; // Retorna undefined de inmediato
      isProcessing = true;
      try {
        await new Promise(r => setTimeout(r, 30));
      } finally {
        isProcessing = false;
      }
    }

    // Simulación: clearLocalCacheAndResync llama a processQueueCurrent mientras ya corría
    isProcessing = true;
    const t0 = Date.now();
    await processQueueCurrent();
    const elapsedCurrent = Date.now() - t0;
    assert(elapsedCurrent < 10, 'El código actual retorna de inmediato sin esperar');
    console.log('  ⚠️ CONFIRMADO: La llamada concurrente retorna instantáneamente en 0ms sin esperar a que termine el proceso en vuelo.');

    // Versión robusta compartiendo la Promise activa
    isProcessing = false;
    async function processQueueHardened() {
      if (activePromise) return activePromise;
      activePromise = (async () => {
        isProcessing = true;
        try {
          await new Promise(r => setTimeout(r, 30));
        } finally {
          isProcessing = false;
          activePromise = null;
        }
      })();
      return activePromise;
    }

    const p1 = processQueueHardened();
    const t1 = Date.now();
    const p2 = processQueueHardened();
    await p2;
    const elapsedHardened = Date.now() - t1;
    assert(elapsedHardened >= 25, 'La versión robusta espera a que el proceso en vuelo termine');
    console.log('✓ TEST B SUPERADO: La compartición de Promise asegura sincronización ordenada sin carreras.');
    passed++;
  } catch (err) {
    console.error('✕ TEST B FALLÓ:', err);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST C: Resiliencia ante corrupción de Base64 en el sobre de caché ---');
  total++;
  try {
    const uid = 'usr-b64-corrupt';
    // Sobre con Base64 inválido en el IV
    localStorage.setItem(secureCacheStorageKey(uid), JSON.stringify({
      version: 1,
      iv: '@@@INVALID-BASE64@@@',
      data: 'dGVzdA=='
    }));

    // Código actual: falla la decodificación Base64 pero no es OperationError ni SyntaxError
    await readSecureLocalCacheCurrent(uid);
    const stillThereCurrent = localStorage.getItem(secureCacheStorageKey(uid));
    console.log(`  Caché corrupta en código actual tras lectura: ${stillThereCurrent ? 'SIGUE EN STORAGE (no purgada)' : 'Purgada'}`);
    assert(stillThereCurrent !== null, 'El código actual no purga si el fallo es de Base64/TypeError');

    // Código endurecido: cualquier error estructural purga la entrada dañada
    await readSecureLocalCacheHardened(uid);
    const stillThereHardened = localStorage.getItem(secureCacheStorageKey(uid));
    assert.strictEqual(stillThereHardened, null, 'El código endurecido purga la caché corrupta limpiamente');
    console.log('✓ TEST C SUPERADO: Validación de purga ante cualquier excepción de deserialización.');
    passed++;
  } catch (err) {
    console.error('✕ TEST C FALLÓ:', err);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST D: Fuga de referencias en índices de transacciones tras signOut ---');
  total++;
  try {
    let _txIndexVersion = 1;
    let _txIndexLength = 2;
    let _monthTxCache = { '2026-09': [1] };
    let _yearTxCache = { '2026': [1] };
    let _txByAccount = { 'acc1': [{ id: 'tx-secret-user1', note: 'Nómina confidencial' }] };
    let _txByMonthStr = { '2026-09': [{ id: 'tx-secret-user1' }] };
    let _txByYearStr = { '2026': [{ id: 'tx-secret-user1' }] };

    // Código actual en index.html:
    function invalidateTxIndicesCurrent() {
      _txIndexVersion = -1;
      _txIndexLength = -1;
      _monthTxCache = {};
      _yearTxCache = {};
      // BUG: NO limpia _txByAccount, _txByMonthStr, _txByYearStr
    }

    invalidateTxIndicesCurrent();
    assert(_txByAccount['acc1'] !== undefined, 'Los índices de cuenta siguen reteniendo transacciones confidenciales');
    console.log('  ⚠️ CONFIRMADO: _txByAccount retiene transacciones del usuario anterior tras signOut():');
    console.log(`     Nota expuesta: "${_txByAccount['acc1'][0].note}"`);

    // Código endurecido:
    function invalidateTxIndicesHardened() {
      _txIndexVersion = -1;
      _txIndexLength = -1;
      _monthTxCache = {};
      _yearTxCache = {};
      _txByAccount = {};
      _txByMonthStr = {};
      _txByYearStr = {};
    }

    invalidateTxIndicesHardened();
    assert.deepStrictEqual(_txByAccount, {});
    assert.deepStrictEqual(_txByMonthStr, {});
    assert.deepStrictEqual(_txByYearStr, {});
    console.log('✓ TEST D SUPERADO: Purga completa de diccionarios de índice previene fugas de memoria.');
    passed++;
  } catch (err) {
    console.error('✕ TEST D FALLÓ:', err);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST E: Detección anticipada de falta de red (Early network abort) ---');
  total++;
  try {
    const queue = [
      { id: 1, type: 'insert', data: {} },
      { id: 2, type: 'insert', data: {} },
      { id: 3, type: 'insert', data: {} },
      { id: 4, type: 'insert', data: {} },
      { id: 5, type: 'insert', data: {} }
    ];

    let networkAttemptsCurrent = 0;
    // Simula comportamiento actual con red caída
    for (let i = 0; i < queue.length; i++) {
      try {
        networkAttemptsCurrent++;
        throw new Error('TypeError: Failed to fetch'); // Fallo de red
      } catch (e) {
        // failed.push(op) y el bucle continúa
      }
    }
    assert.strictEqual(networkAttemptsCurrent, 5, 'El código actual hace 5 intentos inútiles');

    let networkAttemptsHardened = 0;
    let isNetworkDown = false;
    for (let i = 0; i < queue.length; i++) {
      if (isNetworkDown) break;
      try {
        networkAttemptsHardened++;
        throw new TypeError('Failed to fetch');
      } catch (e) {
        if (e instanceof TypeError || e.name === 'TypeError' || !navigatorOnLine()) {
          isNetworkDown = true;
          break; // Aborto temprano
        }
      }
    }
    function navigatorOnLine() { return false; }

    assert.strictEqual(networkAttemptsHardened, 1, 'Con aborto temprano solo hace 1 intento');
    console.log(`✓ TEST E SUPERADO: Reducción de peticiones de red fallidas (${networkAttemptsCurrent} -> ${networkAttemptsHardened}).`);
    passed++;
  } catch (err) {
    console.error('✕ TEST E FALLÓ:', err);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST F: Estimación de cuota y aviso de almacenamiento ---');
  total++;
  try {
    // Mock de navigator.storage.estimate
    const mockStorageManager = {
      estimate: async () => ({
        quota: 100 * 1024 * 1024,   // 100 MB
        usage: 92 * 1024 * 1024    // 92 MB (92% de uso)
      })
    };

    async function checkStorageQuota(storageManager) {
      if (!storageManager || !storageManager.estimate) return null;
      const { quota, usage } = await storageManager.estimate();
      const percentUsed = (usage / quota) * 100;
      const remainingMb = (quota - usage) / (1024 * 1024);
      return {
        isWarning: percentUsed > 80 || remainingMb < 15,
        percentUsed: Math.round(percentUsed),
        remainingMb: Math.round(remainingMb * 10) / 10
      };
    }

    const warning = await checkStorageQuota(mockStorageManager);
    assert.strictEqual(warning.isWarning, true);
    assert.strictEqual(warning.percentUsed, 92);
    console.log(`✓ TEST F SUPERADO: Detección preventiva de cuota agotada (${warning.percentUsed}% ocupado, ${warning.remainingMb} MB libres).`);
    passed++;
  } catch (err) {
    console.error('✕ TEST F FALLÓ:', err);
  }

  console.log('\n================================================================');
  console.log(` RESUMEN AVANZADO: ${passed}/${total} pruebas de hardening SUPERADAS.`);
  console.log('================================================================\n');
}

runAdvancedAudit().catch(e => {
  console.error('Error no capturado:', e);
  process.exit(1);
});
