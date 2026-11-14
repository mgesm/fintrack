# Informe de Auditoría — Agente 5: Arquitectura Offline-First, Service Worker y Resiliencia de Caché

**Proyecto:** `fintrack` (PWA de finanzas personales)  
**Dominio:** Auditoría de Arquitectura Offline, Estrategias de Caché en `serviceworker.js`, Ciclo de Vida de Versionado, Resiliencia de Persistencia Local (LocalStorage / IndexedDB / Web Crypto) e Integridad de Datos Offline  
**Auditor:** Agente Especializado 5 (`audit_agent_5`)  
**Fecha:** 2026-11-14  
**Modo:** Solo lectura (Inspección estática exhaustiva sin modificación de código fuente)  
**Archivos Auditados:**
- `serviceworker.js` (60 líneas)
- `manifest.json` (16 líneas)
- `index.html` (9.880 líneas — bloques de SW, persistencia, Web Crypto, IndexedDB, cola offline y exportación)
- `PROJECT_CONTEXT.md` (§2.3, §6.3, §9)

---

## 1. Resumen Ejecutivo y Diagnóstico Global

FinTrack implementa una arquitectura PWA offline-first con soporte para operaciones locales diferidas, cifrado simétrico AES-GCM en reposo para datos financieros y sincronización bidireccional mediante Supabase.

Sin embargo, el análisis técnico exhaustivo revela **grietas críticas de fiabilidad offline, fallos de diseño en el ciclo de vida del Service Worker y asimetrías de persistencia** que comprometen la continuidad de servicio ante caídas de red y despliegues de nuevas versiones:

1. **Anti-patrón de ciclo de vida en `serviceworker.js`**: `skipWaiting()` inmediato en `install` junto con `clients.claim()` y purga destructiva de cachés anteriores en `activate` (`k !== CACHE_NAME`), mientras el cliente en `index.html` mantiene un gestor `controllerchange` vacío sin notificación al usuario ni recarga coordinada. Esto deja a clientes en ejecución sin dependencias perezosas (lazy-loaded).
2. **Dependencias críticas omitidas del Precache**: `./vendor/jspdf.umd.min.js` (365 KB) y `./vendor/exceljs.min.js` (948 KB) no están en `PRECACHE`. Si el usuario abre la app offline o tras una actualización de versión, la exportación (PDF / Excel) falla irrecuperablemente.
3. **Mala resolución de recursos versionados**: En `index.html` los iconos se solicitan con query string (`icon-512.png?v=7`, `icon-192.png?v=7`), pero en el Service Worker están cacheados como `./icon-512.png` sin `ignoreSearch: true`, fallando la coincidencia de caché en modo offline.
4. **Defecto de lógica en Promise fallback de navegación**: En `serviceworker.js` (línea 44), la expresión `return cached || caches.match('./index.html') || caches.match('./');` contiene un error de tipado booleano: `caches.match()` devuelve un objeto `Promise` (siempre truthy sincrónicamente), lo que convierte a `|| caches.match('./')` en código muerto inalcanzable.
5. **Paradoja irresoluble (Catch-22) en Web Crypto y fallback a LocalStorage**: En `saveSecureLocalCache()`, la obtención de la clave criptográfica depende de que IndexedDB esté disponible. Si IndexedDB falla (modo incógnito estricto, cuota bloqueada), la obtención de la clave lanza una excepción antes de alcanzar el bloque `catch(idbErr)` que pretendía guardar la caché cifrada en `localStorage`.
6. **Brecha de privacidad en la cola offline**: Mientras `currentCachePayload()` se cifra con AES-GCM en IndexedDB, la cola offline (`ft_queue_<uid>`) y las incidencias (`ft_sync_issues_<uid>`) se almacenan en texto plano en `localStorage`, exponiendo conceptos, importes y notas financieras.
7. **Inversiones y ajustes sin cobertura offline uniforme**: Las operaciones de inversión (`record_investment_operation` y `delete_investment_operation`) son llamadas RPC directas a Supabase sin encolado offline ni manejo de fallback.
8. **Riesgo de desalojo silencioso (Storage Eviction)**: No existe invocación a `navigator.storage.persist()`. En Safari iOS y navegadores móviles con poca memoria, la caché local y las bases de datos de IndexedDB pueden ser eliminadas silenciosamente tras 7 días de inactividad o bajo presión de almacenamiento.
9. **Bloqueo offline por expiración de sesión**: Si el usuario abre la PWA sin conexión más de una hora después de su último uso, la expiración del token JWT de Supabase Auth sin red puede forzar un evento de cierre de sesión que borra el estado en memoria y envía al usuario a la pantalla de autenticación, impidiendo consultar sus finanzas offline.

