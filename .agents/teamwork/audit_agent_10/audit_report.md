# Informe Exhaustivo de Auditoría: Calidad de Código, Deuda Técnica y Modularidad (Agente 10)

> **Documento:** Auditoría Técnica de Arquitectura Frontend, Deuda Técnica y Modularidad  
> **Proyecto:** fintrack PWA  
> **Área:** Agente 10 — Estructura Monolítica, Namespace Global, Código Muerto/Duplicado, Estado y Fragilidad de Scripts  
> **Fecha:** 14 de Noviembre de 2026  
> **Restricción Operativa:** Hard constraint de solo lectura — Ningún archivo de código fuente ha sido modificado.

---

## 1. Resumen Ejecutivo

La aplicación `fintrack` está implementada como una Single Page Application (SPA) estática sin empaquetadores (*zero-bundler*) ni frameworks (*vanilla JavaScript*). Si bien esta arquitectura ofrece un despliegue directo sin pasos de compilación en GitHub Pages, la implementación actual en `index.html` ha alcanzado un nivel crítico de acoplamiento y deuda técnica que pone en riesgo la estabilidad del proyecto:

1. **Monolito de Extrema Fragilidad**: `index.html` comprende **9.879 líneas** (~603 KB), de las cuales **7.287 líneas consecutivas** (líneas 2590 a 9877, con 442.393 caracteres) residen en un único bloque `<script>` inline. Un único error sintáctico o carácter no escapado en este bloque colapsa el 100% de la aplicación, dejando una pantalla en blanco o congelada tras el `loadingOverlay`.
2. **Polución Extrema del Namespace Global**: Se han inventariado **125 variables globales** (`var`) declaradas al nivel raíz del script y **387 funciones declaradas en el ámbito global**, inyectando más de **512 identificadores no encapsulados en el objeto `window`**. No existe la directiva `"use strict"`, permitiendo asignaciones accidentales implícitas a `window`.
3. **Catálogo de Código Muerto y Huérfano**: Se identificaron con precisión **16 funciones completamente inactivas** (0 llamadas en todo el código HTML/JS), **7 variables globales sin uso**, y subsistemas enteros desconectados (el sistema completo de bloqueo biométrico WebAuthn/PIN de ~80 líneas y el programador de backups automáticos), varios de los cuales provienen de decisiones expresamente descartadas por el usuario en el historial del proyecto.
4. **Violación de Decisiones Vinculantes del Usuario**: El archivo `index.html` (líneas 9597–9605) continúa interceptando atajos de teclado globales en escritorio ('n', 'p', '/'), contradiciendo de manera directa la decisión descartada y vinculante registrada el 2026-09-08 en el §12 de `PROJECT_CONTEXT.md`.
5. **Inconsistencia y Fuga de Estado**: No existe un objeto unificado `appState`. El estado se fragmenta entre más de 30 variables sueltas y múltiples capas de caché (`_monthTxCache`, `_yearTxCache`, `_rbCache`, `_historyCache`, `_quoteCache`, `_catIconsCache`). Al cerrar sesión (`signOut` o `onAuthStateChange`), **varias cachés críticas no se purgan**, permitiendo fugas de datos entre sesiones de distintos usuarios sin recarga completa de página. Además, operaciones como `deleteTx()` y `restoreTx()` omiten la invalidación de índices y cachés de balance, provocando estados desincronizados en la interfaz.
6. **Duplicación Sistemática entre Móvil y Escritorio**: Rutinas de renderizado completas como `renderDonut` (líneas 4337–4400) y `dtRenderDonut` (líneas 9490–9550) están duplicadas casi línea por línea, con divergencias funcionales (por ejemplo, el móvil respeta `_chartWasDragged` para evitar giros involuntarios mientras que escritorio carece de dicha guarda).

---

## 2. Auditoría de la Estructura Monolítica de JavaScript (`index.html`)

### 2.1 Desglose Físico de Scripts en `index.html`

| Bloque | Líneas | Tipo | Propósito | Responsabilidad |
|---|---|---|---|---|
| **#0 (Head)** | 15 | Externo | `<script src="./supabase-js.min.js"></script>` | Cliente oficial de Supabase para navegador |
| **#1 (Head)** | 2097 | Inline (IIFE) | `localStorage.getItem('ft_theme')` | Script anti-flash para aplicar tema claro/oscuro antes del primer render |
| **#2 (Head)** | 2105–2109 | Inline | `['gesturestart', ...]` y `touchmove` | Supresión de zoom accidental por pellizco en dispositivos táctiles |
| **#3 (Head)** | 2110–2122 | Inline | `navigator.serviceWorker.register` | Registro y ciclo de vida de `serviceworker.js` |
| **#4 (Body)** | 2590–9877 | Inline | **Lógica Monolítica Principal (7.287 líneas)** | **Toda la aplicación:** Auth, Supabase CRUD, matemáticas financieras, cálculo de desfases, gráficos Canvas Retina, modales, PWA sync, exportación PDF/Excel, layout responsive |

