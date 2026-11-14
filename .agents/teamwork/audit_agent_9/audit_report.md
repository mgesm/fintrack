# Informe de Auditoría Exhaustiva: Privacidad, Seguridad de Datos, Criptografía y Modo Privado en fintrack

> **Agente Auditor:** Agente 9 — Privacidad, Seguridad de Datos & Modo Privado  
> **Fecha de Auditoría:** 14 de Noviembre de 2026  
> **Ámbito de Inspección:** `index.html` (v2026.11.09.1, caché v202), `serviceworker.js`, `supabase/functions/` (`market-data`, `automatic-backup`, `monthly-report`, `restore-backup`), `supabase/config.toml`  
> **Restricción Operativa:** Estrictamente auditoría de solo lectura. Sin modificaciones de código fuente.

---

## 1. Resumen Ejecutivo

La presente auditoría exhaustiva ha analizado en profundidad la implementación de privacidad, mecanismos de cifrado en cliente, resistencia criptográfica, vectores de ataque XSS, sanitización de entradas, persistencia de sesiones y seguridad de credenciales en la PWA `fintrack`.

### Hallazgos Principales:
1. **Contradicción Crítica en Modo Privado vs. Invariante de Diseño:**  
   La regla CSS `html.privacy-mode` desenfoca (`filter: blur(6px); pointer-events: none;`) los lienzos completos de los gráficos anuales (`#lineChartCanvas`, `#barChartCanvas`) y el mapa de calor (`.heatmap-grid`), violando el invariante arquitectónico que exige mantener los gráficos visuales y aros completamente intactos e interactivos mientras se difuminan las cifras numéricas.
2. **Fuga Masiva de Importes en Claro en Pestañas (Categorías, Cuentas, Análisis e Inversión):**  
   El desenfoque CSS o el enmascaramiento con `fmtPrivacy()` **solo cubre 7 elementos específicos** de la pantalla de inicio. En las pestañas **Categorías** (100% de importes, presupuestos y subcategorías en claro), **Cuentas** (Patrimonio total, saldos teóricos de cuentas corrientes, desfases e históricos en claro), **Análisis** (todas las 9 tarjetas estadísticas y comparativas en claro) e **Inversión** (totalmente desvinculada del modo privado global), las cifras financieras confidenciales quedan 100% expuestas.
3. **Desconexión Arquitectónica entre Modo Privado Global y Privacidad de Cartera:**  
   Existen dos mecanismos no coordinados: `isPrivacyMode()` (global en `localStorage['ft_privacy_mode']`) y `portfolioValueHidden()` (por usuario en `localStorage['ft_invest_portfolio_hidden_<uid>']`). Activar el Modo Privado global no enmascara las inversiones ni las excluye de las cuentas bancarias.
4. **Resistencia Criptográfica Fuerte pero con Colisión de Clave Única de Dispositivo:**  
   El motor Web Crypto AES-GCM (256 bits, IV de 96 bits, clave no exportable en IndexedDB) es robusto, pero utiliza una clave única fija `'device-key'` para todos los usuarios del dispositivo en vez de derivarla por usuario.
5. **Fugas Residuales en Cierre de Sesión (`signOut`):**  
   Al cerrar sesión, no se purgan las claves de activos recientes (`ft_invest_recent_assets_<uid>`), cuenta predeterminada, exclusiones ni variables globales en memoria (`searchQuery`, `filterAccount`), dejando rastros de datos privados.
6. **Vulnerabilidad de Bucle Infinito (Denegación de Servicio) en `hlText`:**  
   Consultas de búsqueda compuestas únicamente por caracteres diacríticos hacen que `normStr` retorne una cadena vacía, provocando que la expresión regular coincida en longitud cero y genere un bucle infinito que bloquea por completo el hilo principal del navegador.
7. **Inyección en Atributos HTML y Carencia de Content Security Policy (CSP):**  
   Atributos dinámicos en `onclick` (`editTx(t.id)`) no escapan `t.id`, y no existe cabecera o meta-etiqueta `Content-Security-Policy`.
8. **Seguridad de Claves Supabase Satisfactoria:**  
   Se verificó que únicamente la clave pública/anon (`sb_publishable_...`) está expuesta en el cliente. Claves de servicio y API keys de terceros (`TWELVE_DATA_API_KEY`, `RESEND_API_KEY`) residen exclusivamente en Edge Functions protegidas con verificación obligatoria de JWT.

---