---

## 2. Auditoría Detallada de `serviceworker.js`

### 2.1 Análisis de Precarga (`PRECACHE`) y Activos Faltantes

```javascript
// serviceworker.js: líneas 1-3
var CACHE_NAME='fintrack-cache-v202';
var CACHE_PREFIX='fintrack-cache-';
var PRECACHE=['./','./index.html','./manifest.json','./supabase-js.min.js','./icon-192.png','./icon-512.png','./fonts/inter-latin-wght-normal.woff2'];
```

#### Hallazgos y Vulnerabilidades:
1. **Ovisión de Librerías Vendor Pesadas**:
   - `index.html` carga dinámicamente `./vendor/jspdf.umd.min.js` (líneas 7704, 8178) y `./vendor/exceljs.min.js` (línea 7707) mediante `loadScript()`.
   - Estas librerías **NO están en `PRECACHE`**.
   - Si un usuario instala la app o el Service Worker se actualiza a una nueva versión (`v202`), estas librerías no existen en la nueva caché. Si el usuario pierde la conexión antes de haber realizado una exportación, la función `exportPDF()` o `exportXLSX()` arroja el error: `"No se pudo cargar la librería necesaria. Comprueba tu conexión e inténtalo de nuevo."` (línea 7708).
2. **Descarga Redundante en Instalación (`./` vs `./index.html`)**:
   - `PRECACHE` incluye `'./'` y `'./index.html'`. En servidores estáticos como GitHub Pages (`https://mgesm.github.io/fintrack/`), ambas rutas devuelven idéntico contenido (617 KB). La instalación descarga y almacena dos veces el archivo de 617 KB, consumiendo 1.23 MB de cuota y ancho de banda en móvil.
3. **Fallo de coincidencia en iconos con parámetro de versión (`?v=7`)**:
   - En `index.html` (líneas 2100-2101):
     ```html
     <link rel="icon" type="image/png" sizes="512x512" href="icon-512.png?v=7">
     <link rel="apple-touch-icon" href="icon-192.png?v=7">
     ```
   - En `PRECACHE` se almacena `'./icon-192.png'` y `'./icon-512.png'`.
   - La especificación de W3C Cache API establece que `caches.match(request)` compara la URL completa incluyendo la query string salvo que se especifique `{ ignoreSearch: true }`.
   - En `serviceworker.js` (líneas 54-58), la llamada es `caches.match(e.request)`. Como la petición incluye `?v=7`, la búsqueda en caché falla y recurre a red (`network.catch()`), fallando en offline.
4. **Activos Externos sin Respaldo Offline**:
   - En `index.html` (línea 14):
     `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Outfit:wght@800&display=swap" rel="stylesheet">`
   - En `serviceworker.js` (líneas 26-28):
     ```javascript
     if(url.origin!==location.origin){
       return;
     }
     ```
   - El Service Worker ignora completamente cualquier origen externo. La fuente `Outfit` (utilizada en `--logo-font` para la marca `fintrack.`) no tiene respaldo local en `./fonts/` (solo existe `inter-latin-wght-normal.woff2`). Si el navegador purga la caché HTTP, la tipografía corporativa Outfit se degrada sin conexión.

---

### 2.2 Estrategia de Peticiones de Navegación (`mode === 'navigate'`)

```javascript
// serviceworker.js: líneas 29-48
if(e.request.mode==='navigate'){
  e.respondWith(
    Promise.race([
      fetch(e.request).then(function(networkRes){
        if(networkRes&&networkRes.status===200){
          var resClone=networkRes.clone();
          caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,resClone);});
        }
        return networkRes;
      }),
      new Promise(function(_,reject){
        setTimeout(function(){reject(new Error('Navigation network timeout'));},4500);
      })
    ]).catch(function(){
      return caches.match(e.request).then(function(cached){
        return cached || caches.match('./index.html') || caches.match('./');
      });
    })
  );
  return;
}
```

#### Hallazgos y Vulnerabilidades:
1. **Latencia Excesiva de 4.5 Segundos en "Lie-fi"**:
   - El timeout de 4500 ms (4.5 s) es excesivo para una PWA local. En situaciones de conectividad deficiente (metro, coberturas intermitentes 3G/E), el usuario se encuentra con una pantalla en blanco durante 4.5 segundos antes de que el Service Worker active el fallback a caché.
   - Para un frontend SPA monolítico, la estrategia óptima recomendada es **Stale-While-Revalidate con Navigation Preload** o un timeout estricto de máximo 1.500 ms.