### 2.2 Problemas de Organización y Acoplamiento

1. **Hipercentralización de Responsabilidades Dispares**:
   El bloque #4 (líneas 2590–9877) contiene 14 dominios funcionales no segregados:
   - Configuración y clientes de red (líneas 2591–2655)
   - Sanitización y utilidades diacríticas (líneas 2674–2701)
   - Motor de recurrencias y series temporales (líneas 3064–3150)
   - Motor offline, cola de sincronización y resolución de incidencias (líneas 3214–3360)
   - Autenticación, sesión, bloqueo PIN/biometría y watchdog (líneas 3369–3675)
   - Carga de datos y reconciliación de esquemas (líneas 3676–4045)
   - Sistema de gráficos Canvas propios (Donut líquido, Heatmap, Sparklines) (líneas 4242–4539)
   - Controladores de pestañas móviles (Inicio, Transacciones, Categorías, Cuentas, Anual/Evolución, Ajustes) (líneas 4836–6400)
   - Módulo de inversiones y cotizaciones en vivo (líneas 6401–6620)
   - Modal de transacción y cálculo contable tri-estado (líneas 6882–7397)
   - Sistema de exportación masiva: JSON, Excel (ExcelJS) y PDF editorial White Edition (jsPDF) (líneas 7621–9329)
   - Layout y renderizado alternativo de escritorio (`dtRender`, `dtLayout`) (líneas 9330–9568)
   - Gestores globales de modales, focus trap y atajos de teclado (líneas 9569–9708)
   - Gesto táctil nativo Pull-to-Refresh y Watchdog final (líneas 9709–9876)

2. **Carga Inconsistente de Librerías de Terceros (`vendor/`)**:
   Las librerías pesadas se encuentran en la carpeta `vendor/`, pero su mecanismo de carga es anárquico:
   - En exportación de Ajustes (línea 7704): `if(typeof window.jspdf==='undefined') await loadScript('./vendor/jspdf.umd.min.js');` (carga perezosa controlada).
   - En exportación anual PDF (línea 8178): `try { await loadScript('./vendor/jspdf.umd.min.js'); } catch(e){ ... }` (carga perezosa con try/catch).
   - En exportación mensual PDF (línea 8343): `if (typeof window.jspdf === 'undefined') { alert('Librería PDF no cargada, inténtalo en unos segundos.'); return; }` (**Falla**: no dispara `loadScript`, obligando al usuario a esperar o fallar si no había entrado antes a otra exportación).
   - En exportación Excel (línea 7707): `if(fmt==='xlsx'&&typeof ExcelJS==='undefined') await loadScript('./vendor/exceljs.min.js');`.
   - En exportación Excel directa (línea 9035): `if(typeof ExcelJS==='undefined'){alert('Librería no cargada...');return;}` (**Falla**: no dispara `loadScript`).

---

## 3. Auditoría del Namespace Global y Variables (`window.*`)

### 3.1 Inventario de Variables Globales (125 Variables `var` Raíz)

A continuación se categorizan las 125 variables declaradas a nivel de raíz dentro del script principal (líneas 2590–9877) que terminan exponiéndose directamente en `window`:

#### A. Configuración y Clientes de Servicio (líneas 2591–2600)
- `APP_VERSION`, `APP_PUBLISHED_AT`, `SB_URL`, `SB_KEY`, `sb`, `PALETTE`, `MONTHS`, `MONTHS_S`, `ACCENT_COLORS`

#### B. Colecciones Principales de Estado de Datos (líneas 2600–2610)
- `currentUser`, `transactions`, `categories`, `accounts`, `patrimony`, `budgets`, `recurrenceExclusions`, `transactionVoids`, `investmentOperations`, `offlineQueue`, `syncState`, `isOffline`

#### C. Controladores de Vista y Pavegación (líneas 2601–2609)
- `viewYear`, `viewMonth`, `activeTab`, `txType`, `editingTxId`, `assetDetailState`, `activeCatId`, `chartYear`, `authMode`, `txTags`, `isRecurring`, `TX_PAGE_SIZE`, `txLimit`, `txLimitSig`, `filtersOpen`, `homeAnnualMode`

#### D. Parámetros de Filtro y Búsqueda (línea 2608)
- `searchQuery`, `filterType`, `filterCat`, `filterAccount`, `sortOrder`, `filterDateFrom`, `filterDateTo`, `searchScope`

#### E. Timers, Cachés Internas y Firmas de Renderizado (líneas 2601–4086)
- `_donutSig`, `_barSig`, `_lineSig`, `_lastRemoteSyncTs`, `_lastMarkTap`, `_quoteCache`, `_catExclusionsCache`, `_catIconsCache`, `_historyCache`, `_rbCache`, `_monthTxCache`, `_yearTxCache`, `_txIndexVersion`, `_txIndexLength`, `_txByAccount`, `_txByMonthStr`, `_txByYearStr`