## 2. Auditoría Detallada por Dominios

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAPA DE DOMINIOS AUDITADOS                      │
├────────────────────────┬───────────────────────────────────────────────┤
│ Dominio 1              │ Modo Privado & Desenfoque Numérico Universal  │
│ Dominio 2              │ Privacidad de Cartera & Enmascaramiento       │
│ Dominio 3              │ Seguridad Criptográfica Web Crypto & Memoria  │
│ Dominio 4              │ Sanitización, XSS & Superficie de Inyección   │
│ Dominio 5              │ Gestión de Sesión & Claves Supabase / Secretos│
└────────────────────────┴───────────────────────────────────────────────┘
```

---

### DOMINIO 1: Modo Privado & Desenfoque Numérico Universal

#### 1.1 Invariante Arquitectónico vs. Realidad del Código
El invariante fundamental establecido en `ORIGINAL_REQUEST.md` (R3), `PROJECT_CONTEXT.md` (§11, changelog 2026.10.26.3) y `DISPATCH.md` exige:
> *"Privacy mode compliance: numeric amounts blurred, visual graphs/rings intact."*  
> *"Ensure numeric amounts are cleanly blurred (`filter: blur(...)`) across ALL tabs while charts, outer rings, labels, and icons remain fully readable and interactive."*

Sin embargo, al inspeccionar `index.html` en las líneas 1515-1526:
```css
/* Privacy mode obscuring */
html.privacy-mode #lineChartCanvas,
html.privacy-mode #barChartCanvas,
html.privacy-mode .heatmap-grid,
html.privacy-mode .dc-amount,
html.privacy-mode .dt-dc-amount,
html.privacy-mode .heatmap-tot,
html.privacy-mode .heatmap-detail {
  filter: blur(6px);
  transition: filter 0.25s ease;
  pointer-events: none;
}
```

**Análisis del Fallo:**
1. **Lienzos de Gráficos Desenfoque Destructivo:**  
   `#lineChartCanvas` (evolución patrimonial) y `#barChartCanvas` (ingresos vs gastos) son lienzos `<canvas>`. Al aplicar `filter: blur(6px); pointer-events: none;`, la curva visual, las barras coloreadas y las tendencias quedan completamente destruidas visualmente, y la interacción táctil/hover para inspeccionar datos queda inhabilitada. El usuario no puede apreciar la forma ni la salud de su evolución financiera.
2. **Incoherencia del Heatmap:**  
   `.heatmap-grid` queda desenfocado en su totalidad en vez de desenfocar únicamente el importe total acumulado (`.heatmap-tot`) y las cifras del detalle diario (`.hm-det-tot`).

#### 1.2 Auditoría de Fugas Numéricas Pestaña por Pestaña
A diferencia de los 7 selectores desenfocados en CSS, **las cifras numéricas de la interfaz se generan mediante concatenación JavaScript** en funciones `render()`. La mayoría de llamadas utilizan `fmt(n)` o `fmtHtml(n)` sin comprobar `isPrivacyMode()`.

| Ubicación / Pestaña | Elemento / Selector | Código Fuente | Comportamiento en Modo Privado | Veredicto |
|---|---|---|---|---|
| **Tab 0: Inicio (Dashboard)** | Nota de balance (`#balanceAdjustmentNote`) | Línea 4229: `el.textContent = 'Actualización de gastos: ' + (net<0?'−':'+') + fmt(Math.abs(net));` | Muestra el importe neto en texto claro | ❌ **FUGA** |
| **Tab 0: Inicio (Dashboard)** | Nota gastos no computados (`#uncomputedExpensesNote`) | Línea 4240: `el.textContent = 'Gastos no computados: ' + fmt(uncomputed);` | Muestra la cifra en texto claro | ❌ **FUGA** |
| **Tab 0: Inicio (Desktop)** | Notas escritorio (`#dtBalanceAdjustmentNote`, `#dtUncomputedExpensesNote`) | Líneas 9484-9485 | Muestra importes en texto claro | ❌ **FUGA** |
| **Tab 0: Inicio** | Barra de presupuesto mensual (`.btb-value`) | Línea 4197: `(isPrivacyMode()?'•••••• / ••••••':...)` | Enmascara con puntos | ✅ Correcto |
| **Tab 0: Inicio** | Tarjetas KPI (`#totalInc`, `#totalExp`, `#totalBal`) | Línea 4180: `incEl.textContent='••••••';` | Enmascara con puntos | ✅ Correcto |
| **Tab 0: Transacciones** | Importes de filas (`.tx-amount`) | Línea 5040: `var txAmtStr=hideTx?'••••••':...` | Enmascara con puntos | ✅ Correcto |
| **Tab 1: Categorías** | Importe gastado (`.cat-amount-text`) | Línea 5267: `(amt>0?fmt(amt):'0 €')` | Muestra el gasto real en claro | ❌ **FUGA CRÍTICA** |
| **Tab 1: Categorías** | Insignia de presupuesto (`.budget-badge`) | Línea 5277: `(budget>0?'<span class="budget-badge">'+fmt(budget)+'</span>':'')` | Muestra el límite en claro | ❌ **FUGA CRÍTICA** |
| **Tab 1: Categorías** | Estado de presupuesto (`.cat-sub-text`) | Líneas 5180, 5184: `'Excedido en '+fmt(diff)`, `'Quedan '+fmt(budget-amt)` | Muestra importes en claro | ❌ **FUGA CRÍTICA** |
| **Tab 1: Categorías** | Subcategorías (`.subcat-row span`) | Línea 5206: `(sa>0?fmt(sa):'—')` | Muestra desglose en claro | ❌ **FUGA CRÍTICA** |
| **Tab 2: Cuentas** | Patrimonio Total (`.pat-total-value`) | Línea 5426: `(totalPat<0?'−':'')+fmtHtml(Math.abs(totalPat))` | Muestra el patrimonio consolidado en texto claro | ❌ **FUGA CRÍTICA** |
| **Tab 2: Cuentas** | Saldo de cuentas no inversoras (`.pat-acc-theoretical`) | Línea 5374: `calcText=isPrivateInvestmentBalance?'••••••':fmtHtml(calc);` | Muestra saldo bancario en texto claro | ❌ **FUGA CRÍTICA** |
| **Tab 2: Cuentas** | Último ajuste de saldo (`.pat-acc-calc`) | Línea 5376: `(isPrivateInvestmentBalance?'••••••':fmt(reset.amount))` | Muestra saldo real en texto claro | ❌ **FUGA CRÍTICA** |
| **Tab 2: Cuentas** | Historial de ajustes (`.pat-hist-row`) | Líneas 5388, 5389, 5395: `Real: fmt(p.amount)`, `Teórico: fmt(th)`, `Desfase: fmt(d)` | Expone historial contable completo | ❌ **FUGA CRÍTICA** |
| **Tab 3: Análisis** | Comparativa vs mes anterior (`.compare-val`, `.compare-diff`) | Líneas 6304-6305: `fmt(curExp)`, `fmt(curInc)`, `fmt(Math.abs(expDiff))` | Expone gastos e ingresos en claro | ❌ **FUGA CRÍTICA** |
| **Tab 3: Análisis** | 9 Tarjetas de Estadísticas Anuales (`.stat-val`) | Líneas 6263-6288: `fmt(avgExpPast)`, `fmt(avgInc)`, `fmt(expData[maxExpIdx])`, `fmt(Math.abs(avgSavPast))`... | 100% de estadísticas anuales visibles | ❌ **FUGA CRÍTICA** |
| **Tab 4: Inversión** | Valor de cartera, invertido, rentabilidad, posiciones | Líneas 6695, 6698: utilizan `portfolioValueHidden()` | Totalmente desprotegido bajo `isPrivacyMode()` | ❌ **FUGA ARQUITECTÓNICA** |
| **Modales** | Edición de movimiento (`#txAmount`) | Línea 7051: `document.getElementById('txAmount').value = tx.amount;` | El input expone la cifra en claro | ⚠️ Fuga de hombro |
| **Modales** | Ajuste de saldo (`#adjustTheoreticalDisplay`) | Línea 5687: `disp.textContent = fmt(th);` | Expone el saldo teórico de la cuenta | ⚠️ Fuga de hombro |