2. **Defecto de Lógica Crítico en Fallback Multicapa (Dead Code)**:
   - Examinemos la línea 44:
     ```javascript
     return cached || caches.match('./index.html') || caches.match('./');
     ```
   - `caches.match()` es una función asíncrona que retorna inmediatamente una instancia de `Promise`.
   - En JavaScript, una `Promise` es un objeto y por tanto es **truthy**.
   - Por tanto, la expresión lógica se evalúa así:
     - Si `cached` es `falsy` (`undefined`), salta al segundo operando: `caches.match('./index.html')`.
     - `caches.match('./index.html')` es un objeto Promise (truthy).
     - El cortocircuito booleano `||` se detiene y **NUNCA** ejecuta el tercer operando: `caches.match('./')`.
   - Si `caches.match('./index.html')` se resuelve eventualmente en `undefined`, la promesa externa se resuelve en `undefined`, sin intentar nunca `./`.
   - **Corrección requerida**:
     ```javascript
     return cached || caches.match('./index.html', {ignoreSearch: true}).then(function(c1){
       return c1 || caches.match('./', {ignoreSearch: true});
     });
     ```

---

### 2.3 Estrategia de Sub-recursos (`mode !== 'navigate'`)

```javascript
// serviceworker.js: líneas 50-58
var network=fetch(e.request);
e.waitUntil(network.then(function(networkRes){
  if(networkRes&&networkRes.status===200)return caches.open(CACHE_NAME).then(function(cache){return cache.put(e.request,networkRes.clone());});
}).catch(function(){}));
e.respondWith(
  caches.match(e.request).then(function(cached){
    return cached||network.catch(function(){return cached;});
  })
);
```

#### Hallazgos y Vulnerabilidades:
1. **Disparo Incondicional de Peticiones de Red**:
   - Para cualquier sub-recurso de mismo origen (iconos, fuentes, scripts vendor), `fetch(e.request)` se ejecuta incondicionalmente en la línea 50, incluso cuando el recurso está perfectamente cacheado y el dispositivo no tiene red.
   - Esto satura la consola con errores `TypeError: Failed to fetch` en modo offline y desperdicia energía de radio celular en dispositivos móviles.
2. **Incompatibilidad con Respuestas Parciales (HTTP 206) y HTTP 304**:
   - La condición de guardado en caché `if(networkRes && networkRes.status===200)` ignora códigos de estado HTTP 304 (Not Modified) o HTTP 206 (Partial Content, habitual al solicitar rangos de fuentes o archivos de audio).
3. **Falta de opción `{ ignoreSearch: true }`**:
   - Si cualquier sub-recurso contiene query parameters (como `icon-512.png?v=7`), `caches.match(e.request)` no coincide con la versión almacenada en caché sin query string.

---

## 3. Ciclo de Vida de Versionado, Activación y Clientes Obsoletos

### 3.1 La Desconexión de Versiones entre `index.html` y `serviceworker.js`

- En `serviceworker.js` (línea 1): `var CACHE_NAME='fintrack-cache-v202';`
- En `index.html` (líneas 2591-2592): `var APP_VERSION='2026.11.09.1'; var APP_PUBLISHED_AT='09/11/2026 16:30 CET';`
- En `PROJECT_CONTEXT.md` (§2.3, línea 65): el documento aún hace referencia a `fintrack-cache-v134` y `2026.09.04.1`.

El mecanismo actual requiere una sincronización manual en tres archivos distintos (`index.html`, `serviceworker.js` y `PROJECT_CONTEXT.md`) ante cada despliegue. Si un desarrollador actualiza `index.html` pero olvida incrementar `CACHE_NAME` en `serviceworker.js`, los clientes continúan sirviendo el `index.html` obsoleto desde la caché activa.

---

### 3.2 Anti-patrón de Activación Destructiva sin Coordinación con el Cliente

Examinemos la interacción entre `install` / `activate` en `serviceworker.js` y el listener en `index.html`:

```javascript
// serviceworker.js: líneas 5-21
self.addEventListener('install',function(e){
  self.skipWaiting();
  ...
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k.indexOf(CACHE_PREFIX)===0&&k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
```

```javascript
// index.html: líneas 2111-2121
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    // La nueva versión se aplicará al volver a abrir la app: nunca se recarga
    // un formulario o una edición que el usuario todavía no ha guardado.
  });
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('serviceworker.js').then(function(reg){
      if(reg)reg.update();
    }).catch(function(){});
  });
}
```

#### Secuencia de Ruptura en Ejecución:
1. El usuario tiene abierta la app en versión `v201`.
2. Se despliega la versión `v202`.
3. `reg.update()` descarga el nuevo `serviceworker.js`.
4. El nuevo SW ejecuta `self.skipWaiting()`, saltándose la fase de espera (`waiting`).
5. El nuevo SW se activa de inmediato y ejecuta:
   `caches.delete(k)` para todas las cachés cuyo nombre no sea `v202`.
   **La caché completa de `v201` es destruida al instante.**