#### F. Estado de Sincronización, Concurrencia y Bloqueo (líneas 3214–3679)
- `isProcessingOfflineQueue`, `offlineQueuePromise`, `ftRealtimeChannel`, `ftRealtimeTimer`, `PIN_RELOCK_MS`, `pinBuf`, `pinMode`, `pinTemp`, `lastHiddenAt`, `LOAD_MIN_MS`, `LOAD_REMOTE_TIMEOUT_MS`, `loadStartTs`, `_numbersAnimated`, `loadDataInFlight`, `loadDataPromise`, `loadGeneration`, `secureCacheKeyPromise`, `secureCacheDbPromise`, `txVersion`, `_saveCacheTimer`

#### G. Variables de Interacción y Gestos (líneas 4315–5054)
- `_lastDonutExps`, `_lastDonutEntries`, `_fitCenterCanvas`, `_fitGen`, `_centerValues`, `_chartDragStart`, `_chartWasDragged`, `catEditMode`, `HM_MOBILE`, `HM_DESKTOP`, `hmSelDay`, `_lastHmExps`, `_lastHmByDay`, `txSwipe`, `_txSearchTimer`, `catDrag`

#### H. Modales, Observadores e Inversiones (líneas 5644–7675)
- `_activeAdjustAccId`, `_activeBudgetCatId`, `_chartTipHideTimer`, `ASSET_LOGO_DOMAINS`, `investmentLogoObserver`, `assetPeriodObserver`, `assetHistoryCache`, `txCalcMode`, `isExcludeFromCalc`, `_pickerYear`, `lastModalTrigger`, `isSaving`, `pendingRecurringDeleteId`, `undoToastTimer`, `_scriptCache`, `_catIconPdfCache`

#### I. Estado Específico de Escritorio (Desktop) (líneas 9332–9848)
- `IS_DESKTOP`, `dtDonutChart`, `dtActiveCat`, `_lastAppWidth`, `inPasswordRecovery`

### 3.2 Asignaciones Explícitas a `window.*`

Se identificaron 12 asignaciones explícitas al objeto `window`:
- **Líneas 3558 y 6380**: `window._annualSubView = s.asv;` (guarda la sub-vista seleccionada en Anual, en lugar de residir en un almacén de UI State unificado).
- **Línea 6375**: `window._lastAnnualIncData = ...;` (guarda la última serie anual de ingresos para cálculo de tasas).
- **Líneas 6501 y 6529**: `window._currentAssetKeyDownHandler = onSheetKeyDown;` (almacena el listener del teclado para el bottom sheet de inversión directamente en `window`).
- **Líneas 6505 y 6536**: `window._currentAssetOutsideClickHandler = onOutsideClick;` (almacena el listener de clics fuera de la ficha en `window`).
- **Líneas 7704, 8177, 8343**: Referencias a `window.jspdf`.
- **Línea 9843**: `window._resizeChartTimer = setTimeout(...);` (temporizador de reflow por resize).

### 3.3 Riesgos de Colisión y Ausencia de `"use strict"`

1. **Sin Modo Estricto**: Ningún script embebido cuenta con la directiva `"use strict"`. Si cualquier función comete un error de tipografía al asignar a una variable local (ej. `temp = val`), el motor JavaScript crea silenciosamente una variable global en `window`.
2. **Sombras de Identificadores**: Se detectaron funciones locales dentro de controladores con nombres genéricos (`close`, `refresh`, `show`, `Y`) que colisionan conceptualmente con métodos globales de la ventana (`window.close`, `window.show`, etc.).

---

## 4. Catálogo Exhaustivo de Código Muerto, Obsoleto y Descartado

### 4.1 Funciones Muertas (16 Funciones con 0 Llamadas en Todo el Repositorio)

Mediante análisis estático por expresiones regulares en límites de palabra (`\bname\b`), se confirmaron las siguientes 16 funciones con exactamente 1 coincidencia (su propia declaración), no llamadas en ningún punto de HTML ni JS:

| Línea | Función | Propósito Original | Diagnóstico y Motivo de Obsolescencia |
|---|---|---|---|
| **2645** | `toggleGlobalPrivateMode()` | Wrapper redundante: `{ togglePrivacyMode(); }` | Código muerto. Todos los botones y teclas llaman a `togglePrivacyMode()` directamente. |
| **2675** | `localIsoDate(isoOrDate)` | Formateador a `YYYY-MM-DD` | Huérfano. La app utiliza `todayStr()`, `d.toISOString().slice(0,10)` o `lastDayOfMonthStr()`. |
| **2842** | `isCategoryExcludedFromBalance(catId, dateOrYm)` | Comprueba si modo es 2 (anotación) | Huérfano. La lógica de exclusión se evalúa inline o mediante `getCategoryCalcMode()`. |
| **3505** | `startSetPin()` | Flujo para configurar PIN de 4 dígitos | **Descartado / Muerto**. No existe botón ni ajuste en la interfaz para invocarlo. |
| **3510** | `enableBio()` | Registro WebAuthn con `navigator.credentials.create` | **Descartado expresamente el 2026-09-04** (§12 de `PROJECT_CONTEXT.md`): incompatible con PWA iOS. Quedó abandonado. |
| **4053** | `toggleAutoBackup()` | Alterna backup semanal en localStorage | **Descartado expresamente el 2026-09-02** (§12 de `PROJECT_CONTEXT.md`): backups automáticos delegados a Edge Function de Supabase. |
| **4316** | `isTxExcludedExpense(t)` | Filtro de gastos excluidos | Huérfano. `donutEntries` evalúa `txExpenseImpact(t) > 0` directamente. |
| **5488** | `accountVoidDelta(voided, accId, bDate, asOfDate)` | Devuelve `return 0;` | Huérfano. Comentario explica que las anulaciones no alteran la base conciliada. |
| **5558** | `accountRealBalance(accountId, yr, mo)` | Consulta saldo real a fin de mes | Obsoleto. Sustituido completamente por `accountRealBalanceAtDate(accountId, dateStr)`. |
| **5638** | `reconcileAccountToTheoretical(accountId)` | Fuerza saldo real igual a teórico | Obsoleto. El sistema moderno mantiene explícitamente el desfase. |
| **5947** | `ensureBalanceAdjustmentCategory(type)` | Crea categorías automáticas en DB | Obsoleto. Los ajustes modernos usan la pseudocategoría virtual del sistema. |
| **5961** | `saveBalanceAdjustmentFallback(item, adj)` | Fallback de guardado de balance | Obsoleto. La lógica se integró directamente en el bloque `try/catch` de `applyBalanceAdjustment`. |
| **6407** | `bindAssetGraph(chart, values)` | Enlace de eventos de gráfico SVG | Obsoleto. Sustituido por listeners globales en `inspectAssetGraph` (líneas 6415–6431). |
| **6917** | `setExcludeFromCalc(val)` | Setter booleano de exclusión | Obsoleto. Sustituido por el cálculo contable tri-estado (`setTxCalcMode`). |
| **7632** | `daysBetween(a, b)` | Diferencia en días entre dos fechas | Huérfano. Solo era requerido por `exportDailyBalanceRange`. |
| **7633** | `exportDailyBalanceRange(from, to)` | Cálculo diario para gráfica PDF | **Descartado expresamente el 2026-09-10** (§12 de `PROJECT_CONTEXT.md`): gráfico de saldo diario retirado del PDF. |

### 4.2 Variables Globales Muertas (Declaradas y Jamás Leídas)

1. **`ACCENT_COLORS` (línea 2599)**: Array de 16 colores hex (`['#34C759', '#007AFF', ...]`). Resto del selector de acento descartado el 2026-09-02.
2. **`donutChart` (línea 2604)**: `var donutChart=null;` jamás referenciada.
3. **`barChart` (línea 2605)**: `var barChart=null;` jamás referenciada.
4. **`lineChart` (línea 2605)**: `var lineChart=null;` jamás referenciada.
5. **`dtDonutChart` (línea 9333)**: `var dtDonutChart=null;` jamás referenciada.
6. **`isExcludeFromCalc` (línea 6916)**: `var isExcludeFromCalc=false;` jamás leída ni escrita en ninguna otra línea.
7. **`_centerValues` (línea 4364)**: Escrita en `setCenter()` (línea 4382), pero **jamás leída en toda la aplicación**. Variable fantasma de solo-escritura.

### 4.3 Violación Detectada de Decisiones Descartadas (§12 de `PROJECT_CONTEXT.md`)

- **Atajos de teclado alfanuméricos globales en Escritorio (Líneas 9597–9605)**:
  ```javascript
  if(!isInput && !e.ctrlKey && !e.metaKey && !e.altKey){
    if(e.key === 'n' || e.key === 'N' || e.key === '+'){ e.preventDefault(); openModal(); }
    else if(e.key === 'p' || e.key === 'P'){ e.preventDefault(); togglePrivacyMode(); }
    else if(e.key === '/'){ ... }
  }
  ```
  **Infracción**: El 2026-09-08 se acordó expresamente: *"Atajos de teclado globales en versión Desktop (N para nuevo movimiento, 1-5 para tabs, F para filtros). Descartado por el usuario: navegación estándar con ratón/trackpad sin captura de teclas alfanuméricas globales"*. La captura de 'n', 'p' y '/' en el listener global representa una regresión de deuda técnica activa.

---

## 5. Auditoría de Duplicación y Redundancia de Código

### 5.1 Duplicación Idéntica y Sombreado de Funciones

1. **`trapFocus(container, e)`**:
   - Declaración local en Modal de Inversión: **Líneas 6471–6478**.
   - Declaración global para Modal de Transacción: **Líneas 7061–7068**.
   - **Tercera implementación inline** en listener global `keydown`: **Líneas 9579–9586**.
   *Diagnóstico*: Las dos primeras son copias idénticas carácter por carácter (8 líneas duplicadas). La tercera implementa la misma lógica sobre `.modal-bg.visible`.