#### 1.3 Solución Arquitectónica Recomendada para el Modo Privado
En lugar de depender exclusivamente de parches condicionales en JavaScript dispersos en más de 40 funciones de renderizado, se debe implementar una **estrategia híbrida universal**:
1. **Regla CSS de Desenfoque Semántico Global:**
   Aplicar `filter: blur(5px); user-select: none;` a todos los contenedores semánticos de importes cuando `html.privacy-mode` esté presente:
   ```css
   html.privacy-mode .scard-value,
   html.privacy-mode .dt-scard-value,
   html.privacy-mode .tx-amount,
   html.privacy-mode .cat-amount-text,
   html.privacy-mode .cat-sub-text,
   html.privacy-mode .budget-badge,
   html.privacy-mode .btb-value,
   html.privacy-mode .pat-total-value,
   html.privacy-mode .pat-acc-theoretical,
   html.privacy-mode .pat-acc-calc,
   html.privacy-mode .pat-hist-line1 span,
   html.privacy-mode .pat-hist-line2 span,
   html.privacy-mode .compare-val,
   html.privacy-mode .compare-diff,
   html.privacy-mode .stat-val,
   html.privacy-mode .portfolio-card strong,
   html.privacy-mode .invest-stats strong,
   html.privacy-mode .position-value strong,
   html.privacy-mode #balanceAdjustmentNote,
   html.privacy-mode #uncomputedExpensesNote,
   html.privacy-mode #dtBalanceAdjustmentNote,
   html.privacy-mode #dtUncomputedExpensesNote {
     filter: blur(5.5px);
     transition: filter 0.2s cubic-bezier(0.2, 0.9, 0.4, 1);
   }
   ```
2. **Restauración de Gráficos e Interactividad:**
   Retirar inmediatamente `#lineChartCanvas` y `#barChartCanvas` de `html.privacy-mode`. Para ocultar valores en gráficos sin destruir los ejes ni las curvas:
   - Ofuscar los valores numéricos de las leyendas (`.chart-legend`, `.chart-card-title`).
   - En los tooltips interactivos (`chartTipRow`), mantener `fmtPrivacy(val)` para que al interactuar con hover o toque táctil, las proporciones se aprecien pero los importes exactos muestren `••••••`.

---

### DOMINIO 2: Privacidad de Cartera & Enmascaramiento de Cuentas de Inversión

#### 2.1 Desconexión entre Indicadores de Privacidad
En el código actual conviven dos sistemas aislados:
```javascript
// Sistema 1: Modo Privado Global
function isPrivacyMode(){
  try{ return localStorage.getItem('ft_privacy_mode') === 'true'; }catch(e){ return false; }
}

// Sistema 2: Privacidad de Inversión / Cartera
function investmentPrefsKey(name){ return 'ft_invest_' + name + '_' + (currentUser ? currentUser.id : 'guest'); }
function portfolioValueHidden(){
  try{ return localStorage.getItem(investmentPrefsKey('portfolio_hidden')) === '1'; }catch(e){ return false; }
}
```