6. El nuevo SW ejecuta `self.clients.claim()`, tomando el control de la pestaña que sigue ejecutando el código HTML/JS de `v201`.
7. En la pestaña, se dispara el evento `controllerchange`.
8. El manejador de `controllerchange` en `index.html` está **vacío**. No muestra ningún aviso al usuario tipo *"Nueva versión lista — pulsa para refrescar"*, ni recarga la página.
9. La pestaña actual ahora está controlada por el SW de `v202`, pero su DOM y variables en memoria corresponden a `v201`.
10. Si el usuario intenta exportar movimientos a PDF, la pestaña solicita `./vendor/jspdf.umd.min.js`. Como la caché de `v201` fue eliminada y en `v202` la librería no está precacheada, si el usuario está offline, la petición falla irremisiblemente.

---

## 4. Auditoría de Persistencia Local: LocalStorage vs. IndexedDB y Web Crypto

### 4.1 Inventario Completo del Almacenamiento Local

| Clave / Almacén | Mecanismo | Contenido | Sensibilidad Financiera | Cifrado |
|---|---|---|---|---|
| `fintrack-secure-cache` (`payloads`) | IndexedDB | `transactions`, `categories`, `accounts`, `patrimony`, `budgets`, `recurrenceExclusions`, `transactionVoids`, `investmentOperations` | **Extrema** | Sí (AES-GCM 256-bit) |
| `fintrack-secure-cache` (`keys`) | IndexedDB | Clave criptográfica no exportable (`device-key`) | Crítica | N/A (CryptoKey nativa) |
| `ft_cache_secure_<uid>` | LocalStorage | Fallback de envelope cifrado en Base64 | **Extrema** | Sí (AES-GCM 256-bit) |
| `ft_cache_<uid>` | LocalStorage | Caché histórica legible | **Extrema** | **NO (Texto plano / Obsoleta)** |
| `ft_queue_<uid>` | LocalStorage | Array de operaciones offline pendientes (`offlineQueue`) | **Extrema** (incluye importes, notas, fechas) | **NO (Texto plano)** |
| `ft_sync_issues_<uid>` | LocalStorage | Array de errores de sincronización (`syncIssues`) | **Extrema** (incluye payload fallido y error) | **NO (Texto plano)** |
| `ft_cat_exclusions_<uid>` | LocalStorage | Exclusiones de categorías | Media | No |
| `ft_cat_icons_<uid>` | LocalStorage | Asignación de iconos personalizados | Baja | No |
| `ft_last_sync_<uid>` | LocalStorage | Timestamp ISO última sincronización | Baja | No |
| `ft_theme` / `ft_accent` | LocalStorage | Preferencias de tema y acento visual | Nula | No |
| `ft_privacy_mode` | LocalStorage | Estado de modo privado ('true'/'false') | Baja | No |
| `ft_invest_portfolio_hidden_<uid>` | LocalStorage | Ocultación de cartera ('0'/'1') | Baja | No |
| `ft_invest_recent_assets_<uid>` | LocalStorage | 3 últimos productos de inversión consultados | Media | No |
| `ft_uistate_<uid>` | LocalStorage | Pestaña activa, selector de fecha, detalle activo | Baja | No |

---

### 4.2 La Paradoja Arquitectónica (Catch-22) en `saveSecureLocalCache()`

Examinemos la implementación del guardado seguro en `index.html` (líneas 3698-3750):

```javascript
// index.html: líneas 3703-3705
async function secureCacheKey(){
  if(secureCacheKeyPromise)return secureCacheKeyPromise;
  secureCacheKeyPromise=(async function(){
    try{
      if(!window.crypto||!crypto.subtle)throw new Error('Cifrado local no disponible');
      var db=await secureCacheDatabase(); // <-- Dependencia estricta de IndexedDB
      ...
```