2. **`closeModal()`**:
   - Declaración local en Modal de Inversión: **Líneas 6479–6484** (destruye `modal` y remueve listeners).
   - Declaración global: **Líneas 7069–7072** (oculta `#modalBg`, resetea `editingTxId`).
   *Riesgo*: Al llamarse `closeModal()`, la resolución del ámbito depende de si se invoca dentro del cierre del trade modal o globalmente.
3. **Escalado Matemático Canvas `Y(v)`**:
   - Línea 6069 (gráfico de evolución anual).
   - Línea 8003 (gráfico de ingresos/gastos en PDF).
   - Línea 8132 (gráfico de patrimonio en PDF).
   *Diagnóstico*: Misma función matemática `function Y(v){ return padT + plotH - ((v - y0) / (y1 - y0)) * plotH; }` redefinida tres veces.

### 5.2 Duplicación de Componentes Móvil vs Escritorio

| Componente Móvil | Componente Desktop | Líneas | Diferencias y Divergencias |
|---|---|---|---|
| `renderDonut(exps, total)` | `dtRenderDonut(exps, total, size)` | 4337–4400 vs 9490–9550 | ~120 líneas duplicadas. Ambos crean eventos `mousemove`, calculan ángulos con `Math.atan2`, formatean tooltips y llaman a `drawDonut`. |
| `setCenter(p, a, c)` | `dtSetCenter(p, a, c)` | 4382 vs 9518 | Duplicado. Actualiza `dcPct`/`dcAmt`/`dcCat` vs `dtDcPct`/`dtDcAmt`/`dtDcCat`. |
| `onFrontClick` / `onBackClick` | `dtOnFrontClick` / `dtOnBackClick` | 4450–4456 vs 4458–4459 | Duplicado. El móvil comprueba `if(_chartWasDragged) return;` para no girar la tarjeta tras un drag; **el desktop olvidó esta guarda**, girando la tarjeta tras seleccionar días. |
| `activeCatId` | `dtActiveCat` | 2604 vs 9334 | Estado dual desincronizado: cambiar de tamaño de ventana entre móvil y escritorio pierde la categoría activa seleccionada. |

### 5.3 Duplicación de Rutinas de Utilidad y Almacenamiento

1. **Formateo de Fechas ISO**:
   - `localIsoDate`: `d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())` (línea 2675).
   - `lastDayOfMonthStr`: `d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())` (línea 5434).
   - `todayStr`: `d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())` (línea 7624).
2. **Notificaciones Toast**:
   - `showSuccessToast(msg)` (línea 7458) y `showUndoToast(msg, onUndo)` (línea 7466) duplican la creación e inyección en el DOM del elemento `#undoToast`.
3. **Persistencia de Color en DB**:
   - `saveCatColor(catId, color)` (línea 7561) y `saveAccountColor(accountId, color)` (línea 7590) repiten el mismo patrón de guardado optimista, reversión de error y encolado offline.

---

## 6. Auditoría de Consistencia de Estado y Gestión de Cachés

### 6.1 Falta de Modelo de Estado Centralizado

En lugar de un patrón estructurado (`appState` o `store`), la aplicación depende de **mutaciones directas sobre variables globales mutables**. No existe un despachador de eventos de estado, lo que provoca que cada función decida arbitrariamente qué partes de la interfaz y qué cachés actualizar tras una mutación.

### 6.2 Fuga de Datos en Cierre de Sesión (Cross-User Cache Pollution)

Al cerrar sesión, existen dos rutas de código: `signOut()` (línea 6814) y el manejador `onAuthStateChange` de Supabase (línea 9860). Ninguna de las dos realiza una limpieza exhaustiva:

```javascript
// Línea 9860: onAuthStateChange (else branch)
loadGeneration++;loadDataInFlight=false;loadDataPromise=null;_catExclusionsCache=null;
currentUser=null;transactions=[];categories=[];accounts=[];patrimony=[];budgets=[];
recurrenceExclusions=[];transactionVoids=[];offlineQueue=[];investmentOperations=[];
_monthTxCache={};_yearTxCache={};if(typeof invalidateTxIndices==='function')invalidateTxIndices();
showAuth();
```

**Cachés NO purgadas al cerrar sesión**:
1. `_catIconsCache` (línea 2773): Almacena los iconos personalizados del usuario. Si entra un segundo usuario en el mismo navegador, verá los iconos del usuario anterior hasta refrescar la página.
2. `_rbCache` (línea 5564): Caché de saldos reales por fecha (`accountId@dateStr`). Permanece con datos financieros del usuario saliente.
3. `_historyCache` (línea 5436): Historial de snapshots de patrimonio de las cuentas. Permanece intacto en memoria.
4. `_lastDonutEntries` y `_lastDonutExps` (línea 4315): El desglose de gastos en memoria no se invalida.
5. `_lastHmByDay` y `_lastHmExps` (línea 4512): El desglose del heatmap no se vacía.
6. `assetDetailState` (línea 2603): La posición y cotización del último activo consultado permanecen en memoria.

### 6.3 Inconsistencia en Mutaciones de Transacciones

