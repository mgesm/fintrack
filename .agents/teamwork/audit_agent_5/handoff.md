# Handoff Report — Agent 5: Offline-First Architecture, Service Worker & Cache Auditor

## 1. Observation
Direct observations in the `fintrack` codebase:
- **`serviceworker.js:3`**: `var PRECACHE=['./','./index.html','./manifest.json','./supabase-js.min.js','./icon-192.png','./icon-512.png','./fonts/inter-latin-wght-normal.woff2'];`. `./vendor/jspdf.umd.min.js` (364,861 bytes) and `./vendor/exceljs.min.js` (947,746 bytes) are completely omitted from the precache array.
- **`serviceworker.js:5-20`**:
  - Line 6: `self.skipWaiting();` runs immediately on `install`.
  - Line 19: `keys.filter(function(k){return k.indexOf(CACHE_PREFIX)===0&&k!==CACHE_NAME;}).map(function(k){return caches.delete(k);})` wipes all previous caches on `activate`.
  - Line 20: `self.clients.claim();` executes immediately on `activate`.
- **`index.html:2112-2115`**:
  ```javascript
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    // La nueva versión se aplicará al volver a abrir la app: nunca se recarga
    // un formulario o una edición que el usuario todavía no ha guardado.
  });
  ```
  The client listener for `controllerchange` has an empty body; no user prompt or reload occurs when the active controller changes.
- **`serviceworker.js:44`**: In `e.request.mode === 'navigate'`, the fallback catch contains:
  `return cached || caches.match('./index.html') || caches.match('./');`.
- **`index.html:2100-2101`**: `<link rel="icon" type="image/png" sizes="512x512" href="icon-512.png?v=7">` and `<link rel="apple-touch-icon" href="icon-192.png?v=7">` include `?v=7`, whereas `serviceworker.js:55` performs `caches.match(e.request)` without `{ ignoreSearch: true }`.
- **`index.html:3703` & `3726`**: In `saveSecureLocalCache()`, line 3726 calls `await secureCacheKey()`. Inside `secureCacheKey()`, line 3703 calls `await secureCacheDatabase()`. If IndexedDB fails to open, `secureCacheKey()` throws on line 3726, jumping directly to the outer catch on line 3747. The fallback block `catch(idbErr)` on line 3737 (which was meant to write to `localStorage`) is unreachable.
- **`index.html:3341-3345`**: `queueOp()` writes `JSON.stringify(offlineQueue)` directly to `localStorage.setItem(queueKey(), ...)` in unencrypted plaintext.
- **`index.html:3839` & `3883`**: In `loadData()`, line 3839 executes `if(isOffline)return false;`. The block iterating over `offlineQueue` to merge pending in-flight operations into `transactions` is on lines 3883-3896, positioned *after* the return statement.
- **`index.html:6493` & `6692`**: Investment buy/sell operations call `sb.rpc('record_investment_operation', ...)` and deletions call `sb.rpc('delete_investment_operation', ...)` directly without any `if(isOffline)` condition or `queueOp` fallback.
- **`index.html:9860-9863`**: In `sb.auth.onAuthStateChange()`, when an access token expires while offline and refresh fails, `else { currentUser=null; transactions=[]; ... showAuth(); }` wipes all in-memory arrays and forces the user to the login screen.
- **Entire codebase search**: Zero occurrences of `navigator.storage.persist` or `navigator.storage.estimate`.

## 2. Logic Chain
1. **Offline Export Failure**: Observation (`serviceworker.js:3`) shows vendor libraries are not precached. Observation (`serviceworker.js:19`) shows old caches are purged on version increment. When offline after an update, dynamic imports of `jspdf` and `exceljs` fail, breaking document export.
2. **Dead Code in SW Fallback**: Observation (`serviceworker.js:44`) shows `caches.match('./index.html') || caches.match('./')`. In JavaScript, `caches.match()` returns a Promise object, which is always truthy. Therefore, the logical OR short-circuits and `caches.match('./')` is dead code that never executes.
3. **Unreachable LocalStorage Fallback (Catch-22)**: Observation (`index.html:3703, 3726, 3737`) demonstrates that `secureCacheKey()` requires IndexedDB to obtain the cryptographic key before the encryption block. When IndexedDB fails, `secureCacheKey()` throws prior to entering the inner `try/catch(idbErr)`. Consequently, the intended fallback to `localStorage` never executes.
4. **Privacy Inconsistency**: Observation (`index.html:3341-3345`) shows `offlineQueue` is stored in plaintext in `localStorage`, whereas `currentCachePayload()` is encrypted in IndexedDB. This exposes transaction amounts, notes, and dates in local unencrypted storage.
5. **Offline Queue Sync Glitch in Cold Boot**: Observation (`index.html:3839, 3883`) shows `loadData()` returns early when offline before reaching the queue reconciliation loop on line 3883. Unsynced queue items are not merged into in-memory `transactions` on offline boot if the secure cache snapshot lagged behind.
6. **Offline Authentication Lockout**: Observation (`index.html:9860-9863`) shows that a network failure during background token refresh clears `currentUser` and wipes all memory state, trapping the offline user on `authScreen` despite valid encrypted local data on disk.

## 3. Caveats
- No changes to source code (`serviceworker.js`, `index.html`) were made, in strict compliance with the read-only audit constraint.
- Storage quota limits (~5 MB for LocalStorage, variable 50 MB - 2 GB for IndexedDB) were evaluated based on standard browser engine specifications (Blink, WebKit, Gecko).
- Cross-origin CDN behavior for Google Fonts was analyzed based on W3C Fetch/Cache specifications regarding CORS and origin isolation.

## 4. Conclusion
FinTrack possesses a solid foundational architecture with Web Crypto encryption and an offline queue. However, it suffers from critical lifecycle bugs in `serviceworker.js` (uncoordinated `skipWaiting()`, broken navigation fallback, missing precache for export libraries), an architectural catch-22 in its storage fallback, plaintext leakage of offline queue operations in LocalStorage, lack of offline support in investments, and potential session lockout offline. These issues have been fully cataloged with an Impact-vs-Effort matrix in `audit_report.md`.

## 5. Verification Method
To verify these findings independently without modifying application code:
1. **Inspect SW Navigation Fallback**: Run `Select-String -Path serviceworker.js -Pattern "caches.match\('\./index.html'\)"` to verify line 44 truthiness bug.
2. **Inspect Precache List**: Run `Select-String -Path serviceworker.js -Pattern "PRECACHE"` and verify absence of `vendor/jspdf.umd.min.js` and `vendor/exceljs.min.js`.
3. **Verify Offline Queue Reconciliation Position**: View `index.html` lines 3838 to 3885 and confirm that `if(isOffline)return false;` (line 3839) precedes `if(offlineQueue.length>0)` (line 3883).
4. **Verify Investment Offline Handling**: Search `record_investment_operation` in `index.html` (line 6493) and confirm the absence of `if(isOffline)` or `queueOp`.
5. **Runtime Emulation**: In Chrome DevTools, activate *Offline* in the Network panel, close the PWA, reopen, and verify the offline behavior, export button behavior, and session handling.