```javascript
// index.html: líneas 3724-3749
async function saveSecureLocalCache(uid,payload){
  try{
    var key=await secureCacheKey(); // <-- Línea 3726: si IndexedDB falló, secureCacheKey LANZA ERROR AQUÍ
    var iv=crypto.getRandomValues(new Uint8Array(12)),raw=new TextEncoder().encode(JSON.stringify(payload)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,raw);
    var idbEnvelope={version:2,iv:iv,data:cipher,timestamp:Date.now()};
    try{
      var db=await secureCacheDatabase();
      await new Promise(function(resolve,reject){
        var tx=db.transaction('payloads','readwrite');
        var r=tx.objectStore('payloads').put(idbEnvelope,uid);
        r.onsuccess=function(){resolve();};
        r.onerror=function(){reject(r.error);};
      });
      localStorage.removeItem(secureCacheStorageKey(uid));
    }catch(idbErr){ // <-- Línea 3737: El bloque de fallback a localStorage
      var b64Envelope={version:1,iv:cacheBytesToB64(iv),data:cacheBytesToB64(new Uint8Array(cipher)),timestamp:Date.now()};
      var serialized=JSON.stringify(b64Envelope);
      if(serialized.length<2500000){
        try{localStorage.setItem(secureCacheStorageKey(uid),serialized);}catch(lsErr){}
      }else{
        console.warn('Payload excesivo para localStorage fallback; conservado en memoria');
      }
    }
    localStorage.removeItem('ft_cache_'+uid);
  }catch(err){ // <-- Línea 3747: Captura el fallo de secureCacheKey()
    console.warn('No se pudo cifrar la caché local',err);
  }
}
```

#### Análisis del Defecto:
- El diseño pretendía que, si IndexedDB fallaba, los datos cifrados se persistieran en `localStorage` bajo `ft_cache_secure_<uid>` (líneas 3737-3745).
- Sin embargo, para cifrar el payload en la línea 3726, se invoca `secureCacheKey()`.
- `secureCacheKey()` intenta abrir IndexedDB para obtener o generar la `device-key` (línea 3703).
- Si IndexedDB está bloqueado (navegación privada en Safari, error de cuota o corrupción), `secureCacheKey()` **lanza una excepción en la línea 3726**.
- Como consecuencia, la ejecución salta directamente al bloque `catch(err)` externo (línea 3747).
- **El bloque de fallback `catch(idbErr)` en la línea 3737 es completamente inalcanzable cuando IndexedDB no está disponible.**
- Resultado: no se guarda absolutamente nada ni en IndexedDB ni en LocalStorage. Los datos existen exclusivamente en la memoria RAM volátil.

---

### 4.3 Destrucción Irreversible de Datos Locales ante Errores de Descifrado

En `readSecureLocalCache()` (líneas 3776-3784):

```javascript
try{
  var key=await secureCacheKey();
  var ivBytes=(envelope.iv instanceof Uint8Array||envelope.iv instanceof ArrayBuffer)?envelope.iv:cacheB64ToBytes(envelope.iv);
  var cipherBytes=(envelope.data instanceof Uint8Array||envelope.data instanceof ArrayBuffer)?envelope.data:cacheB64ToBytes(envelope.data);
  var plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:ivBytes},key,cipherBytes);
  var decrypted=JSON.parse(new TextDecoder().decode(plain));
  return decrypted;
}catch(e){
  try{
    var db2=await secureCacheDatabase();
    var tx2=db2.transaction('payloads','readwrite');
    tx2.objectStore('payloads').delete(uid); // <-- ELIMINACIÓN DESTRUCTIVA INMEDIATA
  }catch(idbE){}
  localStorage.removeItem(secureCacheStorageKey(uid));
  return null;
}
```

#### Riesgo Detectado:
Si el descifrado falla por una condición transitoria (por ejemplo, regeneración de clave accidental por reinicio de IndexedDB, o un fallo momentáneo del subsistema criptográfico en móvil), el código **borra inmediatamente el payload del usuario**. Si el usuario se encuentra sin conexión en ese momento, sus datos financieros locales quedan destruidos y la app no puede mostrar nada (`loadData()` retorna `false` y deja las colecciones vacías).

---

### 4.4 Inconsistencia de Seguridad: Datos Financieros en Texto Plano en `localStorage`

En `index.html` (líneas 3341-3345):

```javascript
function queueKey(){return 'ft_queue_'+(currentUser?currentUser.id:'anon');}
function queueOp(op){
  offlineQueue.push(op);
  try{localStorage.setItem(queueKey(),JSON.stringify(offlineQueue));return true;}
  catch(e){offlineQueue.pop();setSync('err');showSuccessToast('No hay espacio local para guardar este cambio');return false;}
}
```

En contraste con la estricta política de cifrado de `currentCachePayload()`, cada transacción creada o editada sin conexión se añade a `offlineQueue` en **texto plano** dentro de `localStorage`. Un objeto en `offlineQueue` contiene:
`{ type: 'insert', table: 'transactions', data: { amount: 1500, note: 'Nómina', category: '...', date: '2026-11-14' } }`.
Cualquier script que se ejecute en el mismo origen o cualquier inspección física del dispositivo puede acceder a estas transacciones no cifradas.