| Operación | Modifica `transactions` | `txVersion++` | `invalidateTxIndices()` | `clearBalanceCache()` | `saveLocalCache()` | Estado Resultante |
|---|---|---|---|---|---|---|
| **Guardar movimiento (`saveTx`)** | SÍ | **SÍ** | **SÍ** | **SÍ** | **SÍ** | Consistente |
| **Ajuste de saldo (`applyBalanceAdjustment`)** | SÍ | **SÍ** | **SÍ** | **SÍ** | **SÍ** | Consistente |
| **Eliminar movimiento (`deleteTx`)** | SÍ | **NO** | **NO** | **NO** | **SÍ** | **Inconsistente**: `_monthTxCache` no se limpia; cachés de balance conservan importes antiguos. |
| **Restaurar movimiento (`restoreTx`)** | SÍ | **NO** | **NO** | **NO** | **SÍ** | **Inconsistente**: `invalidateTxIndices()` y `clearBalanceCache()` no se invocan. |

### 6.4 Trampa de Comparación por Referencia de Arrays (`===`)

En `donutEntries` (línea 4321):
```javascript
if(items === _lastDonutExps) return _lastDonutEntries;
```
Y en `renderHeatmap` (línea 4542):
```javascript
if(exps === _lastHmExps) { byDay = _lastHmByDay; }
```
Si se modifica una transacción internamente (ej. cambio de categoría, nota o importe de un movimiento existente) sin cambiar la referencia del array `items`/`exps`, la comparación estricta de referencia `items === _lastDonutExps` evalúa a `true`. El gráfico reutiliza las entradas calculadas obsoletas en lugar de regenerarlas.

---

## 7. Mantenibilidad Arquitectónica e Invariantes Zero-Bundler

### 7.1 La Falacia del "Monolito Inline Obligatorio"

El principio fundacional de `fintrack` exige:
> *"Cero herramientas de build, cero bundlers y cero frameworks de cliente"* (§2.1 de `PROJECT_CONTEXT.md`).

Esto garantiza que el proyecto pueda desplegarse directamente en GitHub Pages sin Node.js, Webpack, Vite ni Babel. **Sin embargo, cero-bundlers NO significa obligatoriamente embutir 7.287 líneas de JS en un solo archivo `index.html`.**

Los navegadores web modernos soportan nativamente dos estrategias modulares sin proceso de build:
1. **Separación en Scripts Nativos por Dominio**:
   ```html
   <script src="js/core.js"></script>
   <script src="js/accounting.js"></script>
   <script src="js/charts.js"></script>
   <script src="js/investments.js"></script>
   <script src="js/ui.js"></script>
   ```
2. **Módulos ES Nativos (`type="module"`)**:
   Soportados por todos los navegadores modernos (Safari iOS, Chrome, Edge, Firefox), permitiendo `import`/`export` directos con resolución de URLs relativas y aislamiento estricto de ámbito por defecto (sin polución de `window`).

### 7.2 Sobrecarga por `MutationObserver` Globales Permanentes

En las líneas 6426 y 6439 se inicializan dos observadores de mutaciones:
```javascript
var investmentLogoObserver = new MutationObserver(function(){ decorateInvestmentLogos(document); });
investmentLogoObserver.observe(document.body, { subtree: true, childList: true });

var assetPeriodObserver = new MutationObserver(function(records){ ... });
assetPeriodObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
```
**Impacto Arquitectónico**:
Ambos observadores vigilan permanentemente todo el subárbol de `document.body`. Cada vez que el usuario teclea en el buscador de transacciones, se abre un modal, o se renderiza una fila en cualquier pestaña, ambos observadores se activan y disparan `document.querySelectorAll()` en todo el documento. Este patrón sustituye incorrectamente el renderizado declarativo por intercepciones globales pasivas.

### 7.3 Arquitectura de Modales Dispersa

Existen 5 modales estáticos en el DOM (`#modalBg`, `#exportModalBg`, `#adjustModalBg`, `#budgetModalBg`, `#monthModalBg`) y 3 modales dinámicos inyectados por código (`.investment-trade-modal`, `.asset-sheet`, `.sync-tray`). 

El despachador global `closeTopModal(targetBg)` (línea 9536) contiene una lógica defectuosa:
```javascript
if(bg.id === 'monthModalBg' || (document.getElementById('monthModalBg') && document.getElementById('monthModalBg').classList.contains('visible'))) {
  closeMonthModal();
  return;
}
```
Si el selector de mes tiene la clase `.visible`, cualquier llamada a `closeTopModal(targetBg)` cerrará el mes, ignorando el modal específico que disparó el evento. Además, los modales de inversión no tienen la clase `.modal-bg`, por lo que escapan al control centralizado de teclado y fondo.

---

## 8. Fragilidad de Scripts Embebidos y Validación Sintáctica

### 8.1 Fragilidad de un Monolito Inline