**Problema Estructural:**
- `portfolioValueHidden()` se almacena con clave específica por usuario (`ft_invest_portfolio_hidden_<uid>`).
- `ft_privacy_mode` es una clave global sin prefijo de usuario en `localStorage`.
- Cuando un usuario activa el Modo Privado en la tarjeta de Balance (o con la tecla `P` en escritorio), `isPrivacyMode()` pasa a `true`, pero `portfolioValueHidden()` permanece en `false`.
- **Efecto observable:** El usuario cree estar en modo privado protegido, pero al navegar a la pestaña **Inversión**, se despliegan su cartera completa, saldo invertido, rentabilidades acumuladas, posiciones y costes unitarios.
- Del mismo modo, en la pestaña **Cuentas**:
  ```javascript
  // index.html:5370
  var totalPat=accounts.reduce(function(sum,a){
    return sum+((portfolioValueHidden()&&a.is_investment)?0:accountCalcBalance(a.id,yr,mo));
  },0);
  // index.html:5373
  var isPrivateInvestmentBalance=!!a.is_investment&&portfolioValueHidden();
  ```
  Al no evaluar `isPrivacyMode()`, la cuenta de inversión **no se excluye del total ni se enmascara su saldo** a menos que el usuario haya ido previamente a la pestaña Inversión y pulsado el icono del ojo.

#### 2.2 Fugas por Canales Laterales (Side-Channel Leaks)
1. **Deducción Aritmética del Saldo de Inversión en Cuentas:**  
   Cuando `portfolioValueHidden() === true`, la cuenta de inversión muestra `••••••` y se excluye de `totalPat`. Sin embargo, `totalPat` muestra la suma en claro de las cuentas no inversoras. Si el usuario conoce o consulta su saldo bancario total previo, la diferencia revela de forma trivial el capital exacto de la cuenta de inversión.
2. **Filtro de Cuentas en Búsqueda de Movimientos:**  
   En el selector `#filterAccount` (línea 4880), la cuenta de inversión aparece en el listado desplegable. Al seleccionarla, se listan todas las transferencias de aportación y retirada. Aunque `buildTxItem` enmascara el importe con `••••••`, se revelan las fechas exactas, número de operaciones, frecuencia y cuentas bancarias de origen/destino.
3. **Fuga en Modal de Edición de Operaciones de Inversión (`openInvestmentOperationEdit`):**  
   Línea 6689:
   ```javascript
   function openInvestmentOperationEdit(id){
     if(portfolioValueHidden()){
       showUndoToast('Desactiva el modo privado para ver o editar operaciones de inversión');
       return;
     }
     ...
   ```
   Comprueba `portfolioValueHidden()`, pero **no comprueba `isPrivacyMode()`**. Si el usuario tiene activo el Modo Privado global pero no el de cartera, al tocar una fila de operación se abre el modal con el precio por participación (`price.value = o.unit_price`), número de participaciones (`amount.value = o.amount`) y cuenta de cargo en claro.

---

### DOMINIO 3: Seguridad Criptográfica, Web Crypto AES-GCM & Memoria