---

### 4.5 Desalojo Silencioso de Almacenamiento (Falta de `StorageManager`)

En navegadores modernos, el almacenamiento web se clasifica como `best-effort` por defecto. En iOS Safari (WebKit), existe la regla de desalojo de 7 días para sitios web sin uso continuado si no están guardados en pantalla de inicio.
FinTrack **no utiliza en ningún punto la API `navigator.storage`**:
- No invoca `navigator.storage.persist()` para solicitar almacenamiento persistente inmune a desalojo.
- No invoca `navigator.storage.estimate()` para alertar al usuario antes de saturar la cuota asignada por el sistema operativo.

---

## 5. Auditoría de Integridad de Datos Offline y Modos de Fallo

### 5.1 Orden de Ejecución y Desincronización en `loadData()` Offline

Examinemos el flujo de `loadData()` en `index.html` (líneas 3816-3919):

```javascript
// index.html: líneas 3818-3840
var cd=await readSecureLocalCache(currentUser.id);
if(cd){
  transactions=cd.transactions||[];
  ...
}
if(isOffline)return false; // <-- LÍNEA 3839: RETORNO ANTICIPADO CUANDO NO HAY RED
...
// index.html: líneas 3883-3896
if(offlineQueue.length>0){ // <-- LÍNEA 3883: APLICACIÓN DE CAMBIOS PENDIENTES
  offlineQueue.forEach(function(op){
    if(op.table==='transactions'){
      if(op.type==='insert'&&op.data){
        if(!transactions.some(function(x){return x.id===op.data.id;}))transactions.unshift(op.data);
      }else if(op.type==='update'&&op.id&&op.data){
        var uIdx=transactions.findIndex(function(x){return x.id===op.id;});
        if(uIdx>=0)transactions[uIdx]=Object.assign({},transactions[uIdx],op.data);
      }else if(op.type==='delete'&&op.id){
        transactions=transactions.filter(function(x){return x.id!==op.id;});
      }
    }
  });
}
```

#### Análisis del Fallo:
- En la línea 3839, si `isOffline === true`, la función ejecuta `return false;`, saltando directamente al bloque `finally` para invocar `render()`.
- El bloque de las líneas 3883-3896, que se encarga de reincorporar a la memoria las modificaciones pendientes de la `offlineQueue` sobre las transacciones, **está situado después del `return` de la línea 3839**.
- En un arranque en frío sin conexión, si la caché local en IndexedDB no se sincronizó antes de cerrar la app pero `offlineQueue` sí persistió en `localStorage`, los elementos de la cola no se fusionan con la lista en memoria de `transactions`.

---

### 5.2 Ausencia Total de Soporte Offline en el Módulo de Inversiones

En `index.html`:
1. **Registro de Operaciones de Compra/Venta** (línea 6493):
   ```javascript
   var r=await sb.rpc('record_investment_operation',{p_side:side,p_symbol:asset.symbol,p_product_name:asset.name,p_product_type:asset.type||null,p_units:units,p_unit_price:p,p_amount:total,p_operation_date:date,p_cash_account_id:accountId});
   if(r.error){summary.textContent='No se pudo guardar: '+r.error.message; ... return;}
   ```
2. **Eliminación de Operaciones de Inversión** (líneas 6690-6692):
   ```javascript
   var r=await sb.rpc('delete_investment_operation',{p_operation_id:id});
   if(r.error){alert('No se pudo eliminar la operación: '+r.error.message);return;}
   ```

A diferencia de los gastos, ingresos, traspasos, categorías y saldos patrimoniales, las operaciones de inversión no comprueban `if(isOffline)`, no generan IDs provisionales y no registran operaciones en `offlineQueue`. Intentar operar inversiones sin cobertura de red provoca un fallo inmediato por error de red en la llamada RPC.

---

### 5.3 Bloqueo de Acceso Offline por Expiración de Token Supabase Auth

En `index.html` (líneas 9849-9864):

```javascript
sb.auth.onAuthStateChange(function(event,session){
  if(event==='PASSWORD_RECOVERY'){ ... return;}
  if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){if(session&&session.user)currentUser=session.user;return;}
  if(event==='SIGNED_IN'&&inPasswordRecovery){if(session&&session.user)currentUser=session.user;return;}
  inPasswordRecovery=false;
  if(session&&session.user){
    currentUser=session.user;
    if(event==='INITIAL_SESSION'||event==='SIGNED_IN')showApp();
  }
  else{
    // <-- LÍNEA 9860: CIERRE DE SESIÓN FORZADO
    currentUser=null;transactions=[];categories=[];accounts=[];patrimony=[];budgets=[];recurrenceExclusions=[];transactionVoids=[];offlineQueue=[];investmentOperations=[];
    showAuth();
  }
});
```