1. **Fallo Catastrófico de Punto Único (Single Point of Failure)**:
   Al estar toda la lógica en un solo tag `<script>`, si un cambio introduce un error sintáctico (ej. una coma colgante en JSON antiguo, un carácter no escapado en un template literal, o una llave desbalanceada), el motor del navegador aborta la ejecución completa del bloque. No se ejecuta `render()`, ni `initApp()`, ni se remueve el `#loadingOverlay`.
2. **Watchdog de Emergencia como Parche Síntoma**:
   En la línea 9866, el código incluye:
   ```javascript
   // Watchdog de seguridad: garantiza que loadingOverlay NUNCA atrape la UI indefinidamente
   setTimeout(function(){
     var ov = document.getElementById('loadingOverlay');
     if(ov && !ov.classList.contains('hidden')){
       console.warn('FinTrack: Watchdog de arranque forzó la ocultación del loadingOverlay');
       ov.classList.add('hidden');
       ...
     }
   }, 5000);
   ```
   La existencia de este watchdog de 5 segundos es evidencia directa de la recurrencia histórica de congelamientos de arranque causados por errores sintácticos o de red no capturados.

### 8.2 Deficiencias de `scripts/validate-syntax.js`

El script de validación actual consta de 33 líneas y presenta tres riesgos principales:
1. **Dependencia de Expresión Regular para Extraer Scripts**:
   ```javascript
   const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
   ```
   Si en algún punto una cadena de texto JavaScript o un comentario contiene la secuencia `</script>` (incluso como parte de un template string o selector HTML), la regex cortará el script prematuramente, provocando un falso positivo de sintaxis o enmascarando un error real.
2. **Validación Puramente Sintáctica (Sin Análisis Semántico ni Tipado)**:
   `new vm.Script(scriptContent)` valida únicamente que el código sea gramaticalmente válido en ECMAScript. No detecta:
   - Acceso a variables no declaradas.
   - Llamadas a funciones inexistentes.
   - Parámetros duplicados o variables no usadas.
3. **Falta de Entorno de Ejecución en PATH Local**:
   En el entorno estándar de PowerShell en la máquina del usuario, el comando `node` no está configurado en el PATH del sistema (arrojando `CommandNotFoundException`). Aunque existe una versión funcional en Adobe Photoshop (`C:\Program Files\Adobe\Adobe Photoshop 2025\node.exe`), la validación falla para cualquier agente o script estándar que asuma `node` global.

---

## 9. Matriz de Impacto vs. Esfuerzo (Priorización)

| ID | Hallazgo / Oportunidad de Mejora | Impacto | Esfuerzo | Fase Recomendada | Justificación Técnica |
|---|---|---|---|---|---|
| **A10-1** | Purgado simétrico de cachés en `signOut()` y `onAuthStateChange` (`_rbCache`, `_catIconsCache`, `_historyCache`, `_lastDonutEntries`, etc.) | **Alto** | **Bajo** | Fase 1 | Elimina riesgo inmediato de fuga de datos entre usuarios sin tocar lógica de negocio. |
| **A10-2** | Subsanar omisión de invalidación de cachés en `deleteTx()` y `restoreTx()` (`txVersion++`, `invalidateTxIndices()`, `clearBalanceCache()`) | **Alto** | **Bajo** | Fase 1 | Corrige discrepancias en balances calculados tras eliminar o deshacer transacciones. |
| **A10-3** | Retirar atajos de teclado globales en escritorio ('n', 'p', '/') en líneas 9597–9605 | **Medio** | **Bajo** | Fase 1 | Cumple con la decisión vinculante descartada por el usuario (§12 de `PROJECT_CONTEXT.md`). |
| **A10-4** | Erradicación de las 16 funciones muertas y 7 variables globales huérfanas | **Medio** | **Bajo** | Fase 2 | Reduce ~250 líneas de código superfluo y simplifica el mantenimiento sin alterar la UI. |
| **A10-5** | Unificación de librerías vendor (`jspdf`, `exceljs`) asegurando llamada a `loadScript()` en todos los puntos de exportación | **Alto** | **Bajo** | Fase 2 | Evita fallos de exportación en PDF mensual y Excel directo si la librería no estaba en memoria. |
| **A10-6** | Unificación de la rutina `trapFocus(container, e)` y corrección de la lógica de `closeTopModal` | **Medio** | **Medio** | Fase 2 | Estandariza la accesibilidad y el cierre por Escape en todos los modales (incluyendo inversión). |
| **A10-7** | Reemplazo de los `MutationObserver` globales sobre `document.body` por llamadas directas tras renderizado | **Alto** | **Medio** | Fase 3 | Elimina sobrecarga continua de reflow y consultas DOM en cada pulsación o scroll. |
| **A10-8** | Unificación de componentes móvil/escritorio (`renderDonut` vs `dtRenderDonut`, `activeCatId` vs `dtActiveCat`) | **Alto** | **Medio** | Fase 3 | Elimina ~150 líneas duplicadas y resuelve divergencias de estado al redimensionar pantalla. |
| **A10-9** | Activación de `"use strict"` e introducción de un script de linting estático para `index.html` | **Alto** | **Medio** | Fase 3 | Previene la creación accidental de variables globales y errores de tipografía. |
| **A10-10**| Modularización del JavaScript monolítico en scripts independientes por dominio respetando *zero-bundler* | **Alto** | **Alto** | Fase 4 | Transforma el monolito de 7.200 líneas en 6 archivos limpios (`core.js`, `accounting.js`, etc.) sin herramientas de compilación. |