#### 3.1 Evaluación del Esquema de Cifrado en IndexedDB
El motor de almacenamiento cifrado local implementado en las líneas 3690-3796 utiliza la API estándar Web Cryptography:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ARQUITECTURA WEB CRYPTO LOCAL CACHE                  │
├────────────────────────────────────────────────────────────────────────┤
│ Algoritmo:        AES-GCM (Galois/Counter Mode)                        │
│ Longitud clave:   256 bits (32 bytes)                                  │
│ Vector inic. (IV): 96 bits (12 bytes) criptográficamente seguro        │
│ Exportabilidad:   extractable: false (no exportable en JS)             │
│ Almacén clave:    IndexedDB ('keys' object store, key: 'device-key')   │
│ Almacén payload:  IndexedDB ('payloads' object store, key: userId)     │
│ Envelope v2:      { version: 2, iv: Uint8Array, data: ArrayBuffer }   │
│ Fallback v1:      localStorage['ft_secure_cache_<uid>'] (Base64)      │
└────────────────────────────────────────────────────────────────────────┘
```

**Puntos Fuertes Identificados:**
1. **Algoritmo Seguro:** AES-GCM proporciona confidencialidad y autenticación de integridad (AEAD), protegiendo contra modificaciones silenciosas del payload.
2. **IV Único por Escritura:** Se genera un nuevo IV de 12 bytes en cada llamada a `saveSecureLocalCache` mediante `crypto.getRandomValues(new Uint8Array(12))` (línea 3726). Esto evita la catastrófica reutilización de IV en AES-GCM.
3. **Clave No Exportable:** Al crearse con `extractable: false` (línea 3710), ningún script o extensión de navegador puede invocar `crypto.subtle.exportKey('raw', key)` para extraer la clave simétrica.
4. **Almacenamiento Estructurado:** IndexedDB soporta el guardado directo de instancias `CryptoKey` y `ArrayBuffer` sin serializaciones intermedias en texto plano.

**Vulnerabilidades y Debilidades Identificadas:**
1. **Clave Compartida a Nivel de Dispositivo (`device-key`):**  
   Líneas 3705 y 3712:
   ```javascript
   var r = db.transaction('keys','readonly').objectStore('keys').get('device-key');
   ...
   var key = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
   await new Promise(function(resolve,reject){
     var r = db.transaction('keys','readwrite').objectStore('keys').put(key, 'device-key');
   ```
   La clave se almacena bajo el literal fijo `'device-key'`. No está derivada de la contraseña del usuario (mediante PBKDF2 o Argon2) ni vinculada al `userId`. Si dos usuarios distintos inician sesión en el mismo navegador, ambos datos se cifran con la misma clave de dispositivo. Aunque los payloads están separados por `userId`, cualquier script con acceso al origen puede invocar `readSecureLocalCache(targetUserId)` y descifrar el payload ajeno sin requerir autenticación adicional.
2. **Riesgo de Caché Legada no Cifrada:**  
   Líneas 3786-3795: La función `readSecureLocalCache` conserva un fallback a `localStorage.getItem('ft_cache_' + uid)`. Si existiese un residuo antiguo no cifrado en un dispositivo compartido, se parsea y se promociona a caché segura, manteniendo viva información previa sin validar su origen.

#### 3.2 Auditoría del Cierre de Sesión (`signOut`) y Limpieza de Memoria
Inspección de `signOut()` (líneas 6814-6834):
```javascript
async function signOut(){
  var uid = currentUser ? currentUser.id : '';
  var cKey='ft_cache_'+uid;
  if(offlineQueue.length&&!isOffline){await processOfflineQueue();}
  if(offlineQueue.length&&!confirm('Hay '+offlineQueue.length+' cambio(s) pendientes...'))return;
  if(uid){
    localStorage.removeItem(cKey);
    localStorage.removeItem(secureCacheStorageKey(uid));
    localStorage.removeItem('ft_queue_'+uid);
    localStorage.removeItem('ft_sync_issues_'+uid);
    localStorage.removeItem('ft_uistate_'+uid);
    try{clearSecureCacheIndexedDB(uid);}catch(e){}
    secureCacheKeyPromise=null;
  }
  if(ftRealtimeChannel&&sb.removeChannel){try{sb.removeChannel(ftRealtimeChannel);}catch(e){}ftRealtimeChannel=null;}
  clearTimeout(ftRealtimeTimer);clearBalanceCache();_quoteCache={};
  transactions=[];categories=[];accounts=[];patrimony=[];budgets=[];recurrenceExclusions=[];transactionVoids=[];offlineQueue=[];investmentOperations=[];_monthTxCache={};_yearTxCache={};if(typeof invalidateTxIndices==='function')invalidateTxIndices();txVersion++;
  try{await sb.auth.signOut();}catch(e){}
  showAuth();
}
```

**Análisis de Residuos y Fugas:**
1. **Claves de Usuario No Eliminadas en `localStorage`:**
   - `ft_invest_recent_assets_<uid>`: Conserva los tres últimos activos explorados (nombre, símbolo y tipo de producto).
   - `ft_invest_portfolio_hidden_<uid>`: Conserva la preferencia de privacidad de inversiones.
   - `ft_default_account_<uid>`: Conserva el identificador de la cuenta principal del usuario.
   - `ft_cat_exclusions_<uid>` y `ft_cat_exclusions`: Conserva el mapa de categorías excluidas de gastos.
   - `ft_cat_icons_<uid>` y `ft_cat_icons`: Conserva personalizaciones de iconos de categorías.
   - `ft_last_sync_<uid>` y `ft_last_backup_<uid>`: Conservan marcas de tiempo de sincronización y copias.
2. **Variables Globales en Memoria No Reseteadas:**
   - `searchQuery` (línea 2608): Si el usuario filtró por un concepto confidencial (ej. "médico especialista", "abogado"), la variable global `searchQuery` no se reinicia a `''`. Si otro usuario inicia sesión en la misma pestaña sin recargar la página, la búsqueda previa permanece activa en memoria.
   - `filterAccount`, `filterCat`, `filterType`, `filterDateFrom`, `filterDateTo`: Conservan los filtros del usuario anterior.
   - `assetDetailState`: Conserva los datos del último producto financiero abierto.
   - `_historyCache`: Objeto global de saldos históricos que no se limpia en `signOut()`.
3. **Desincronización Asíncrona de `currentUser`:**  
   `signOut()` no asigna `currentUser = null;` inmediatamente, sino que delega la limpieza al callback `onAuthStateChange` (línea 9862). Si la llamada a `sb.auth.signOut()` sufre latencia o falla por pérdida repentina de red, la referencia al usuario permanece activa en el contexto global de JavaScript.

---

### DOMINIO 4: Sanitización de Entradas, Ataques XSS & Superficie de Inyección

#### 4.1 Evaluación de Primitivas Sanitizadoras
`index.html` define las siguientes funciones de seguridad:
- `htmlEscape(s)` (línea 2677): Reemplaza `&`, `<`, `>`, `"`, `'`, `` ` `` por sus entidades HTML correspondientes (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&#96;`). Es sólida y cubre los delimitadores estándar de atributos y contextos de texto.
- `capEsc(s)` (línea 2702): Capitaliza y escapa mediante `htmlEscape`.
- `hlText(value, query)` (línea 2685): Divide el texto según las coincidencias de búsqueda insensible a tildes y escapa individualmente los fragmentos antes de envolverlos en `<mark class="tx-search-hit">`.

#### 4.2 Vulnerabilidades Identificadas

##### V1: Denegación de Servicio por Expresión Regular (ReDoS / Bucle Infinito en `hlText`) — Severidad: ALTA
En las líneas 2678-2696:
```javascript
function makeDiacriticRegex(str){
  var map={'a':'[aáàäâã]','e':'[eéèëê]','i':'[iíìïî]','o':'[oóòöôõ]','u':'[uúùüû]','c':'[cç]','n':'[nñ]'};
  var s=normStr(str).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  var pattern=s.split('').map(function(ch){return map[ch]||ch;}).join('');
  return new RegExp(pattern,'gi');
}
function hlText(value,query){
  var s=String(value||'');
  var q=String(query||'').trim();
  if(!q||!s)return htmlEscape(s);
  var regex;
  try{regex=makeDiacriticRegex(q);}catch(e){return htmlEscape(s);}
  var parts=[],lastIdx=0,match;
  while((match=regex.exec(s))!==null){
    if(match.index>lastIdx)parts.push(htmlEscape(s.slice(lastIdx,match.index)));
    parts.push('<mark class="tx-search-hit">'+htmlEscape(match[0])+'</mark>');
    lastIdx=regex.lastIndex;
    if(!regex.global)break;
  }
  ...
```

**Mecánica de la Falla:**
`normStr(str)` normaliza a NFD y elimina los diacríticos combinados:
`String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();`
Si el usuario introduce en la caja de búsqueda un carácter diacrítico puro o acento aislado (por ejemplo, el carácter `´` `\u0301` o combinaciones similares), `q` no está vacío (`q.trim()` tiene longitud > 0), pero `normStr(q)` devuelve `""` (longitud 0).
Por tanto, `pattern` es `""`, y se genera la expresión regular `new RegExp("", "gi")`.
Al ejecutarse `regex.exec(s)`, la expresión regular vacía coincide en el índice 0 con `match[0] === ""`.
En expresiones regulares vacías en JavaScript, `regex.lastIndex` **no avanza automáticamente** tras una coincidencia de longitud cero.
Como resultado, la condición `while ((match = regex.exec(s)) !== null)` se ejecuta de forma infinita, congelando el hilo principal del navegador (`100% CPU lockup`) y provocando el bloqueo irreversible de la PWA.

**Remediación Necesaria:**
Verificar que la expresión regular tenga longitud efectiva y forzar el avance de `lastIndex`:
```javascript
if(!pattern) return htmlEscape(s);
...
while((match=regex.exec(s))!==null){
  ...
  if(match.index === regex.lastIndex){
    regex.lastIndex++;
  }
}
```

##### V2: Inyección de Atributos en Invocaciones `onclick` con `t.id` — Severidad: MEDIA
En `buildTxItem` (líneas 5021 y 5042) y `renderHeatmapDetail` (línea 4576):
```javascript
+'<div class="tx-item" onclick="if(!event.target.closest(\'.tx-btn\'))editTx(\''+t.id+'\')">'
...
+'<div class="hm-det-row hm-det-row-btn" onclick="hmEditTx(\''+t.id+'\')">'
```
El identificador `t.id` se concatena directamente dentro de una cadena de evento inline `onclick="...('...')"` sin pasar por `htmlEscape()`.
Aunque las transacciones generadas en la aplicación usan `Date.now() + Math.random().toString(36)`, en el caso de **transacciones procedentes de la base de datos Supabase o importadas desde un archivo JSON externo**, un identificador manipulado que contenga comillas simples (ej. `tx123');alert(document.domain);//`) rompería la sintaxis de JavaScript y permitiría la ejecución de código arbitrario al pulsar en la fila.
**Remediación:** Utilizar delegación de eventos con atributos de datos (`data-id="${htmlEscape(t.id)}"`) en lugar de atributos `onclick` embebidos con cadenas concatenadas.

##### V3: Inyección de Estilos CSS mediante Atributo `color` — Severidad: BAJA
En la línea 5043:
```javascript
+'<div style="width:34px;height:34px;border-radius:12px;background:'+c.color+'22;display:flex;...">'
```
Y en la línea 3062 (`catIconSvg`):
```javascript
'<svg ... stroke="'+((c&&c.color)||'currentColor')+'" ...>'
```
Si el color de una categoría o cuenta cargada desde JSON o base de datos no se valida estrictamente contra una expresión regular de color hexadecimal (`^#[0-9a-fA-F]{6}$`), un valor malicioso como `red;" onfocus="alert(1)` podría inyectar atributos en la etiqueta SVG o HTML.

##### V4: Ausencia de Content Security Policy (CSP) — Severidad: ALTA (Defensa en Profundidad)
En el `<head>` de `index.html` (líneas 1-15) no existe ninguna directiva `<meta http-equiv="Content-Security-Policy" content="...">`.
Dado que GitHub Pages sirve el contenido estático sin cabeceras HTTP personalizadas de servidor, la falta de una meta-etiqueta CSP deja a la aplicación sin una red de seguridad contra inyecciones XSS, permitiendo la ejecución irrestricta de scripts en línea, conexiones a dominios arbitrarios y potenciales exfiltraciones de tokens de sesión.

---

### DOMINIO 5: Gestión de Sesión, Claves Supabase & Fuga de Secretos

#### 5.1 Verificación de Claves del Cliente en `index.html`
Líneas 2593-2595:
```javascript
var SB_URL='https://sswktibdpxqrumsqsegi.supabase.co';
var SB_KEY='sb_publishable_A4Lahtw5TjoD3hajMJITfw_o-p2zgH_';
var sb=window.supabase.createClient(SB_URL,SB_KEY);
```
- **Tipo de Clave:** `SB_KEY` es una clave **publishable / anónima** legítima de Supabase. Este tipo de clave está diseñada explícitamente para ser pública y reside sujeta a las políticas de seguridad Row Level Security (RLS) en PostgreSQL.
- **Auditoría de Secretos:** Se ejecutaron búsquedas automatizadas en todo el árbol del repositorio en busca de cadenas sensibles (`service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `TWELVE_DATA_API_KEY`, `RESEND_API_KEY`, tokens JWT con prefijo `eyJ`).
  - **Resultado:** **CERO fugas de claves de servicio o secretos de API en el frontend (`index.html`, `serviceworker.js`).**

#### 5.2 Aislamiento de Secretos en Edge Functions
1. **`market-data/index.ts`:**
   - Consume `Deno.env.get("TWELVE_DATA_API_KEY")`. La clave nunca se transmite al cliente; la Edge Function actúa como proxy autenticado.
   - Aplica validación estricta de sesión: `const { data: { user }, error: authError } = await supabase.auth.getUser(token);` (línea 134). Peticiones anónimas o sin JWT válido reciben HTTP 401.
2. **`monthly-report/index.ts`:**
   - Consume `Deno.env.get("RESEND_API_KEY")`. La clave se utiliza únicamente para despachar el correo a la API de Resend y nunca se expone en la respuesta JSON.
   - Control de autorización dual: Permite acceso interactivo del usuario autenticado vía JWT Bearer o ejecución programada vía Cron validando el hash SHA-256 de `x-backup-cron-token` contra la tabla interna `backup_scheduler_secret`.
3. **`automatic-backup/index.ts`:**
   - Utiliza `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en el entorno seguro de Deno para realizar el snapshot atómico de tablas y volcarlo en el bucket privado `fintrack-backups`.
   - El almacenamiento en Supabase Storage está segregado por carpeta de usuario (`userId + "/"`) y los permisos RLS del bucket impiden lecturas cruzadas entre usuarios.

---

## 3. Matriz de Priorización: Impacto vs. Esfuerzo

La siguiente matriz clasifica las recomendaciones técnicas derivadas de esta auditoría, ponderando la mitigación del riesgo frente al esfuerzo de implementación en el entorno estático y monolítico de `fintrack`:

| ID | Hallazgo / Medida Propuesta | Dominio | Nivel de Riesgo | Impacto | Esfuerzo | Fase Recomendada |
|---|---|---|---|---|---|---|
| **REC-01** | **Desenfoque Semántico Global en CSS para Modo Privado**: Crear la regla universal `html.privacy-mode` que difumine importes en todas las pestañas (Categorías, Cuentas, Análisis, Inicio) y restaurar lienzos `#lineChartCanvas` y `#barChartCanvas` intactos. | Privacidad UI | **Crítico** | **Alto** | **Bajo** | Fase 1 (Inmediata) |
| **REC-02** | **Protección contra Bucle Infinito en `hlText`**: Añadir guarda de longitud efectiva en `makeDiacriticRegex` y avance forzado de `regex.lastIndex` ante coincidencias vacías para evitar freeze de la PWA. | Seguridad / DoS | **Alto** | **Alto** | **Bajo** | Fase 1 (Inmediata) |
| **REC-03** | **Unificación de Modo Privado e Inversiones**: Hacer que `isPrivacyMode() === true` fuerce automáticamente la activación lógica de `portfolioValueHidden()`, ocultando valores de inversión y excluyendo cuentas en Cuentas. | Privacidad UI | **Alto** | **Alto** | **Bajo** | Fase 1 (Inmediata) |
| **REC-04** | **Limpieza Integral en Cierre de Sesión (`signOut`)**: Purgar las claves residuales de `localStorage` (`ft_invest_recent_assets_`, `ft_default_account_`, etc.) y resetear variables de memoria (`searchQuery`, `filterAccount`, etc.). | Seguridad Datos | **Medio** | **Medio** | **Bajo** | Fase 2 (Próxima) |
| **REC-05** | **Eliminación de Fugas Numéricas en Modales y Notas**: Enmascarar `#balanceAdjustmentNote`, `#uncomputedExpensesNote` y verificar `isPrivacyMode()` al abrir `editTx` y `openAdjustModal`. | Privacidad UI | **Medio** | **Medio** | **Bajo** | Fase 2 (Próxima) |
| **REC-06** | **Implementación de Content Security Policy (CSP)**: Incorporar meta-etiqueta CSP restrictiva en `<head>` de `index.html` limitando script-src y connect-src a orígenes aprobados (`self`, `supabase.co`, `fonts.googleapis.com`, `fonts.gstatic.com`, `assets.parqet.com`, `t2.gstatic.com`). | Seguridad XSS | **Medio** | **Alto** | **Medio** | Fase 2 (Próxima) |
| **REC-07** | **Erradicación de Atributos Inline `onclick` con IDs Dinámicos**: Migrar invocaciones `editTx(t.id)` en `buildTxItem` hacia delegación por eventos mediante `data-action="edit-tx"` y `data-id="${htmlEscape(t.id)}"`. | Seguridad XSS | **Bajo** | **Medio** | **Medio** | Fase 3 (Mejora) |
| **REC-08** | **Aislamiento Multi-Usuario en IndexedDB**: Derivar la clave criptográfica de la sesión o vincular el identificador en almacén de claves a `'key_' + uid` en lugar del literal genérico `'device-key'`. | Criptografía | **Bajo** | **Bajo** | **Medio** | Fase 3 (Mejora) |

---

## 4. Análisis de Riesgos de Regresión y Pasos de Verificación

Cualquier cambio futuro en los módulos de privacidad y seguridad debe considerar rigurosamente los siguientes riesgos de regresión antes de su despliegue:

### 4.1 Riesgos de Regresión Identificados
1. **Regresión en Animaciones de Gráficos (Canvas):**  
   Al retirar el desenfoque de los `<canvas>`, se debe verificar que la función `drawDonut`, `drawBarChart` y `drawLineChart` no reintroduzca parpadeos ni redibujados innecesarios al alternar el modo privado (`togglePrivacyMode()`).
2. **Riesgo de Ruptura en Búsqueda y Filtrado:**  
   Al modificar `hlText` para evitar el bucle infinito, debe comprobarse que el resaltado de coincidencias con tildes (ej. buscar "café" resaltando "cafe" o "CAFÉ") continúe funcionando exactamente igual.
3. **Persistencia de UI y Estado Offline:**  
   Al ampliar la limpieza de `localStorage` en `signOut()`, no se deben borrar configuraciones globales como el tema visual (`ft_theme`) o el tamaño de interfaz si el usuario desea conservarlos entre inicios de sesión.
4. **Compatibilidad con Safari iOS:**  
   La propiedad `filter: blur(...)` en elementos con `backdrop-filter` en iOS puede ocasionar artefactos gráficos si no se acompaña de `-webkit-filter: blur(...)` y aceleración por hardware (`transform: translateZ(0)`).

### 4.2 Protocolo de Verificación Independiente
Para verificar de forma autónoma el cumplimiento de las recomendaciones:
1. **Validación Sintáctica Obligatoria:**  
   Ejecutar `node scripts/validate-syntax.js` para asegurar que ningún bloque `<script>` embebido contenga errores de sintaxis.
2. **Verificación de Modo Privado en Navegador:**  
   - Abrir la aplicación con sesión iniciada.
   - Activar el Modo Privado tocando la tarjeta de Balance (o pulsando la tecla `P` en desktop).
   - Navegar por las 5 pestañas:
     - **Inicio:** Verificar que tarjetas KPI, Donut central y notas de balance estén difuminadas, pero el anillo del Donut sea 100% nítido y legible.
     - **Categorías:** Verificar que los importes `.cat-amount-text` y los badges `.budget-badge` estén difuminados.
     - **Cuentas:** Verificar que la tarjeta de Patrimonio Total `.pat-total-value` y los saldos de cada cuenta bancaria estén difuminados.
     - **Análisis:** Verificar que las comparativas y las 9 tarjetas de estadísticas estén difuminadas, pero las barras y líneas de los gráficos se vean perfectamente definidas e interactivas.
     - **Inversión:** Verificar que el valor de cartera y las posiciones estén enmascarados con `••••••`.
3. **Prueba de Resistencia ReDoS en Búsqueda:**  
   - Introducir en el campo de búsqueda de transacciones caracteres acentuados aislados (`´`, `` ` ``, `~`, `¨`).
   - Comprobar que la lista responda de inmediato sin congelar la interfaz ni saturar la CPU.
4. **Verificación de Limpieza en Logout:**  
   - En la consola de herramientas de desarrollo (`DevTools`), ejecutar `Object.keys(localStorage)`.
   - Pulsar "Cerrar sesión" en Ajustes.
   - Volver a ejecutar `Object.keys(localStorage)` y comprobar que no quede ninguna clave con prefijo `ft_..._<uid>`.
   - Inspeccionar IndexedDB `fintrack-cache` y validar que el almacén `payloads` no contenga el registro del usuario saliente.

---

## 5. Conclusión de la Auditoría

La arquitectura base de seguridad de `fintrack` demuestra una ingeniería reflexiva: ausencia absoluta de credenciales privilegiadas en el frontend, uso moderno de Web Crypto AES-GCM con claves no exportables, validación estricta de JWT en Edge Functions y sanitización básica contra inyecciones HTML.

No obstante, **el Modo Privado presentaba una desconexión crítica con los invariantes del proyecto**, difuminando erróneamente los lienzos gráficos en lugar de dejarlos visibles, mientras dejaba expuestas en texto claro la gran mayoría de las cifras financieras en Categorías, Cuentas y Estadísticas Anuales. Asimismo, se detectó un vector de bloqueo por bucle infinito en el motor de resaltado de búsqueda (`hlText`).

La remediación de estos hallazgos es de bajo esfuerzo y altísimo impacto, garantizando una protección integral de la privacidad financiera del usuario frente a miradas indiscretas y blindando la resiliencia del cliente.