#### Dinámica del Fallo en Móvil:
1. El usuario tiene su sesión iniciada y la PWA instalada en su teléfono.
2. Tras 1 hora sin conexión (tiempo de expiración estándar del access token JWT de Supabase), el usuario abre la app en modo avión.
3. El cliente de Supabase JS intenta refrescar el token contra `https://sswktibdpxqrumsqsegi.supabase.co/auth/v1/token`.
4. La petición de red falla (`TypeError: Failed to fetch`).
5. El cliente emite un estado sin sesión (`session: null`).
6. El bloque `else` (líneas 9860-9863) se ejecuta: vacía todos los arrays de datos en memoria y muestra `showAuth()`.
7. **El usuario se queda bloqueado en la pantalla de inicio de sesión**, sin poder iniciar sesión (porque no hay red) y sin poder consultar sus datos guardados en la caché local cifrada.

---

### 5.4 Limitación en la Recuperación de Caché Dañada (`clearLocalCacheAndResync`)

En `index.html` (líneas 6844-6870), la función `clearLocalCacheAndResync()`:
- Borra `ft_cache_secure_<uid>` en `localStorage`.
- Borra el objectStore `payloads` en IndexedDB.
- Fuerza `loadData(true)`.

**Omisión Crítica:**
La función **no invoca `caches.delete()` sobre la Cache API del Service Worker**. Si el archivo `index.html` o `supabase-js.min.js` almacenado en la caché del Service Worker está corrupto o desincronizado, pulsar este botón no tiene ningún efecto sobre los archivos estáticos de la aplicación. Tampoco existe un mecanismo de arranque de emergencia (por ejemplo, parámetro URL `?ft_bypass_sw=1` o desregistro forzado del Service Worker).

---

## 6. Matriz de Priorización Impacto vs. Esfuerzo

| ID | Hallazgo / Medida Propuesta | Impacto | Esfuerzo | Fase Recomendada |
|---|---|---|---|---|
| **A5-01** | **Incluir dependencias vendor (`jspdf`, `exceljs`) en `PRECACHE`** para garantizar exportación offline en cualquier momento. | **Alto** | **Bajo** | Fase 1 |
| **A5-02** | **Corregir bug lógico de Promise en fallback de navegación** (`serviceworker.js:44`) y añadir `{ ignoreSearch: true }` a las búsquedas de caché. | **Alto** | **Bajo** | Fase 1 |
| **A5-03** | **Prevenir deslogueo involuntario offline**: preservar el perfil de `currentUser` en almacenamiento seguro y no forzar `showAuth()` ante fallos de red al refrescar token. | **Alto** | **Medio** | Fase 1 |
| **A5-04** | **Reorganizar `loadData()`**: mover la aplicación de `offlineQueue` antes del corte `if(isOffline) return false` para no ignorar cambios pendientes en arranques sin red. | **Alto** | **Bajo** | Fase 1 |
| **A5-05** | **Optimizar timeout de navegación** en `serviceworker.js` (reducir de 4.5 s a 1.5 s o implementar Stale-While-Revalidate con Navigation Preload). | **Medio** | **Medio** | Fase 2 |
| **A5-06** | **Resolver la paradoja IndexedDB / LocalStorage** en `saveSecureLocalCache()` aislando la generación de la clave o usando derivación local robusta. | **Alto** | **Medio** | Fase 2 |
| **A5-07** | **Cifrar la cola offline (`offlineQueue`) y `syncIssues`** en reposo para cumplir con la política de privacidad estricta de datos financieros. | **Alto** | **Medio** | Fase 2 |
| **A5-08** | **Coordinar ciclo de vida del SW**: no invocar `skipWaiting()` descontroladamente; escuchar `controllerchange` para mostrar un toast elegante *"Nueva versión disponible · Actualizar"* sin destruir cachés en uso. | **Medio** | **Medio** | Fase 2 |
| **A5-09** | **Integrar API `StorageManager`**: solicitar `navigator.storage.persist()` para blindar la app contra el desalojo de 7 días en Safari iOS. | **Medio** | **Bajo** | Fase 2 |
| **A5-10** | **Ampliar `clearLocalCacheAndResync()`** para permitir purgar también la Cache API del Service Worker (`caches.delete`) ante corrupción de interfaz. | **Medio** | **Bajo** | Fase 3 |
| **A5-11** | **Dotar de soporte offline al módulo de Inversiones** (compras, ventas y borrados) mediante generación de IDs temporales y encolado en `offlineQueue`. | **Medio** | **Alto** | Fase 3 |
| **A5-12** | **Añadir parámetro de recuperación de emergencia** (`?recover=1`) que desregistre el Service Worker y limpie caches si la app sufre un crash durante el boot. | **Bajo** | **Bajo** | Fase 3 |