---

## 10. Riesgos de Regresión y Salvaguardas de Refactorización

Cualquier cambio estructural en `fintrack` conlleva riesgos intrínsecos debido a la ausencia de un pipeline de pruebas automatizado en CI. Se definen las siguientes salvaguardas obligatorias:

1. **Riesgo: Romper Referencias de Hoisting al Reordenar Funciones**:
   - *Mecanismo*: Las declaraciones `function foo(){}` en JavaScript disfrutan de hoisting, permitiendo llamarlas antes de su definición física (como ocurre con `todayStr()` en la línea 3336, definida en la 7624). Si se convierten a funciones flecha o expresiones `var foo = function(){}`, se producirá un `TypeError: foo is not a function`.
   - *Salvaguarda*: Mantener declaraciones `function` estándar durante refactors intermedios o asegurar que el orden de carga ubique las utilidades fundamentales en el encabezado.
2. **Riesgo: Colapso de la PWA por Desincronización de Caché**:
   - *Mecanismo*: Si se modifica `index.html` sin actualizar `CACHE_NAME` en `serviceworker.js`, los dispositivos instalados servirán la versión anterior con datos de caché obsoletos.
   - *Salvaguarda*: Seguir estrictamente el §2.3 de `PROJECT_CONTEXT.md`: incremento obligatorio de `APP_VERSION`, `APP_PUBLISHED_AT` y versión de caché (`fintrack-cache-v...`) en cada despliegue.
3. **Riesgo: Regresión en la Lógica Tri-Estado Contable**:
   - *Mecanismo*: Limpiar código deprecado como `setExcludeFromCalc` podría afectar llamadas residuales que esperaban el comportamiento binario antiguo.
   - *Salvaguarda*: Validar con las suites de prueba de matemáticas financieras (`scripts/test-math-eval.js` y `scripts/audit-finance-core.js`) antes y después de cualquier poda de código.
4. **Riesgo: Fragilidad Sintáctica**:
   - *Salvaguarda*: Ejecutar `node scripts/validate-syntax.js` (o vía el ejecutable verificado de node en `C:\Program Files\Adobe\Adobe Photoshop 2025\node.exe`) antes de cualquier commit para certificar 0 errores sintácticos en los 4 bloques.

---

## 11. Pasos de Verificación y Comprobación Independiente

Para auditar y verificar independientemente las conclusiones de este informe:

1. **Verificación de Conteo y Líneas Monolíticas**:
   ```powershell
   $lines = [System.IO.File]::ReadAllLines("index.html")
   Write-Output "Líneas totales: $($lines.Length)"
   Write-Output "Script inicio: Línea 2590 ($($lines[2589]))"
   Write-Output "Script fin: Línea 9877 ($($lines[9876]))"
   ```
2. **Comprobación de Funciones Muertas (0 invocaciones)**:
   ```powershell
   $html = [System.IO.File]::ReadAllText("index.html")
   @('toggleGlobalPrivateMode', 'localIsoDate', 'isCategoryExcludedFromBalance', 'startSetPin', 
     'enableBio', 'toggleAutoBackup', 'isTxExcludedExpense', 'accountVoidDelta', 
     'accountRealBalance', 'reconcileAccountToTheoretical', 'ensureBalanceAdjustmentCategory', 
     'saveBalanceAdjustmentFallback', 'bindAssetGraph', 'setExcludeFromCalc', 
     'daysBetween', 'exportDailyBalanceRange') | ForEach-Object {
       $c = ([regex]::Matches($html, "\b$_\b")).Count
       Write-Output "$_: $c coincidencia(s)"
   }
   ```
3. **Comprobación de Variables Globales Muertas**:
   ```powershell
   @('ACCENT_COLORS', 'donutChart', 'barChart', 'lineChart', 'dtDonutChart', 'isExcludeFromCalc', '_centerValues') | ForEach-Object {
       $c = ([regex]::Matches($html, "\b$_\b")).Count
       Write-Output "$_: $c coincidencia(s)"
   }
   ```
4. **Comprobación de Infracción de Atajos de Teclado (§12 de `PROJECT_CONTEXT.md`)**:
   Inspeccionar líneas 9597–9605 de `index.html` para confirmar la captura de `e.key === 'n'`, `e.key === 'p'` y `e.key === '/'`.
5. **Comprobación de Validación Sintáctica Actual**:
   ```powershell
   & "C:\Program Files\Adobe\Adobe Photoshop 2025\node.exe" scripts/validate-syntax.js
   ```
   *Resultado esperado*: 4 bloques de script válidos con 0 errores.