---

## 7. Riesgos de Regresión y Procedimientos de Verificación Independiente

### 7.1 Riesgos de Regresión al Aplicar Correcciones

1. **Riesgo en Precarga de Archivos Grandes (A5-01)**:
   - Añadir `exceljs.min.js` (948 KB) y `jspdf.umd.min.js` (365 KB) a `PRECACHE` incrementa el tamaño de la precarga inicial en ~1.3 MB.
   - *Mitigación*: En `serviceworker.js`, precargar estos archivos en segundo plano con `cache.addAll()` o dentro del array con captura de error `.catch(function(){})` para que un fallo en la descarga de ExcelJS en redes lentas no aborte la instalación de `index.html`.
2. **Riesgo en Cambio de Ciclo de Vida del Service Worker (A5-08)**:
   - Eliminar `self.skipWaiting()` puede provocar que usuarios con sesiones largas queden en versiones desactualizadas si no se implementa adecuadamente la interfaz de recarga manual.
   - *Mitigación*: Implementar un banner o toast no invasivo: *"Hay una actualización lista"* con botón de confirmación que envíe un mensaje `{ action: 'skipWaiting' }` al Service Worker y espere al evento `controllerchange` para ejecutar `window.location.reload()`.
3. **Riesgo en Cifrado de la Cola Offline (A5-07)**:
   - Cifrar `offlineQueue` añade asincronía a `queueOp()`. Actualmente `queueOp()` es síncrono (retorna un booleano). Si se convierte en asíncrono, todas las llamadas que lo invocan (`saveTx`, `deleteTx`, `saveCatColor`, etc.) deben gestionarse con `await` o mantener una cola en memoria síncrona que se persista de forma diferida mediante un `debounce`.

---

### 7.2 Protocolo de Verificación y Pasos de Prueba

Para verificar independientemente las correcciones cuando sean implementadas en fases posteriores:

#### Prueba 1: Simulación de Desconexión Completa (Cold Start Offline)
1. Abrir Chrome DevTools o Safari Web Inspector en `https://mgesm.github.io/fintrack/`.
2. Iniciar sesión y confirmar que los datos cargan correctamente.
3. En la pestaña *Application* > *Service Workers*, marcar la casilla **Offline** (o poner el terminal móvil en Modo Avión).
4. Cerrar la pestaña o matar el proceso de la PWA.
5. Volver a abrir la URL.
6. **Criterio de éxito**: La app debe abrir inmediatamente sin pantalla en blanco de 4.5 segundos, no debe redirigir a la pantalla de login (`authScreen`), debe mostrar el banner *"sin conexión — modo offline"* y listar todas las transacciones, cuentas y categorías desde la caché local cifrada.

#### Prueba 2: Exportación Offline Inmediata
1. En una instalación limpia (o tras incrementar `CACHE_NAME`), abrir la app en modo online una vez.
2. Desconectar la red inmediatamente.
3. Navegar a Ajustes > *Exportar movimientos (PDF · Excel · CSV)* y pulsar *Descargar PDF*.
4. **Criterio de éxito**: El documento PDF debe generarse y descargarse correctamente sin requerir conexión a internet ni mostrar alertas de error de librería no cargada.

#### Prueba 3: Resiliencia de Cola Offline ante Cierres Abruptos
1. Con la app en modo offline, crear un nuevo gasto *"Café prueba offline"*, editar el color de una categoría y eliminar un movimiento.
2. Verificar que la bandeja de sincronización offline muestra `3 pendientes`.
3. Forzar el cierre de la PWA (matar proceso).
4. Reabrir la PWA en modo offline.
5. **Criterio de éxito**: Los 3 cambios deben seguir visibles en la interfaz y en la bandeja de sincronización (`openSyncTray()`). Al restablecer la conexión a internet, `processOfflineQueue()` debe sincronizar los 3 movimientos con Supabase automáticamente.

#### Prueba 4: Prueba de Desalojo y Cuota en Almacenamiento Persistente
1. En la consola de DevTools, ejecutar:
   ```javascript
   navigator.storage.persisted().then(p => console.log('Persisted:', p));
   navigator.storage.estimate().then(e => console.log('Quota:', e.quota, 'Usage:', e.usage));
   ```
2. **Criterio de éxito**: `persisted()` debe retornar `true` tras haber solicitado `navigator.storage.persist()`, asegurando protección contra borrados automáticos del sistema operativo.
