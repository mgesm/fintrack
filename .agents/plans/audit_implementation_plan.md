# Plan Maestro de Implementación y Remediación Arquitectónica — fintrack

> **Documento:** Plan Maestro Canónico de Auditoría e Implementación  
> **Proyecto:** `fintrack` (PWA de Finanzas Personales e Inversiones)  
> **Autor / Rol:** Master Plan Consolidator & Lead Architect  
> **Fecha:** 14 de Noviembre de 2026  
> **Versión del Plan:** 1.0.0 (Consolidación Oficial de 10 Agentes Especialistas)  
> **Estado:** Aprobado para Planificación — En espera de aprobación ejecutiva para fase de ejecución  
> **Restricción Inviolable:** Modo de solo lectura durante la auditoría. Cero modificaciones a código fuente de aplicación (`index.html`, `serviceworker.js`, etc.) durante esta fase.  
> **Invariantes Arquitectónicos:** Cero build tools, cero bundlers, cero frameworks de cliente (SPA estática en vanilla JavaScript), CERO EMOJIS (iconos vectoriales monocromáticos SVG en línea), marca estrictamente en minúsculas (`fintrack`), conformidad de Modo Privado (cifras numéricas difuminadas, lienzos gráficos y aros intactos), y reglas contables fundamentales (Separación Gasto/Ingreso vs Traspaso, Desfase Real vs Teórico, y Contabilidad Tri-Estado).

---

## 1. Resumen Ejecutivo y Estado Global de la Arquitectura

### 1.1 Contexto y Misión de fintrack
`fintrack` es una aplicación web progresiva (PWA) privada para la gestión integral de finanzas personales, tesorería, presupuestos, conciliación patrimonial e inversiones. Su arquitectura técnica se fundamenta en un principio de **independencia y simplicidad operativa radical**: una SPA monolítica estática en vanilla JavaScript alojada en GitHub Pages, con backend serverless en PostgreSQL mediante Supabase, autenticación RLS (Row-Level Security) y Edge Functions en Deno para tareas complejas (servicios de cotización de mercado, copias de seguridad automáticas cifradas en Storage y generación de reportes mensuales en PDF con Resend).

Visualmente, el proyecto implementa el sistema de diseño canónico **"White Edition & Liquid Glass"**, una estética industrial sobria inspirada en la arquitectura editorial suiza y los materiales refractivos reactivos de iOS y visionOS, con estricta prohibición de emojis y tipografía con cifras tabulares uniformes (`tabular-nums`).

### 1.2 Cuadro de Mando de Salud Arquitectónica por Dominio (10 Especialidades)

| Dominio | Auditor Responsable | Estado de Salud | Hallazgos Críticos / Mayores | Evaluación Arquitectónica Global |
|---|---|:---:|:---:|---|
| **1. Motor Contable & Matemáticas Financieras** | Agente 1 | **VULNERABLE** | 4 Críticos / 3 Medios | **Filtración contable grave en Tri-Estado:** `accountTxDelta` y `accountTouchesAccount` no filtran el Modo 2 (`_no_calc`), alterando saldos bancarios y patrimonio neto con notas informativas. Deriva de redondeo IEEE-754 (`Number.EPSILON` no escalado trunca medios céntimos). Truncamiento silencioso de expresiones numéricas y riesgo en separadores de miles españoles (`1.250`). Inserción no atómica en ajustes de saldo. |
| **2. Guardián de Diseño & Ergonomía Visual** | Agente 2 | **PARCIAL (68%)** | 3 Críticos / 6 Medios | **Regresión grave en Modo Privado:** Reglas CSS difuminan por completo los lienzos `#lineChartCanvas`, `#barChartCanvas` y `.heatmap-grid`, destruyendo las curvas visuales. Doble opacidad acumulativa en el Libro Mayor (85.6% opaco, destruyendo el Liquid Glass). Dispersión caótica de filtros `backdrop-filter` (7 valores de 4px a 60px). Ausencia de menisco especular en tarjetas clave. Colisión entre `.undo-toast` y el `.fab` en el tercio inferior. |
| **3. UX & Ergonomía Mobile / PWA** | Agente 3 | **CONGESTIONADO** | 4 Críticos / 7 Medios | **Fricción por acumulación histórica de controles:** El alta de un gasto diario requiere hasta 10 pasos y 8 toques, forzando ruedas nativas `<select>`. El teclado virtual sepulta el botón `Guardar` en hojas modales. 8 controles redundantes compiten en pantalla (3 puertas de entrada inconexas a la vista anual). Colisiones de hit-targets en la cabecera entre `#prevMonth` y `#homeAnnualBtn`. La ficha de inversión carece de gesto de arrastre para cerrar (*drag-to-dismiss*). |
| **4. Rendimiento, Huella DOM & Monolito** | Agente 4 | **DEGRADADO** | 5 Críticos / 5 Medios | **Sobrecarga de parseo y layout thrashing:** Monolito de 614 KB con 442 KB de JS síncrono. `supabase-js.min.js` (207 KB) bloquea el parseo en `<head>`. Hoja externa de Google Fonts bloquea el render a pesar de disponer de fuentes locales WOFF2. El Service Worker impone 4.5s de timeout en navegación. Gesto swipe-to-delete y tooltips provocan reflujo sincrónico forzado (*layout thrashing*). Búsqueda ejecuta NFD Unicode 6.000–9,000 veces por pulsación. Fuga de memoria por URLs Blob no revocadas. |
| **5. Arquitectura Offline, Service Worker & Caché** | Agente 5 | **VULNERABLE** | 4 Críticos / 5 Medios | **Incompletitud offline y fallos de ciclo de vida:** Dependencias vendor (`jspdf`, `exceljs`) omitidas de `PRECACHE` (fallo de exportación offline). Error lógico de Promise en fallback de navegación (`serviceworker.js:44`). Paradoja en `saveSecureLocalCache()`: fallo de IndexedDB aborta antes del fallback a localStorage. Cola offline expuesta en texto plano en localStorage. Inversiones sin cobertura offline. Riesgo de desalojo silencioso en Safari iOS (sin `StorageManager.persist()`). Cierre de sesión involuntario offline por fallo de refresco de token tras 1h. |
| **6. Backend Supabase, Cola Offline & RLS** | Agente 6 | **CRÍTICO** | 5 Críticos / 4 Medios | **Pérdida irreversible de datos en Signout:** Confirmar cierre de sesión con cambios pendientes promete conservarlos pero ejecuta `localStorage.removeItem('ft_queue_' + uid)` destruyendo los datos. Reconciliación en `loadData()` solo contempla transacciones, perdiendo categorías o presupuestos creados offline. Fallos transitorios encolan errores en bucle y envenenan operaciones hijas con violación FK 23503 hacia dead-letter. Reintentos fijos a 500ms sin backoff exponencial. Ausencia de DDL base en migraciones de Git. |
| **7. Inversiones, Cartera & Mercados** | Agente 7 | **VULNERABLE** | 4 Críticos / 5 Medios | **Edición no atómica destructiva:** `openInvestmentOperationEdit` invoca `delete_investment_operation` y luego `record_investment_operation`; si el alta falla, la operación y su traspaso se pierden para siempre (ignorando la RPC atómica existente `update_fintrack_investment_operation`). Traspasos de venta con plusvalía vuelven negativo el saldo de la cuenta de inversión. Truncamiento de participaciones y NAV a 2 decimales. Error en `normalizeAssetType` que clasifica ETFs como fondos. Fuga visual de importes en modal de trading bajo modo privado. |
| **8. Presupuestos, Recurrencias & Planificación** | Agente 8 | **VULNERABLE** | 3 Críticos / 4 Medios | **Resurrección de recurrencias desactivadas:** Apagar recurrencia en edición ("futuras") no sanea cuotas pasadas (`stopFields`), provocando que `processRecurring` las resucite en la siguiente sesión. El día ancla (`recur_anchor_date`) es inmutable al desplazar cuotas. Registros manuales adelantados saltan meses intermedios. Discrepancia en umbrales de alerta (80% texto vs barra). Edge Function `monthly-report` no calcula presupuestos dinámicos de suscripciones y reporta 0 € de presupuesto. |
| **9. Privacidad, Seguridad de Datos & Modo Privado** | Agente 9 | **CRÍTICO** | 4 Críticos / 3 Medios | **Fuga masiva de importes numéricos:** Modo Privado solo desenfoca 7 elementos de Inicio; 100% de importes en Categorías, Cuentas, Análisis y notas quedan en texto claro. Desconexión entre Modo Privado global y Privacidad de Cartera. Vulnerabilidad ReDoS / Bucle Infinito en `hlText` con diacríticos puros que congela el navegador al 100% de CPU. Fuga residual de filtros e historial en `signOut()`. Atributos `onclick` sin escapar identificadores dinámicos. Ausencia de directiva CSP. |
| **10. Calidad de Código, Deuda Técnica & Monolito** | Agente 10 | **CRÍTICO** | 5 Críticos / 4 Medios | **Deuda técnica estructural y fragilidad extrema:** Bloque de 7.287 líneas sin modularizar (Single Point of Failure). 125 variables globales y 387 funciones en `window`. Ausencia de `"use strict"`. 16 funciones y 7 variables completamente muertas en el código. Violación activa de decisión descartada: atajos de teclado en escritorio ('n', 'p', '/'). Cachés no purgadas en logout (`_catIconsCache`, `_rbCache`, `_historyCache`). Inconsistencias en mutaciones (`deleteTx`/`restoreTx` no invalidan índices ni cachés). Duplicación masiva móvil/escritorio. |

### 1.3 Fortalezas Nucleares Demostradas de fintrack
A pesar de las vulnerabilidades detectadas, la base de código de `fintrack` exhibe virtudes de ingeniería de altísimo valor:
1. **Separación Contable Ejemplar de Traspasos:** La distinción entre movimientos de resultado (ingresos/gastos) y movimientos de tesorería (traspasos entre cuentas) está implementada de manera impecable en `txExpenseImpact(t)` y `txIncomeImpact(t)`, garantizando cero fugas hacia la cuenta de pérdidas y ganancias.
2. **Filosofía Rigurosa de Desfases:** El modelo de conciliación separa taxativamente el saldo real (observado en extracto bancario) del saldo teórico (proyectado por movimientos). La transacción de ajuste vinculada (`is_balance_adjustment = true`) se excluye del saldo teórico (`accountTxDelta` retorna 0), preservando la visibilidad del desfase y anclando periodos futuros sin arrastrar discrepancias pasadas.
3. **Cero Dependencias de Compilación:** La capacidad de ejecutar y depurar la aplicación abriendo directamente `index.html` en cualquier navegador web o desplegar haciendo `git push` a GitHub Pages representa un activo operativo que debe preservarse a toda costa.
4. **Cumplimiento Estricto de Cero Emojis:** Se constata un 100% de cumplimiento en la erradicación de glifos emoji en toda la interfaz de usuario, marcado y scripts, empleando exclusivamente iconos vectoriales SVG monocromáticos limpios.
5. **Criptografía Robusta en Reposo:** Empleo de primitivas modernas de Web Cryptography API (AES-GCM de 256 bits, IV de 96 bits aleatorio por escritura y clave no exportable en IndexedDB), garantizando una base de seguridad sólida una vez corregidos los fallos de integración.

### 1.4 Los 7 Riesgos Sistémicos Principales
1. **Riesgo de Destrucción de Datos:** Ediciones de inversión no atómicas (borrado previo al alta) y purga destructiva de la cola offline en `signOut` pueden causar pérdidas permanentes de registros contables.
2. **Riesgo de Corrupción del Libro Mayor:** Filtración del modo contable 2 (`_no_calc`) en los balances bancarios altera artificialmente la solvencia y patrimonio del usuario.
3. **Riesgo de Resurrección de Recurrencias:** Mutaciones incompletas en series recurrentes reactivan cobros eliminados o distorsionan presupuestos pasados y futuros.
4. **Riesgo de Fuga de Privacidad:** El Modo Privado no cubre las pantallas de detalle financiero, mientras que destruye erróneamente la visualización de los gráficos analíticos.
5. **Riesgo de Colapso de Rendimiento y DoS Local:** Layout thrashing en gestos táctiles a 120Hz, normalización Unicode intensiva en búsquedas y bucle infinito por diacríticos en `hlText` pueden bloquear el hilo principal.
6. **Riesgo de Inoperatividad Offline:** Ausencia de librerías vendor en el precache del Service Worker y bloqueo de hidratación si el token de sesión expira sin red.
7. **Riesgo de Fragilidad del Monolito:** Un solo error sintáctico en las 7.287 líneas de script tumba la aplicación completa sin aislamiento por módulos de dominio.

---

## 2. Secciones Detalladas de Auditoría por Dominio

```
+--------------------------------------------------------------------------------------------------+
|                                10 DOMINIOS DE AUDITORÍA ESPECIALIZADA                            |
+--------------------------------------------------------------------------------------------------+
|  [D1: Contabilidad & Math]   [D2: Diseño & Liquid Glass]   [D3: UX & Ergonomía Mobile/PWA]       |
|  [D4: Performance & DOM]     [D5: Offline-First & SW]      [D6: Supabase, Cola & RLS]            |
|  [D7: Inversiones & Cartera] [D8: Presupuestos & Recur]    [D9: Privacidad & Criptografía]       |
|  [D10: Calidad de Código, Deuda Técnica & Modularidad Monolítica]                               |
+--------------------------------------------------------------------------------------------------+
```

---

### DOMINIO 1: Motor Contable & Matemáticas Financieras (Agente 1)

#### 1.1 Diagnóstico Arquitectónico
El motor contable de `fintrack` gobierna la integridad del libro mayor, la clasificación de flujos de efectivo, la contabilidad tri-estado y la reconciliación patrimonial. El análisis confirma que la separación de traspasos internos respecto a ingresos y gastos es matemática y conceptualmente impecable. No obstante, se han detectado brechas de severidad crítica en la lógica de cálculo de saldos y precisión aritmética.

#### 1.2 Catálogo Detallado de Hallazgos
1. **CRÍTICO — Filtración de Transacciones Tri-Estado Modo 2 en Saldos de Cuenta:**  
   - **Ubicación:** `index.html:5475-5487` (`accountTxDelta`), `index.html:5487` (`accountTouchesAccount`).  
   - **Análisis:** FinTrack define tres modos contables: `0` (*Computar todo*), `1` (*Solo balance*, excluido de P&L) y `2` (*No computa*, apunte meramente informativo o pendiente, excluido de P&L y de saldos). La función `isTxExcludedFromBalance(t)` retorna `true` para Modo 2 (`_no_calc`). Sin embargo, `accountTxDelta` **no invoca jamás `isTxExcludedFromBalance(t)`**:
     ```javascript
     function accountTxDelta(t, accountId){
       if(t.is_balance_adjustment)return 0;
       if(t.type==='transfer'){ ... }
       if(!(t.account_id===accountId||(!t.account_id&&accounts.length===1)))return 0;
       return t.type==='expense'?-Number(t.amount):Number(t.amount);
     }
     ```
     Una transacción marcada con `computa_todo = 2` (ej. nota de 500 €) descuenta o añade 500 € al saldo bancario de la cuenta en `accountCalcBalance`, `accountCalcTheoreticalAsOf` y en el patrimonio total `totalPat`. La prueba automatizada `test_computa_todo_bug.js` confirmó que una cuenta de 1.000 € se redujo erróneamente a 500 €.
2. **MAYOR — Truncamiento de Precisión en Redondeo IEEE-754 (`roundMoney`):**  
   - **Ubicación:** `index.html:2925-2929`, y llamadas ad-hoc en líneas 5451, 5543, 5553, 5596, 5605, 5726.  
   - **Análisis:** `roundMoney(n)` utiliza `Math.round((n + Number.EPSILON) * 100) / 100`. `Number.EPSILON` (~`2.22e-16`) es la distancia entre 1 y el siguiente flotante representable. En magnitudes financieras ($n > 1$), el error de representación en binario de medios céntimos (como $35.855 \times 100 = 3585.4999999999995$) supera con creces `Number.EPSILON`. Como consecuencia, `roundMoney(35.855)` produce `35.85` en lugar del redondeo financiero correcto `35.86`. Se requiere estandarizar en notación exponencial: `Number(Math.round(Number(n + 'e+2')) + 'e-2')`.
3. **MAYOR — Riesgo de Formato en Separador de Miles Español en `parseCurrencyInput`:**  
   - **Ubicación:** `index.html:2930-2953`.  
   - **Análisis:** Si un usuario introduce `1.250` (mil doscientos cincuenta euros con punto de miles español sin decimales), `lastComma === -1` y `lastDot === 1`. La función asume que el punto representa decimales, parseando la entrada como `1.25 €` (un sub-registro de 1.000 veces el valor real). Debe detectarse el patrón canónico `^\d{1,3}(\.\d{3})+$` para eliminar los puntos de millar.  
   - *Nota de Integridad de Decisión:* De conformidad con la decisión vinculante de Miguel del 2026-09-05 (§12 de `PROJECT_CONTEXT.md`, donde se descartó expresamente un evaluador de expresiones aritméticas inline en el campo de importe), el parser no debe implementar una calculadora de expresiones algebraicas complejas, pero sí debe rechazar de forma segura entradas no numéricas sin truncar silenciosamente operandos incompletos.
4. **MAYOR — Mutación No Atómica en Ajustes de Saldo (`applyBalanceAdjustment`):**  
   - **Ubicación:** `index.html:5614-5628`.  
   - **Análisis:** El cliente ejecuta dos peticiones REST secuenciales independientes (`sb.from('patrimony').insert(...)` y luego `sb.from('transactions').insert(...)`). Si la red cae tras la primera petición, queda un snapshot de patrimonio huérfano sin transacción de ajuste vinculada. Debe invocarse la RPC atómica `save_fintrack_balance_adjustment` (desplegada en la migración `20260727090000`).
5. **MEDIO — Ángulo Muerto Temporal en Movimientos del Mismo Día del Ajuste:**  
   - **Ubicación:** `index.html:5542, 5449`.  
   - **Análisis:** `accountCalcBalance` filtra movimientos posteriores con `t.date > baseDate`. Si un usuario realiza un ajuste de saldo en fecha $D$ y horas después registra un gasto ordinario también fechado en $D$, la condición $D > D$ evalúa a `false`, omitiendo dicho gasto del saldo vivo.
6. **MEDIO — Desalineación de Exclusión de Categorías en Modo Anual:**  
   - **Ubicación:** `index.html:5129-5137`.  
   - **Análisis:** En `renderCatTab`, con `homeAnnualMode` activo, el numerador suma transacciones de los 12 meses, pero el denominador en línea 5137 comprueba si la categoría está excluida evaluando únicamente el mes individual seleccionado `viewMonth`, distorsionando los porcentajes relativos.

---

### DOMINIO 2: Guardián de Diseño & Ergonomía Visual (Agente 2)

#### 2.1 Diagnóstico de Fidelidad Liquid Glass frente a Estándares iOS
El lenguaje de diseño canónico [`DESIGN_SYSTEM.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/DESIGN_SYSTEM.md) (*White Edition & Liquid Glass*) establece que las superficies deben simular láminas convexas de cristal templado suspendidas sobre un fondo reactivo (`.mesh-bg`), caracterizadas por refracción física, cáusticas perimétricas, menisco especular y desenfoques consistentes.

```
+--------------------------------------------------------------------------------------------------+
|                             ANATOMÍA DEL CRISTAL LÍQUIDO (LIQUID GLASS)                          |
+--------------------------------------------------------------------------------------------------+
|  [BORDE ESPECULAR / SHEEN]   ::before con degradado rasante blanco (Glass Hi)                    |
|  [SUPERFICIE REFRACTIVA]     backdrop-filter: blur(40px) saturate(180%)                          |
|  [CÁUSTICA PERIMÉTRICA]      conic-gradient espectral recortado con mask-composite               |
|  [BISEL INTERIOR & SOMBRA]   box-shadow: inset 0 1px 0 rgba(255,255,255,0.60), sombra difusa     |
+--------------------------------------------------------------------------------------------------+
```

1. **Evaluación Óptica de Densidad de Superficie (`--bg2`):**  
   - En modo claro (`index.html:34`), `--bg2: rgba(255, 255, 255, 0.62)`. Una opacidad de base del 62% genera una apariencia de plástico lechoso (*milky plastic*) que amortigua excesivamente los orbes reactivos del fondo ambiental. Los estándares de Apple en iOS 18 / visionOS utilizan opacidades del 18% al 32% combinadas con un realce de saturación (`saturate(180%) - saturate(220%)`).
2. **Defecto Crítico de Doble Opacidad Acumulativa en el Libro Mayor (`.tx-group-card`):**  
   - El contenedor agrupado (`index.html:1081`) tiene `background: var(--bg2)` (62% opacidad).  
   - El ítem interior (`index.html:1084`) define `.tx-group-card .tx-item { background: var(--bg2); }` (62% de opacidad adicional).  
   - **Impacto:** La opacidad compuesta resultante es $1 - (1 - 0.62)^2 = 85.6\%$. Las filas del historial pierden por completo su condición de cristal translúcido, renderizándose como bloques blancos casi macizos. `.tx-item` debe tener `background: transparent;` y activar `var(--bg3)` únicamente en hover/active.
3. **Dispersión Caótica de Filtros `backdrop-filter`:**  
   Se detectó una fragmentación de 7 valores distintos de desenfoque sin jerarquía coherente:
   - `:root`: `blur(40px) saturate(180%)`
   - `.bottom-nav`: `blur(20px) saturate(215%) brightness(1.07)` (fidelidad ultra-alta)
   - `.auth-glass-card`: `blur(60px)` (sobre-desenfoque)
   - `.chart-card`: `blur(44px)`
   - `.undo-toast`: `blur(30px)`
   - `.modal-bg`: `blur(12px)`
   - `.critical-confirm-bg`: `blur(8px)`
   - `.investment-trade-modal`: `blur(4px)` (inapreciable)
   - `.asset-sheet` (Móvil): *Ninguno (fondo opaco plano)*.
4. **Ausencia de Menisco Especular en Componentes Clave:**  
   La regla de destello rasante `::before` (`index.html:1507-1514`) omite componentes neurálgicos: `.portfolio-card` (tarjeta insignia de Inversión), `.tx-group-card` (tarjeta de movimientos), modales `.modal` y `.annual-kpi-card`.

#### 2.2 Catálogo de Inconsistencias Visuales Inter-Pantallas
1. **Divergencia de Radios Squircle en Tarjetas Hero:**  
   La tarjeta de Cartera (`.portfolio-card`, `index.html:1905`) utiliza `border-radius: var(--radius-xl)` (28px), mientras que la tarjeta equivalente de Patrimonio Total (`.pat-total-card`, `index.html:1257`) usa `var(--radius-lg)` (20px). Ambas deben unificarse a 20px.
2. **Saltos de Ancho Máximo en Contenedor de Escritorio (*Container Jumps*):**  
   Al navegar por la barra lateral en pantallas `>= 768px`, el contenedor central sufre saltos bruscos e injustificados: Inicio (1440px), Categorías y Cuentas (960px), Anual e Inversión (760px), Ajustes (640px). Debe estandarizarse en dos niveles: 1200px (panorámico para Inicio/Anual) y 840px (formularios/listas para el resto).
3. **Persistencia Anómala del Tirador Modal (`.modal-handle`) en Escritorio:**  
   En pantallas de escritorio, los modales pasan a ser tarjetas flotantes centradas. Mientras que `.critical-confirm-handle` se oculta con `display: none!important`, `.modal-handle` permanece visible de forma anómala en el borde superior de los diálogos en PC.
4. **Dispersión en Iconografía SVG:**  
   Se identificaron 15 combinaciones dimensionales distintas (desde 10×10 hasta 40×40) y 7 grosores de trazo (`stroke-width` de 0.7 a 2.5). Debe homogeneizarse el catálogo canónico a trazo 2.0/2.2 y tamaños de rejilla de 16×16 px y 20×20 px.
5. **Colisión del `.undo-toast` con el `.fab`:**  
   Ambos elementos comparten la coordenada inferior `bottom: calc(76px + var(--safe-bottom))`. Al activarse el aviso de deshacer, colisiona físicamente sobre el botón flotante, bloqueando la pulsación del pulgar. Debe reubicarse en su posición superior canónica (*Dynamic Island* en `top: calc(16px + safe-top)`).
6. **Omisión de Cifras Tabulares (`tabular-nums`):**  
   Omitido en `#adjustRealAmount`, `#budgetModalAmount`, `#adjustDesfaseValue`, `.month-picker-year` y el badge contador de sincronización.
7. **Regresión Grave de Modo Privado en Lienzos Gráficos:**  
   Las reglas de `html.privacy-mode` (`index.html:1516-1518`) desenfocan `#lineChartCanvas`, `#barChartCanvas` y `.heatmap-grid`, violando el principio canónico de que la estructura gráfica debe permanecer nítida.

---

### DOMINIO 3: UX & Ergonomía Mobile / PWA (Agente 3)

#### 3.1 Análisis Ergonómico de la Zona del Pulgar (*Thumb Zone*)
El mapeo ergonómico en dispositivos móviles de 6.1" a 6.7" constata que la barra inferior (`.bottom-nav`) y el botón flotante (`#fabBtn`) respetan la zona de confort. Sin embargo, los controles de navegación temporal más utilizados (chevrons de mes, selector de calendario, toggle de vista anual y rueda de ajustes) están relegados al tercio superior derecho (*Zona Roja / Alto Esfuerzo*), forzando un sobreesfuerzo biomecánico continuo y riesgo de caída del terminal.

```
+--------------------------------------------------------------------------------------------------+
|                            ZONIFICACIÓN BIOMECÁNICA DEL PULGAR                                   |
+--------------------------------------------------------------------------------------------------+
|  [ZONA ROJA / ALTO ESFUERZO]    Cabecera: [ft.] [Anual] [<] [Mes Año] [>] [Ajustes]              |
|  [ZONA AMARILLA / ALCANCE MEDIO] Tarjetas KPI, Donut/Heatmap, Buscador y Filtros                 |
|  [ZONA VERDE / CONFORT PULGAR]   Historial movimientos, FAB (+), Barra de navegación (.bottom-nav)|
+--------------------------------------------------------------------------------------------------+
```

#### 3.2 Comparativa Flujo a Flujo: Pasos Actuales vs. Flujos Optimizados
1. **Flujo 1: Registro Rápido de un Gasto Diario (Quick Add):**
   - *Actual (10 pasos / 8 toques):* Pulsar FAB -> Se abre modal completa -> Teclado numérico se abre y oculta el botón Guardar -> Teclear importe -> Distracción visual por selector tri-estado en la misma fila -> Scroll para buscar categoría en rueda nativa `<select>` (15 opciones) -> Scroll o cerrar teclado para ver pie de modal -> Pulsar Guardar -> Retardo artificial de 600ms.
   - *Optimizado (3 pasos / 3 toques):* Pulsar FAB (disponible en Inicio, Cuentas y Categorías) -> Fila horizontal con 5 píldoras de categorías frecuentes con icono SVG bajo el importe -> Teclear cifra, tocar pastilla y confirmar con Enter o botón Guardar visible en barra adhesiva (*Sticky Action Bar*). Reducción del 65% del tiempo de interacción.
2. **Flujo 2: Traspaso Interno entre Cuentas:**
   - *Actual (7 pasos):* Conmutar modal a "Transferencia" o buscar una de las 6 tarjetas de cuenta con botón repetitivo "Transferir" -> Abrir select origen -> Abrir select destino -> Teclear importe -> Guardar.
   - *Optimizado (3 pasos):* Gesto de arrastrar cuenta A sobre cuenta B o pulsar acción global única "Traspasar" en cabecera de Cuentas -> Micro-sheet con importe y confirmación.
3. **Flujo 3: Reconciliación Bancaria y Ajuste de Saldo:**
   - *Actual (6 pasos con controles confusos):* Abrir modal -> Ver botón confuso "Conciliar (0 € desfase)" que sobreescribe datos reales -> Ver botón redundante de signo "±" que estorba en la fila de importe -> Teclear saldo -> Guardar.
   - *Optimizado (3 pasos):* Tocar cifra de saldo en la tarjeta -> Micro-sheet con foco automático -> Se suprime el botón "±" (el campo numérico acepta signo directo) y se suprime el botón "Conciliar (0 € desfase)" -> Confirmar ajuste.
4. **Flujo 4: Navegación de Periodo y Alternancia Mes/Año:**
   - *Actual (3 vías duplicadas):* Botón `#homeAnnualBtn` en cabecera colisiona con `#prevMonth`; botón "Ver todo el año" en el selector de mes; pestaña 3 "Análisis" en la barra inferior.
   - *Optimizado:* Retirar `#homeAnnualBtn` de la cabecera móvil (despeja 38px y erradica colisiones táctiles con el chevron de mes). Concentrar la visión anual en la pestaña 3 y en el filtro de ámbito temporal.
5. **Flujo 5: Búsqueda y Limpieza de Filtros:**
   - *Actual (5 acciones manuales):* Tocar chip "Todos", abrir select de categorías a "Todas", abrir select de cuentas a "Todas", restablecer ordenación, limpiar fechas.
   - *Optimizado (1 toque):* Botón visible "Limpiar filtros" junto al contador de filtros que devuelve todas las variables al estado base con un solo clic.
6. **Flujo 6: Operativa de Inversión (Doble Pila Modal):**
   - *Actual:* Abrir activo -> Pulsar comprar -> Se abre modal de trading SOBRE la ficha -> Al confirmar, la modal de compra se cierra pero el usuario queda atrapado en la ficha sin gesto de arrastre para cerrar.
   - *Optimizado:* Cierre en cascada al confirmar operación devolviendo a la cartera con toast, y soporte de gesto de arrastre hacia abajo en la ficha de producto.

#### 3.3 Catálogo Exhaustivo de Botones y Controles Redundantes a Eliminar
- `#homeAnnualBtn` (`index.html:2235`): Duplicado con pestaña Análisis y causante de toques erróneos.
- Botón "Cerrar" en modal de exportación (`index.html:2443`): Redundante con tap fuera y botones de descarga directa.
- Botón "Cerrar" en selector de mes (`index.html:2535`): Redundante con selección de mes que auto-cierra.
- Botón de alternancia de signo "±" (`#adjustSignToggle`, `index.html:2465`): Sobrecarga visual en la fila de saldo.
- Botón "Conciliar (0 € desfase)" (`index.html:2457`): Induce a error contable sobreescribiendo el saldo real con el teórico.
- Botones repetitivos "Transferir" en cada tarjeta de cuenta (`index.html:5417`): Hipertrofia de botones en Cuentas.
- Ojo de privacidad de 15px en Cartera (`index.html:6698`): Desconectado del Modo Privado global y sin área táctil de 44px.

---

### DOMINIO 4: Rendimiento, Huella DOM & Monolito (Agente 4)

#### 4.1 Telemetría y Análisis Cuantitativo del Monolito
- **Tamaño físico total de `index.html`:** 614.289 bytes (~600 KB).
- **CSS embebido en `<style>`:** 129.259 bytes (2.080 líneas).
- **JavaScript embebido en `<script>`:** 442.395 bytes (7.287 líneas consecutivas).
- **Scripts vendor síncronos en `<head>`:** `supabase-js.min.js` (207.274 bytes) bloquea la construcción del DOM antes de parsear el body.
- **Invocaciones dinámicas a `.innerHTML`:** 61 ocurrencias de demolición y reconstrucción total del árbol DOM.
- **Atributos de eventos inline:** 129 ocurrencias (109 `onclick`), derrotando la delegación de eventos.
- **Nodos DOM por cada 50 transacciones:** ~1.650 elementos individuales (~33 nodos por fila).

#### 4.2 Cuellos de Botella de Renderizado y Reflujo (*Layout Thrashing*)
1. **Layout Thrashing en Swipe-to-Delete (`index.html:4781`):**  
   En el evento `touchmove`, el código escribe `transform` y `opacity` e inmediatamente después lee `txSwipe.item.offsetWidth * 0.38` para calcular el umbral. Consultar `offsetWidth` tras una mutación de estilo fuerza un recálculo sincrónico del árbol de diseño (*forced reflow*) en cada frame táctil (hasta 120 veces por segundo en pantallas ProMotion). Debe cachearse `offsetWidth` en `touchstart`.
2. **Reconstrucción Masiva $O(N)$ en Paginación ("Ver más"):**  
   Al pulsar "Ver más" (`index.html:4748`), `refreshTab()` destruye todo el contenedor mediante `innerHTML` y recompone desde cero los elementos previos más los nuevos 50 elementos mediante concatenación de cadenas, desechando miles de nodos DOM para reparsearlos. Debe utilizarse `insertAdjacentHTML('beforeend', ...)` en lotes.
3. **Saturación de CPU en Búsqueda por Normalización NFD Innecesaria:**  
   En `renderTxList()` (`index.html:4921-4950`), la función `normStr` ejecuta `normalize('NFD').replace(...)` de 4 a 8 veces por transacción en cada pulsación de tecla sobre todo el histórico de movimientos. Para 1.500 movimientos, son 9.000 operaciones pesadas de descomposición Unicode por pulsación. Se debe precalcular `t._normToken` una sola vez en el momento de indexar la transacción en memoria.
4. **Fuga Permanente de Memoria por URLs Blob No Revocadas:**  
   En las funciones de exportación masiva (`index.html:3336, 4077, 7622, 8853, 9320`), se invoca `URL.createObjectURL(blob)` para forzar la descarga de archivos JSON, CSV, PDF y Excel, pero **jamás se invoca `URL.revokeObjectURL(url)`**. En instancias PWA de larga duración, los buffers de memoria de exportación quedan retenidos indefinidamente en el motor del navegador.
5. **Retención de Nodos Desacoplados en `countUp()`:**  
   `countUp()` ejecuta bucles de animación numérica mediante `requestAnimationFrame`. Si `dtRender()` reconstruye el DOM mientras la animación está viva, los elementos DOM antiguos se desacoplan del documento pero el closure de `requestAnimationFrame` los retiene en memoria hasta que transcurren los 900 ms de la animación.

---

### DOMINIO 5: Arquitectura Offline, Service Worker & Caché (Agente 5)

#### 5.1 Diagnóstico de `serviceworker.js` y Ciclo de Vida de Caché
1. **Omisión de Librerías Vendor en `PRECACHE` (`serviceworker.js:3`):**  
   `PRECACHE` contiene archivos básicos pero omite `./vendor/jspdf.umd.min.js` (365 KB) y `./vendor/exceljs.min.js` (948 KB). Si el usuario abre la app offline o tras una actualización de versión, cualquier intento de exportar datos falla de forma irrecuperable con error de librería no disponible.
2. **Error Lógico de Retorno de Promise en Navegación (`serviceworker.js:44`):**  
   En el fallback de navegación:
   ```javascript
   return cached || caches.match('./index.html') || caches.match('./');
   ```
   `caches.match()` retorna un objeto `Promise` (que siempre es truthy de forma sincrónica). La expresión `|| caches.match('./')` es código muerto inalcanzable. Debe encadenarse con `.then()`.
3. **Fallo de Coincidencia en Iconos Versionados (`?v=7`):**  
   `index.html` solicita `icon-512.png?v=7`, pero el Service Worker precachea `./icon-512.png`. Al no especificar `{ ignoreSearch: true }` en `caches.match()`, la coincidencia de caché falla sin conexión y recurre a red, fallando en offline.
4. **Activación Destructiva No Coordinada:**  
   `serviceworker.js` invoca `self.skipWaiting()` en `install` y en `activate` borra de inmediato todas las cachés anteriores con `caches.delete(k)`. Al mismo tiempo, el manejador `controllerchange` en `index.html:2113` está completamente vacío. Si el usuario tenía la app abierta, el nuevo Service Worker destruye los recursos en caché de la versión en uso sin avisar ni recargar la pestaña.

#### 5.2 Resiliencia de Persistencia Local y Web Crypto
1. **Paradoja de Fallback en `saveSecureLocalCache` (`index.html:3726`):**  
   El código incluye un bloque de respaldo en `localStorage` por si IndexedDB falla. Sin embargo, para obtener la clave criptográfica en la línea 3726, invoca `secureCacheKey()`, la cual depende estrictamente de que IndexedDB esté disponible. Si IndexedDB está bloqueado (navegación privada estricta en Safari o error de cuota), `secureCacheKey()` arroja una excepción que salta directamente al `catch` exterior, impidiendo que el fallback a `localStorage` se ejecute jamás.
2. **Exposición en Texto Plano de la Cola Offline:**  
   Mientras que `currentCachePayload()` se cifra con AES-GCM en IndexedDB, las transacciones pendientes en `offlineQueue` (`ft_queue_<uid>`) se almacenan en texto plano en `localStorage`, exponiendo importes, conceptos y cuentas en el almacenamiento del navegador.
3. **Cierre de Sesión Involuntario Offline por Expiración de Token:**  
   En `index.html:9860`, el callback `onAuthStateChange` ejecuta el bloque `else` si `session` es nula. Tras 1 hora sin red (tiempo de expiración del JWT de Supabase), el cliente intenta refrescar el token contra el servidor, la petición falla por falta de red, Supabase emite sesión nula y el frontend vacía todos los arrays en memoria y muestra la pantalla de login, bloqueando al usuario e impidiéndole consultar sus finanzas offline.
4. **Riesgo de Desalojo de Almacenamiento en Safari iOS:**  
   La aplicación no utiliza la API `navigator.storage.persist()`. En Safari móvil, los datos locales sin persistencia garantizada pueden ser purgados tras 7 días de inactividad o bajo presión de espacio.

---

### DOMINIO 6: Backend Supabase, Cola Offline & RLS (Agente 6)

#### 6.1 Vulnerabilidades Críticas en la Cola de Sincronización
1. **Destrucción Irreversible de Datos en `signOut()` (`index.html:6814-6833`):**  
   Al pulsar "Cerrar sesión" con operaciones pendientes en la cola offline, el diálogo de confirmación promete:  
   *"Aceptar: cerrar sesión y conservarlos para cuando vuelvas a entrar."*  
   Sin embargo, si el usuario acepta, el código ejecuta de forma incondicional:
   ```javascript
   localStorage.removeItem('ft_queue_' + uid);
   offlineQueue = [];
   ```
   Todas las transacciones y modificaciones registradas offline se destruyen permanentemente.
2. **Reconciliación Optimista Incompleta en `loadData()` (`index.html:3883-3896`):**  
   Al sincronizar con Supabase, `loadData()` descarga las colecciones remotas y sobreescribe los arrays en memoria. Para no perder cambios locales encolados, re-aplica la `offlineQueue`. Sin embargo, el bucle comprueba rígidamente `if(op.table === 'transactions')`. Si el usuario creó o editó una categoría, presupuesto o cuenta sin conexión, `loadData()` sobreescribe la memoria con los datos antiguos del servidor antes de que la cola se procese.
3. **Envenenamiento en Cascada de la Cola Offline (`processOfflineQueue`, líneas 3225-3265):**  
   Si una operación sufre un fallo transitorio del servidor (error 500, timeout de red o rate limit), el código añade la operación al array `failed` pero **continúa ejecutando el resto del lote**. Si la siguiente operación era una transacción dependiente de una categoría previa que falló, la transacción falla con error PostgreSQL `23503` (clave foránea inexistente). Al comenzar por `'23'`, el código la clasifica erróneamente como fallo permanente y la traslada a `syncIssues` (dead-letter queue), eliminándola de la cola y abortando su sincronización automática.
4. **Ausencia de Backoff Exponencial en Reintentos (`index.html:3274`):**  
   Si una operación queda en la cola, `setTimeout(processOfflineQueue, 500)` reintenta cada 500 ms en bucle cerrado sin retroceso exponencial ni fluctuación (*jitter*), saturando el servidor ante caídas de servicio.
5. **Condición de Carrera Multitestaña en Reanudación de Red:**  
   `isProcessingOfflineQueue` es un booleano en memoria RAM. Si el usuario tiene abiertas dos pestañas o ventana PWA y navegador, el evento `online` dispara `processOfflineQueue()` en ambas pestañas en paralelo sobre el mismo `localStorage`, duplicando inserciones o corrompiendo la cola por escrituras cruzadas. Se requiere el uso de Web Locks API (`navigator.locks.request`).

#### 6.2 Integridad del Esquema y Migraciones SQL
1. **Carencia de Migraciones DDL Base en Git:**  
   El directorio `supabase/migrations/` contiene 17 migraciones que asumen que las tablas base (`accounts`, `categories`, `transactions`, `patrimony`, `budgets`) ya existen. No existe un archivo `CREATE TABLE` inicial en el repositorio, impidiendo levantar un entorno de desarrollo local limpio con `supabase db reset`.
2. **Replicación Realtime Omitida en DDL:**  
   `index.html:3352` se suscribe a 7 tablas mediante Supabase Realtime, pero ninguna migración contiene `ALTER PUBLICATION supabase_realtime ADD TABLE ...`, dependiendo de configuraciones manuales en el dashboard de Supabase.
3. **Colisión Multitenant en `repair_fintrack_balance_adjustments`:**  
   La migración `20260727090000` hardcodea los IDs de categoría `'cat_balance_adjustment_expense'` e `'income'`. Al registrarse el segundo usuario en la base de datos, la inserción colisiona con el tenant 1 y se ignora por `ON CONFLICT DO NOTHING`, impidiendo que el tenant 2 visualice su categoría de ajuste debido a las políticas RLS.

---

### DOMINIO 7: Inversiones, Cartera & Mercados (Agente 7)

#### 7.1 Integridad de Operaciones de Inversión y Modelado Contable
1. **Pérdida Irreversible de Datos en Edición de Operaciones (`index.html:6689`):**  
   Al modificar una operación de inversión en la cartera, el frontend ejecuta:
   ```javascript
   var del = await sb.rpc('delete_investment_operation', { p_operation_id: o.id });
   var r = await sb.rpc('record_investment_operation', { ... });
   ```
   Si la segunda llamada falla (error de red o validación), la operación y su traspaso contable quedan eliminados para siempre. La función atómica en un único paso `update_fintrack_investment_operation` ya existe en Postgres (`20260923140000`), pero el frontend no la invoca.
2. **Defecto Contable de Plusvalías en Traspasos de Retirada:**  
   Al vender posiciones con beneficio, `record_investment_operation` emite un traspaso desde la cuenta de inversión a la cuenta de efectivo por el total recibido (capital + plusvalía). Como los traspasos no computan en el resultado de `fintrack`, la plusvalía no entra en ingresos del mes y la cuenta de inversión adquiere un **saldo teórico negativo permanente** en Cuentas que distorsiona el patrimonio consolidado.
3. **Truncamiento de Participaciones y NAV a 2 Decimales (`index.html:2952, 6487`):**  
   El modal de compra/venta pasa los valores por `parseCurrencyInput()`, redondeando forzosamente a 2 decimales. Esto destruye participaciones fraccionadas de fondos y criptoactivos (e.g. 0.123456 pasa a 0.12) y altera valores liquidativos con 4 u 8 decimales (e.g. 16.4232 € a 16.42 €).
4. **Fallo de Clasificación de ETFs en Asset Allocation (`index.html:6593`):**  
   Twelve Data devuelve `"Exchange Traded Fund"`. `normalizeAssetType` busca la subcadena `'etf'` (que no coincide) y cae en la siguiente regla `'fund'` / `'fondo'`, mostrando erróneamente todos los ETFs en la barra de distribución de cartera como `"Fondos"`.
5. **Desprotección de Transacciones de Inversión en `saveTx` (`index.html:7209`):**  
   Al guardar un traspaso en el modal estándar de movimientos, el código asigna `tags: []`, eliminando las etiquetas `invest_operation`, desprotegiendo el movimiento contra borrado en `deleteTx` y desincronizando la tabla relacional.
6. **Desfase de Zona Horaria y Corte del Tooltip en Gráfico de Activo (`index.html:6419`):**  
   La conversión `new Date(raw.replace(' ','T'))` sobre cadenas ISO sin hora local retrocede un día en husos horarios occidentales. Además, en los extremos $x=0$, el tooltip se desborda un 50% fuera del viewport móvil.

---

### DOMINIO 8: Presupuestos, Recurrencias & Planificación (Agente 8)

#### 8.1 Motor de Recurrencias y Aritmética de Calendario
1. **Resurrección Involuntaria de Series al Desactivar Recurrencia (`saveTx`, líneas 7254–7259):**  
   Al editar una cuota mensual y desmarcar "Gasto recurrente" con "Esta y todas las futuras", `syncRecurSeries` solo actualiza cuotas con `date >= fromDate`. Las cuotas pasadas retienen `recurring: true` y `recur_series_id`. En el siguiente inicio, `processRecurring` encuentra la serie abierta en el pasado y vuelve a generar todas las cuotas futuras. Debe aplicarse `stopFields` a las cuotas pasadas idéntico a `deleteRecurringFromHere`.
2. **Inmutabilidad del Día Ancla al Mover Cuotas Futuras (`index.html:7253`):**  
   Si se mueve una cuota del día 5 al día 20 con opción "futuras", el código preserva forzosamente `oldTx.recur_anchor_date` (día 5). Al llegar el mes siguiente, `processRecurring` ignora el día 20 y vuelve a forzar la fecha al día 5.
3. **Omisión de Cuotas Intermedias por Registros Anticipados (`index.html:3988`):**  
   Si el usuario registra una cuota adelantada de dos meses vista, `processRecurring` fija `lastDate` en el máximo global de la serie, avanzando el puntero temporal y omitiendo para siempre los meses intermedios que no se habían materializado.

#### 8.2 Invariante de Previsión Completa y Desfase con Edge Functions
1. **Quiebra Absoluta en Edge Function `monthly-report` (`monthly-report/index.ts:372`):**  
   El invariante financiero de `fintrack` exige que el presupuesto mensual de suscripciones represente la suma de todas las recurrencias previstas del mes completo. En el cliente esto se calcula dinámicamente con `autoRecurBudgetBreakdown`. Sin embargo, la Edge Function solo consulta la tabla física `budgets`. Como no existe una fila estática para Suscripciones, el informe mensual PDF emitido por correo reporta un presupuesto de 0,00 €, marcando la categoría como *"Presupuesto superado"* de forma alarmista y errónea.
2. **Distorsión Retroactiva de Presupuestos Pasados:**  
   `autoRecurBudgetBreakdown` (líneas 3113–3115) extrae el precio unitario de la última cuota histórica disponible en toda la serie. Si una suscripción sube de precio en julio, consultar meses pasados (marzo) recalcula retroactivamente el presupuesto de marzo con la tarifa incrementada de julio. Debe acotarse por `date <= monthEnd`.
3. **Discrepancia en Alertas Presupuestarias al 80%:**  
   En `renderCatTab`, el texto de aviso ámbar evalúa `Math.round(amt / budget * 100) >= 80` (línea 5183), mientras que la coloración de la barra evalúa `amt >= budget * 0.8` (línea 5257). Un gasto de 79,99 € con presupuesto de 100 € redondea a 80% (texto ámbar) pero muestra la barra en verde/color base.

---

### DOMINIO 9: Privacidad, Seguridad de Datos & Modo Privado (Agente 9)

#### 9.1 Fuga Masiva en Modo Privado y Regresión de Gráficos
1. **Fuga en Pantallas de Detalle:**  
   El Modo Privado actual únicamente enmascara 7 selectores de la pantalla de Inicio. En **Categorías**, **Cuentas**, **Análisis** y notas de balance, el 100% de los importes financieros, presupuestos, saldos reales bancarios y estadísticas históricas se renderizan en texto claro.
2. **Regresión en Gráficos e Interactividad:**  
   Las reglas de `html.privacy-mode` difuminan los lienzos `<canvas>` de `#lineChartCanvas` y `#barChartCanvas` y la cuadrícula `.heatmap-grid` con `pointer-events: none`, destruyendo la visualización de la forma de las curvas financieras e impidiendo interactuar con ellas.
3. **Desconexión con Privacidad de Inversión:**  
   Activar el Modo Privado global (`isPrivacyMode()`) no activa la privacidad de cartera (`portfolioValueHidden()`). Los importes de inversión y su inclusión en el saldo de cuentas bancarias permanecen visibles a menos que el usuario active manualmente ambos interruptores independientes.

#### 9.2 Vulnerabilidades de Seguridad y Criptografía
1. **Denegación de Servicio (Bucle Infinito ReDoS) en `hlText` (`index.html:2685-2696`):**  
   Si el usuario introduce en la caja de búsqueda un carácter diacrítico puro (ej. acento agudo aislado `´`), `normStr` retorna una cadena vacía `""`. `makeDiacriticRegex` compila `new RegExp("", "gi")`. Al ejecutar `regex.exec(s)`, la coincidencia de longitud cero no incrementa `regex.lastIndex`, entrando en un bucle `while` infinito que congela el navegador al 100% de uso de CPU.
2. **Inyección en Atributos `onclick` con `t.id` (`index.html:5021, 5042`):**  
   Atributos concatenados directamente como `onclick="editTx('"+t.id+"')"` no escapan `t.id`. En movimientos importados desde fuentes externas manipuladas, una comilla simple rompería la sintaxis y permitiría ejecución de scripts arbitrarios. Debe sustituirse por delegación de eventos (`data-id="${htmlEscape(t.id)}"`).
3. **Fugas Residuales en Cierre de Sesión:**  
   `signOut()` omite borrar `ft_invest_recent_assets_<uid>`, `ft_default_account_<uid>`, y no resetea variables en memoria como `searchQuery` o `filterAccount`, dejando restos de actividad en sesiones compartidas.

---

### DOMINIO 10: Calidad de Código, Deuda Técnica & Modularidad (Agente 10)

#### 10.1 Anatomía del Monolito y Riesgo de Single Point of Failure
`index.html` contiene 9.879 líneas, de las cuales 7.287 líneas consecutivas residen en un único bloque `<script>` que evalúa de forma síncrona más de 442 KB de código. Un único error tipográfico o sintáctico en cualquier línea aborta la ejecución completa del motor, impidiendo ocultar la pantalla de carga.

#### 10.2 Inventario de Código Muerto y Violaciones de Decisión
1. **16 Funciones Muertas (0 llamadas en todo el código):**  
   `toggleGlobalPrivateMode`, `localIsoDate`, `isCategoryExcludedFromBalance`, `startSetPin`, `enableBio`, `toggleAutoBackup`, `isTxExcludedExpense`, `accountVoidDelta`, `accountRealBalance`, `reconcileAccountToTheoretical`, `ensureBalanceAdjustmentCategory`, `saveBalanceAdjustmentFallback`, `bindAssetGraph`, `setExcludeFromCalc`, `daysBetween`, `exportDailyBalanceRange`.
2. **7 Variables Globales Huérfanas:**  
   `ACCENT_COLORS`, `donutChart`, `barChart`, `lineChart`, `dtDonutChart`, `isExcludeFromCalc`, `_centerValues`.
3. **Violación de Decisión Vinculante del Usuario (§12 de `PROJECT_CONTEXT.md`):**  
   `index.html:9597-9605` captura atajos de teclado globales en escritorio ('n', 'p', '/'), contraviniendo directamente la decisión descartada el 2026-09-08 que prohibió atajos alfanuméricos globales en escritorio.
4. **Cachés No Purgadas en Logout:**  
   `_catIconsCache`, `_rbCache`, `_historyCache`, `_lastDonutEntries`, `_lastHmByDay` y `assetDetailState` persisten en memoria al cerrar sesión, provocando contaminación cruzada entre usuarios.
5. **Duplicación Móvil vs Escritorio:**  
   `renderDonut` (móvil) y `dtRenderDonut` (escritorio) duplican más de 120 líneas de código Canvas con divergencias de comportamiento ante eventos táctiles.

---

## 3. Matriz Consolidada de Priorización: Impacto vs. Esfuerzo

Se clasifican todos los hallazgos y medidas de los 10 dominios según su Impacto (Alto / Medio / Bajo), Esfuerzo (Alto / Medio / Bajo), Nivel de Prioridad (P0, P1, P2, P3) y Fase Asignada:

| ID | Dominio | Descripción Técnica del Hallazgo / Acción | Impacto | Esfuerzo | Prioridad | Fase Asignada |
|---|---|---|:---:|:---:|:---:|:---:|
| **AC-01** | Contabilidad | Filtrar `isTxExcludedFromBalance(t)` en `accountTxDelta` y `accountTouchesAccount` para erradicar filtración del Modo 2 en saldos | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **AC-02** | Contabilidad | Estandarizar redondeo en notación exponencial `roundMoney` eliminando fallo IEEE-754 de `Number.EPSILON` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **AC-03** | Contabilidad | Utilizar RPC atómica `save_fintrack_balance_adjustment` en `applyBalanceAdjustment` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **INV-01**| Inversiones | Sustituir borrado/alta no atómico en edición de inversión por `update_fintrack_investment_operation` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **INV-02**| Inversiones | Bloquear edición de traspasos de inversión en `editTx` e impedir que `saveTx` sobreescriba `tags: []` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **REC-01**| Recurrencias | Aplicar `stopFields` en cuotas pasadas al desactivar recurrencia en `saveTx` evitando resurrección de series | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **SEC-01**| Seguridad | Subsanar bucle infinito ReDoS en `hlText` ante diacríticos aislados en buscador de transacciones | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **SYNC-01**| Sincronización| Eliminar borrado destructivo de `ft_queue_<uid>` en `signOut()` preservando cola offline confirmada | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **PRIV-01**| Privacidad | Retirar blur de `#lineChartCanvas` y `#barChartCanvas`; implementar difuminado semántico global en todas las pestañas | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **PRIV-02**| Privacidad | Unificar Modo Privado e Inversiones: `isPrivacyMode()` activa forzosamente `portfolioValueHidden()` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **SW-01** | ServiceWorker | Añadir dependencias vendor (`jspdf`, `exceljs`) al array `PRECACHE` de `serviceworker.js` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **SW-02** | ServiceWorker | Corregir fallo lógico de Promise en fallback de navegación (`serviceworker.js:44`) y añadir `ignoreSearch: true` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **SW-03** | ServiceWorker | Prevenir cierre de sesión involuntario offline en `onAuthStateChange` ante fallos de red al refrescar token | **Alto** | **Medio** | **P0** | **Fase 1** |
| **SYNC-02**| Sincronización| Mover reconciliación de `offlineQueue` en `loadData()` antes del corte `if(isOffline) return false` | **Alto** | **Bajo** | **P0** | **Fase 1** |
| **UI-01**  | Diseño / UX | Retirar botón redundante `#homeAnnualBtn` de la cabecera eliminando colisiones de hit-target con `#prevMonth` | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **UI-02**  | Diseño / UX | Reubicar `.undo-toast` en la parte superior (*Dynamic Island*) eliminando colisión con el botón flotante `.fab` | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **UI-03**  | Diseño / UX | Corregir doble opacidad en el Libro Mayor: `.tx-item` con fondo transparente devolviendo pureza a `.tx-group-card` | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **UI-04**  | Diseño / UX | Garantizar tap target de 44×44 px en `.header-gear`, `.color-swatch` y botón de privacidad de cartera | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **UI-05**  | Diseño / UX | Incorporar `lockBodyScroll()` en `openAssetSheet`, `openSyncTray`, `confirmCriticalAction` y modales de inversión | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **UI-06**  | Diseño / UX | Ocultar tirador modal en escritorio: `@media(min-width:768px){ .modal-handle { display:none!important; } }` | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **UX-01**  | UX / Flujos | Botón global "Limpiar filtros" en panel de búsqueda de transacciones (ahorra 5 operaciones manuales) | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **UX-02**  | UX / Flujos | Eliminar botones redundantes "Cerrar" en modales auto-descartables (`#exportModalBg`, `#monthModalBg`) | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **UX-03**  | UX / Flujos | Eliminar botón `#adjustSignToggle` (±) y botón "Conciliar (0 € desfase)" en reconciliación de saldos | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **UX-04**  | UX / Flujos | Habilitar botón flotante `#fabBtn` en pestañas Cuentas y Categorías (evita navegar a Inicio para registrar) | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **UX-05**  | UX / Flujos | Barra de acción adhesiva (`position: sticky; bottom: 0;`) para botón Guardar en `#modalBg` sobre teclado virtual | **Alto** | **Medio** | **P1** | **Fase 2** |
| **UX-06**  | UX / Flujos | Extender gesto de arrastre (drag-to-dismiss) a `.asset-sheet` y cierre en cascada tras compra/venta | **Alto** | **Medio** | **P1** | **Fase 2** |
| **PERF-01**| Rendimiento | Desacoplar `supabase-js.min.js` con `defer` y mover bajo CSS eliminando bloqueo del parser en `<head>` | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **PERF-02**| Rendimiento | Eliminar link render-blocking de Google Fonts; confiar en Inter WOFF2 local precacheada | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **PERF-03**| Rendimiento | Erradicar layout thrashing en swipe-to-delete cacheando `offsetWidth` en `touchstart` | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **PERF-04**| Rendimiento | Revocar Blob Object URLs con `URL.revokeObjectURL(url)` en todas las rutinas de exportación | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **INV-03** | Inversiones | Corregir truncamiento de participaciones y NAV a 2 decimales creando parser de alta precisión | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **INV-04** | Inversiones | Corregir clasificación de ETFs en Asset Allocation reconociendo `"exchange traded fund"` | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **INV-05** | Inversiones | Subsanar fuga visual de importe en modal de compra/venta en modo participaciones bajo modo privado | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **INV-06** | Inversiones | Corregir errata en `deleteAccount`: evaluar `op.investment_account_id === id` en vez de `op.account_id` | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **REC-02** | Recurrencias | Permitir cambio de día ancla (`recur_anchor_date`) al editar fecha de cuota con opción "futuras" | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **BUD-01** | Presupuestos | Armonizar umbral del 80% en Categorías: alinear condición de texto `used >= 80` con barra `amt >= budget * 0.8` | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **CODE-01**| Código / QA | Purgar simétricamente todas las cachés en `signOut()` (`_rbCache`, `_catIconsCache`, `_historyCache`, etc.) | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **CODE-02**| Código / QA | Subsanar omisión de invalidación de cachés en `deleteTx()` y `restoreTx()` (`invalidateTxIndices`, etc.) | **Alto** | **Bajo** | **P1** | **Fase 2** |
| **CODE-03**| Código / QA | Retirar atajos globales en escritorio ('n', 'p', '/') en cumplimiento de decisión vinculante descartada | **Medio** | **Bajo** | **P1** | **Fase 2** |
| **SYNC-03**| Sincronización| Ampliar reconciliación de `offlineQueue` en `loadData` para categories, accounts, budgets y patrimony | **Alto** | **Medio** | **P1** | **Fase 3** |
| **SYNC-04**| Sincronización| Aislar fallos en `processOfflineQueue`: abortar lote ante fallos de servidor previniendo cascada 23503 | **Alto** | **Medio** | **P1** | **Fase 3** |
| **SYNC-05**| Sincronización| Implementar retroceso exponencial con fluctuación (exponential backoff & jitter) en cola offline | **Alto** | **Bajo** | **P1** | **Fase 3** |
| **SYNC-06**| Sincronización| Proteger `processOfflineQueue` contra concurrencia multitestaña mediante Web Locks API | **Medio** | **Medio** | **P2** | **Fase 3** |
| **SW-04** | ServiceWorker | Reducir timeout de navegación en `serviceworker.js` de 4.5s a 1.2s o implementar Navigation Preload | **Medio** | **Medio** | **P2** | **Fase 3** |
| **SW-05** | ServiceWorker | Resolver paradoja IndexedDB / LocalStorage en `saveSecureLocalCache` aislando derivación de clave | **Alto** | **Medio** | **P2** | **Fase 3** |
| **SEC-02** | Seguridad | Cifrar `offlineQueue` y `syncIssues` en almacenamiento en reposo | **Alto** | **Medio** | **P2** | **Fase 3** |
| **SW-06** | ServiceWorker | Coordinar activación del SW: toast no invasivo de actualización sin purga destructiva inmediata | **Medio** | **Medio** | **P2** | **Fase 3** |
| **SW-07** | ServiceWorker | Integrar `navigator.storage.persist()` blindando datos locales contra desalojo en Safari iOS | **Medio** | **Bajo** | **P2** | **Fase 3** |
| **DB-01**  | Backend DB | Crear migración de esquema base (`20260701000000_baseline_schema.sql`) con DDL de tablas iniciales | **Alto** | **Medio** | **P2** | **Fase 3** |
| **DB-02**  | Backend DB | Publicar tablas operativas a `supabase_realtime` en migración SQL formal | **Medio** | **Bajo** | **P3** | **Fase 3** |
| **DB-03**  | Backend DB | Corregir colisión multitenant en `repair_fintrack_balance_adjustments` espaciando IDs por usuario | **Medio** | **Bajo** | **P2** | **Fase 3** |
| **PERF-05**| Rendimiento | Precalcular tokens normalizados en transacciones (`_normToken`) reduciendo CPU en búsqueda en 90% | **Alto** | **Medio** | **P1** | **Fase 3** |
| **PERF-06**| Rendimiento | Insertar filas con `insertAdjacentHTML` en paginación "Ver más" en vez de regenerar todo el DOM | **Alto** | **Medio** | **P1** | **Fase 3** |
| **PERF-07**| Rendimiento | Desconectar y acotar `MutationObserver` globales sobre `document.body` activándolos solo en Inversión | **Alto** | **Medio** | **P1** | **Fase 3** |
| **INV-07** | Inversiones | Ordenación secundaria en `investmentPositionList`: Compras antes que Ventas en misma fecha | **Medio** | **Bajo** | **P2** | **Fase 3** |
| **INV-08** | Inversiones | Distintivo visual y fecha cuando se presente un NAV de respaldo estático en fondos | **Medio** | **Medio** | **P2** | **Fase 3** |
| **INV-09** | Inversiones | Corregir desfase de zona horaria en tooltip de gráfico de activo y acotar desbordamiento horizontal | **Medio** | **Bajo** | **P2** | **Fase 3** |
| **BUD-02** | Presupuestos | Portar lógica `autoRecurBudgetBreakdown` a Edge Function `monthly-report` para informe PDF por email | **Alto** | **Medio** | **P1** | **Fase 3** |
| **BUD-03** | Presupuestos | Acotar `latest` por `date <= monthEnd` en presupuestos impidiendo distorsión de meses pasados | **Bajo** | **Bajo** | **P2** | **Fase 3** |
| **CODE-04**| Código / QA | Erradicar 16 funciones muertas y 7 variables globales huérfanas aligerando el script en ~250 líneas | **Medio** | **Bajo** | **P2** | **Fase 3** |
| **CODE-05**| Código / QA | Unificar carga de librerías vendor asegurando `loadScript()` antes de llamadas directas | **Alto** | **Bajo** | **P2** | **Fase 3** |
| **CODE-06**| Código / QA | Unificar duplicación móvil/escritorio (`renderDonut` vs `dtRenderDonut`, etc.) | **Alto** | **Medio** | **P2** | **Fase 3** |
| **UI-07**  | Diseño | Estandarizar desenfoques `backdrop-filter` a 2 niveles canónicos (`var(--glass-blur)` y `blur(20px)`) | **Medio** | **Medio** | **P2** | **Fase 3** |
| **UI-08**  | Diseño | Unificar radios de tarjetas Hero: fijar `.portfolio-card` a 20px homogéneo con `.pat-total-card` | **Medio** | **Bajo** | **P2** | **Fase 3** |
| **UI-09**  | Diseño | Reconciliar anchos máximos en escritorio: alinear secundarias a 840px eliminando saltos bruscos | **Medio** | **Medio** | **P2** | **Fase 3** |
| **UX-07**  | UX / Flujos | Píldoras de selección rápida de 5 categorías frecuentes en modal de transacción (ahorra rueda nativa) | **Alto** | **Medio** | **P2** | **Fase 4** |
| **PERF-08**| Rendimiento | Reemplazar 740 botones ocultos en Categorías por un modal selector de iconos/color compartido | **Medio** | **Medio** | **P2** | **Fase 4** |
| **PERF-09**| Rendimiento | Renderizado perezoso de tablas históricas de cuentas en vez de pre-generarlas ocultas en DOM | **Medio** | **Bajo** | **P2** | **Fase 4** |
| **INV-10** | Inversiones | Persistir `_quoteCache` en IndexedDB/localStorage mitigando rate limits de Twelve Data y soportando offline | **Alto** | **Medio** | **P2** | **Fase 4** |
| **SEC-03** | Seguridad | Incorporar meta-etiqueta Content Security Policy (CSP) en `<head>` de `index.html` | **Medio** | **Medio** | **P2** | **Fase 4** |
| **SEC-04** | Seguridad | Migrar atributos `onclick="editTx(t.id)"` a delegación de eventos con `data-id` escapado | **Bajo** | **Medio** | **P3** | **Fase 4** |
| **CODE-07**| Código / QA | Activar `"use strict"` e implementar script de validación semántica/linting para scripts embebidos | **Alto** | **Medio** | **P2** | **Fase 4** |
| **CODE-08**| Código / QA | Modularización progresiva del monolito en scripts independientes por dominio respetando zero-bundler | **Alto** | **Alto** | **P3** | **Fase 4** |
| **INV-11** | Inversiones | Rediseño contable para plusvalías realizadas desvinculando saldo negativo en cuenta de inversión | **Alto** | **Alto** | **P3** | **Fase 4** |

---

## 4. Hoja de Ruta de Implementación por Fases Secuenciales

```
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                  CRONOGRAMA DE IMPLEMENTACIÓN POR FASES                          |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|  FASE 1: Integridad Financiera, Transaccionalidad Atómica & Blindaje Crítico (P0)                |
|  └──> Corrección inmediata de cálculo de saldos, RPCs atómicas, prevención de pérdida de datos    |
|                                                                                                  |
|  FASE 2: Consistencia del Sistema de Diseño, Ergonomía Táctil & Simplificación de Flujos (P1)   |
|  └──> Unificación Liquid Glass, erradicación de colisiones de hitboxes, tap targets, botones red. |
|                                                                                                  |
|  FASE 3: Resiliencia Offline-First, Blindaje de Cola, Caché & Sincronización Backend (P1-P2)   |
|  └──> Reconciliación completa en loadData, backoff exponencial, DDL base, soporte offline PWA    |
|                                                                                                  |
|  FASE 4: Rendimiento Avanzado, Poda de Deuda Técnica & Modularidad Zero-Bundler (P2-P3)          |
|  └──> Píldoras de categorías rápidas, desdoblamiento del monolito en archivos nativos limpios    |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

### FASE 1: Integridad Financiera, Transaccionalidad Atómica & Blindaje Crítico (P0 / Inmediata)

**Objetivo:** Eliminar de forma inmediata todos los riesgos de pérdida de datos, corrupción del libro mayor contable y quiebra de invariantes nucleares sin alterar la arquitectura física de archivos.

#### Entregables y Modificaciones Específicas:
1. **Contabilidad Tri-Estado (`AC-01`):**  
   - Modificar `accountTxDelta(t, accountId)` (`index.html:5475`) para incorporar `if(isTxExcludedFromBalance(t)) return 0;`.
   - Modificar `accountTouchesAccount(t, accountId)` (`index.html:5487`) para incorporar `!isTxExcludedFromBalance(t)`.
2. **Aritmética Financiera Precisa (`AC-02`):**  
   - Reemplazar `roundMoney(n)` (`index.html:2925`) por la fórmula exponencial libre de deriva IEEE-754:
     ```javascript
     function roundMoney(val){
       var n = Number(val);
       if(!Number.isFinite(n)) return 0;
       return Number(Math.round(Number(n + 'e+2')) + 'e-2');
     }
     ```
   - Sustituir todas las 15 invocaciones ad-hoc `Math.round(x * 100) / 100` por llamadas a `roundMoney(x)`.
3. **Persistencia Atómica de Ajustes de Saldo (`AC-03`):**  
   - Refactorizar `applyBalanceAdjustment` (`index.html:5614`) para invocar `sb.rpc('save_fintrack_balance_adjustment', { snapshot: item, adjustment: adjustment })`, eliminando las dos llamadas REST separadas.
4. **Edición Atómica de Operaciones de Inversión (`INV-01`, `INV-02`):**  
   - En `openInvestmentOperationEdit` (`index.html:6689`), sustituir la secuencia de borrado y alta por una única llamada a `sb.rpc('update_fintrack_investment_operation', { ... })`.
   - En `editTx` (`index.html:7036`), comprobar explícitamente si la transacción procede de inversión (`t.category === 'investment' || investmentOperations.some(...)`) y redirigir con toast pedagógico hacia la pestaña Inversión para su edición segura.
   - En `saveTx` (`index.html:7209`), preservar las etiquetas existentes en transferencias en vez de fijar `tags: []`.
5. **Prevención de Resurrección de Recurrencias (`REC-01`):**  
   - En `saveTx` (`index.html:7254`), cuando `payload.recurring === false` y se selecciona `future`, aplicar `stopFields` a las cuotas pasadas idéntico a `deleteRecurringFromHere`.
6. **Seguridad DoS en Búsqueda (`SEC-01`):**  
   - En `hlText` / `makeDiacriticRegex` (`index.html:2685`), validar `if(!pattern) return htmlEscape(s);` y forzar `regex.lastIndex++` si `match.index === regex.lastIndex` evitando bloqueos infinitos de CPU.
7. **Preservación de Cola Offline en Logout (`SYNC-01`):**  
   - En `signOut()` (`index.html:6823`), suprimir la eliminación de `ft_queue_<uid>` si el usuario confirma que desea conservar sus cambios pendientes para su próxima sesión.
8. **Restauración de Gráficos en Modo Privado (`PRIV-01`, `PRIV-02`):**  
   - Eliminar `#lineChartCanvas`, `#barChartCanvas` y `.heatmap-grid` de la regla `html.privacy-mode` en `index.html:1516`.
   - Extender la regla de desenfoque CSS a los selectores de importes en Categorías, Cuentas y Análisis.
   - Forzar en `isPrivacyMode()` que `portfolioValueHidden()` se evalúe como verdadero.
9. **Resiliencia Básica del Service Worker (`SW-01`, `SW-02`, `SW-03`, `SYNC-02`):**  
   - Añadir `./vendor/jspdf.umd.min.js` y `./vendor/exceljs.min.js` a `PRECACHE` en `serviceworker.js`.
   - Corregir el retorno de Promise en `serviceworker.js:44` con encadenamiento `.then()` y `{ ignoreSearch: true }`.
   - En `loadData()` (`index.html:3839`), mover la aplicación de `offlineQueue` antes del corte `if(isOffline) return false`.
   - En `onAuthStateChange` (`index.html:9860`), no forzar `showAuth()` si la pérdida de sesión se debe a un error de red al refrescar el token en modo offline.

---

### FASE 2: Consistencia del Sistema de Diseño, Ergonomía Táctil & Simplificación de Flujos (P1 / Alta)

**Objetivo:** Perfeccionar la fidelidad estética Liquid Glass, erradicar colisiones geométricas táctiles y eliminar la sobrecarga de controles redundantes en los flujos diarios de usuario.

#### Entregables y Modificaciones Específicas:
1. **Limpieza de Cabecera y Erradicación de Colisiones Táctiles (`UI-01`):**  
   - Eliminar el botón `#homeAnnualBtn` de la cabecera móvil en `index.html:2235`. Despeja 38 px de margen horizontal, erradicando el solapamiento de áreas táctiles con `#prevMonth`.
2. **Reubicación Ergonómica del Toast de Deshacer (`UI-02`):**  
   - Mover `.undo-toast` a la posición superior canónica (*Dynamic Island*) en `top: calc(16px + var(--safe-top)); transform: translateX(-50%) translateY(-20px);`, despejando el FAB flotante en el tercio inferior.
3. **Pureza Liquid Glass en el Libro Mayor (`UI-03`):**  
   - Cambiar `.tx-group-card .tx-item` a `background: transparent;`, eliminando la doble opacidad acumulativa del 85.6% y devolviendo la transparencia reactiva de cristal a la tarjeta.
4. **Garantía Universal de Tap Targets de 44×44 px (`UI-04`, `UI-05`, `UI-06`):**  
   - Asignar pseudoelemento `::after` a `.header-gear`, `.color-swatch` y al botón de visibilidad de saldo en Cartera.
   - Incorporar `lockBodyScroll()` en `openAssetSheet`, `openSyncTray`, `confirmCriticalAction` y modales de operativa.
   - Ocultar `.modal-handle` en escritorio mediante `@media(min-width:768px){ .modal-handle { display:none!important; } }`.
5. **Simplificación Operativa de Flujos Móviles (`UX-01`, `UX-02`, `UX-03`, `UX-04`, `UX-05`, `UX-06`):**  
   - Incorporar botón visible "Limpiar filtros" en el panel de búsqueda de transacciones.
   - Suprimir botones redundantes "Cerrar" en `#exportModalBg` y `#monthModalBg`.
   - Suprimir botón de signo `#adjustSignToggle` (±) y botón "Conciliar (0 € desfase)" en ajuste de saldos.
   - Habilitar la visibilidad de `#fabBtn` en pestañas Cuentas (Tab 2) y Categorías (Tab 1) modificando la condición `i !== 0`.
   - Implementar barra de acción adhesiva (`position: sticky; bottom: 0;`) en `.modal-btns` para permitir guardar gastos con teclado virtual desplegado.
   - Incorporar gesto de arrastre para cerrar (*drag-to-dismiss*) en `.asset-sheet` y cierre en cascada tras confirmar operación en `.investment-trade-modal`.
6. **Optimización de Carga y Rendimiento en Head (`PERF-01`, `PERF-02`, `PERF-03`, `PERF-04`):**  
   - Añadir `defer` a `supabase-js.min.js` y reubicarlo inmediatamente antes de la lógica principal.
   - Eliminar el enlace render-blocking a Google Fonts, apoyándose en la fuente local precacheada `inter-latin-wght-normal.woff2`.
   - Cachear `offsetWidth * 0.38` en `touchstart` dentro del listener de swipe-to-delete, eliminando el layout thrashing en cada frame de movimiento táctil.
   - Añadir `setTimeout(function(){ URL.revokeObjectURL(url); }, 1000)` tras invocar `a.click()` en todas las rutinas de exportación.
7. **Correcciones en Inversiones y Recurrencias (`INV-03`, `INV-04`, `INV-05`, `INV-06`, `REC-02`, `BUD-01`):**  
   - Implementar `parseUnitsInput()` permitiendo hasta 6 decimales en participaciones y 4 decimales en NAVs.
   - Corregir `normalizeAssetType` para reconocer `"exchange traded fund"` y clasificarlo como `"ETFs"`.
   - Enmascarar con `'••••••'` el total en euros en el modal de operativa si la privacidad está activa.
   - Corregir la errata en `deleteAccount`: evaluar `op.investment_account_id === id`.
   - Permitir actualizar `recur_anchor_date` al desplazar fechas de cuotas recurrentes con opción "futuras".
   - Alinear la condición del umbral del 80% en Categorías entre texto y barra de progreso.
8. **Saneamiento de Deuda Técnica Inmediata (`CODE-01`, `CODE-02`, `CODE-03`):**  
   - Purgar simétricamente `_rbCache`, `_catIconsCache`, `_historyCache` y desgloses en `signOut()`.
   - Invocar `txVersion++`, `invalidateTxIndices()` y `clearBalanceCache()` en `deleteTx()` y `restoreTx()`.
   - Retirar los listeners de teclas alfanuméricas globales en escritorio ('n', 'p', '/') en cumplimiento del §12 de `PROJECT_CONTEXT.md`.

---

### FASE 3: Resiliencia Offline-First, Blindaje de Cola, Caché & Sincronización Backend (P1-P2)

**Objetivo:** Fortalecer la sincronización bidireccional, proteger contra pérdida de datos en caídas prolongadas de red, alinear la infraestructura remota de Supabase y optimizar el procesamiento en segundo plano.

#### Entregables y Modificaciones Específicas:
1. **Blindaje de la Cola de Sincronización (`SYNC-03`, `SYNC-04`, `SYNC-05`, `SYNC-06`):**  
   - Ampliar el bucle de reconciliación en `loadData()` para integrar mutaciones offline de `categories`, `accounts`, `budgets` y `patrimony`.
   - Aislar fallos en `processOfflineQueue`: si una operación arroja un error transitorio de red o 5xx, abortar la ejecución del lote preservando el orden FIFO y evitando que operaciones hijas fallen por clave foránea 23503 hacia la dead-letter queue.
   - Implementar backoff exponencial con jitter aleatorio para los reintentos de la cola offline en lugar del `setTimeout` fijo a 500 ms.
   - Envolver `processOfflineQueue` en `navigator.locks.request('fintrack_sync_' + uid)` para prevenir colisiones multitestaña.
2. **Alineación de Base de Datos y Migraciones (`DB-01`, `DB-02`, `DB-03`):**  
   - Crear la migración canónica `20260701000000_baseline_schema.sql` conteniendo el DDL completo de todas las tablas base (`accounts`, `categories`, `transactions`, `patrimony`, `budgets`, etc.) y sus políticas RLS iniciales.
   - Añadir migración con `ALTER PUBLICATION supabase_realtime ADD TABLE ...` para todas las tablas operativas.
   - Corregir `repair_fintrack_balance_adjustments` para generar IDs de categorías de ajuste vinculados al `uid` (`'cat_balance_adjustment_expense_' || replace(uid::text,'-','')`).
3. **Optimización de Búsqueda y Renderizado en Monolito (`PERF-05`, `PERF-06`, `PERF-07`):**  
   - Precalcular el token de búsqueda normalizado `_normToken` al indexar transacciones en memoria, reduciendo el coste de búsqueda por texto de 85 ms a <8 ms.
   - Refactorizar la paginación "Ver más" de movimientos para anexar nuevas filas con `insertAdjacentHTML` en vez de destruir todo el listado.
   - Desconectar los `MutationObserver` globales sobre `document.body` y asociarlos exclusivamente al montaje de la pestaña Inversión.
4. **Sincronización de Previsión en Edge Function `monthly-report` (`BUD-02`, `BUD-03`):**  
   - Portar la lógica de `autoRecurBudgetBreakdown` al entorno Deno de `monthly-report` para que el PDF enviado por email refleje el presupuesto automático de suscripciones en vez de 0,00 €.
   - Acotar `latest` por `date <= monthEnd` en el cálculo de presupuestos impidiendo distorsiones retroactivas.
5. **Mejoras en Inversiones y Resiliencia de Service Worker (`INV-07`, `INV-08`, `INV-09`, `SW-04`, `SW-05`, `SEC-02`, `SW-06`, `SW-07`):**  
   - Ordenación secundaria en `investmentPositionList`: compras antes que ventas en fechas idénticas.
   - Presentar aviso visual y fecha cuando se use un NAV de respaldo estático en fondos.
   - Corregir desfase de zona horaria en tooltip del gráfico de activo y acotar desbordamiento.
   - Reducir el timeout de navegación del SW a 1.200 ms.
   - Resolver la paradoja de `saveSecureLocalCache` independizando la clave o aislando la captura de errores.
   - Cifrar `offlineQueue` y `syncIssues` en reposo en `localStorage`.
   - Coordinar la actualización del Service Worker mediante aviso al usuario en vez de `skipWaiting()` descontrolado.
   - Invocar `navigator.storage.persist()` para proteger la PWA contra el desalojo de 7 días en Safari iOS.
6. **Poda de Código Muerto y Calidad (`CODE-04`, `CODE-05`, `CODE-06`, `UI-07`, `UI-08`, `UI-09`):**  
   - Eliminar las 16 funciones y 7 variables globales muertas documentadas en el Dominio 10.
   - Unificar llamadas a `loadScript()` antes de utilizar `jspdf` o `exceljs`.
   - Unificar componentes duplicados de gráficos Donut entre móvil y escritorio.
   - Estandarizar desenfoques CSS a dos niveles y armonizar anchos máximos de escritorio en 1200px y 840px.

---

### FASE 4: Rendimiento Avanzado, Poda de Deuda Técnica & Modularidad Zero-Bundler (P2-P3)

**Objetivo:** Culminar la optimización ergonómica avanzada, reducir la huella del DOM y transformar la estructura interna del código monolítico en módulos limpios por dominio sin recurrir a empaquetadores ni herramientas de compilación.

#### Entregables y Modificaciones Específicas:
1. **Píldoras de Categorías Rápidas en Transacciones (`UX-07`):**  
   - Implementar carrusel horizontal con las 5 categorías más frecuentes bajo el campo de importe en `#modalBg`, permitiendo registrar el 80% de movimientos con 3 toques.
2. **Reducción de Huella DOM Oculta (`PERF-08`, `PERF-09`):**  
   - Sustituir los 740 botones ocultos de paleta de color e icono en Categorías por una única hoja modal compartida.
   - Renderizar de forma perezosa las tablas históricas de saldos de cuentas bajo demanda al expandir el acordeón.
3. **Persistencia y Blindaje de Cotizaciones (`INV-10`):**  
   - Persistir `_quoteCache` en IndexedDB/localStorage con TTL inteligente, permitiendo consultar cotizaciones recientes en modo offline y mitigando los límites de Twelve Data.
4. **Endurecimiento de Seguridad y Content Security Policy (`SEC-03`, `SEC-04`):**  
   - Incorporar meta-etiqueta CSP en `<head>` de `index.html` limitando script-src y connect-src a los orígenes requeridos.
   - Migrar atributos `onclick="editTx(t.id)"` a delegación de eventos con `data-id`.
5. **Calidad de Código y Validación Estática (`CODE-07`):**  
   - Activar la directiva `"use strict"` en todos los bloques funcionales y dotar a `scripts/validate-syntax.js` de validación semántica contra variables no declaradas.
6. **Modularización del Monolito Zero-Bundler (`CODE-08`):**  
   - Desglosar las 7.287 líneas de JavaScript en archivos independientes por dominio cargados de forma nativa en el navegador mediante tags `<script defer>` o módulos ES (`type="module"`), preservando la ausencia de build tools:
     - `js/core.js`: Inicialización, Supabase client, Web Crypto y utilidades de escape.
     - `js/accounting.js`: Motor financiero, `roundMoney`, contabilidad tri-estado y desfases.
     - `js/sync.js`: Cola offline, reconciliación y manejadores de conectividad.
     - `js/recurring.js`: Motor de recurrencias, series y presupuestos automáticos.
     - `js/investments.js`: Cartera viva, cotizaciones de mercado y operativa.
     - `js/charts.js`: Donut líquido Retina, gráficos Canvas anuales y Sparklines.
     - `js/ui.js`: Controladores de vistas, modales, ergonomía táctil y eventos.
7. **Diseño Contable Evolutivo de Plusvalías Realizadas (`INV-11`):**  
   - Diseñar la solución contable que registre las ganancias patrimoniales de ventas en los ingresos de resultado o desvincule el saldo negativo de la cuenta de inversión en la pestaña Cuentas.

---

## 5. Evaluación de Riesgos de Regresión y Estrategias de Mitigación

| Fase | Riesgo de Regresión Identificado | Modo de Fallo / Impacto Potencial | Estrategia Técnica de Mitigación |
|---|---|---|---|
| **Fase 1** | Modificación de `accountTxDelta` con `isTxExcludedFromBalance` | Salto de saldo aparente para usuarios con transacciones antiguas en Modo 2 | Los saldos actuales estaban inflados artificialmente con anotaciones informativas. El cambio restaura la verdad contable especificada en el contrato de datos. Documentar en notas de la versión. |
| **Fase 1** | Sustitución de `roundMoney` por notación exponencial | Desviación de 1 céntimo en importes históricos de mitad de céntimo | Afecta exclusivamente a la frontera $0.005$ donde la representación binaria provocaba truncamiento defectuoso. Validar con batería de pruebas unitarias (`scripts/audit-finance-core.js`). |
| **Fase 1** | Paso a RPC atómica `save_fintrack_balance_adjustment` | Incompatibilidad si la firma de parámetros en Postgres difiere | Verificar tipos en `supabase/migrations/20260727090000_balance_adjustment_transactions.sql`. Los parámetros deben coincidir exactamente: `{ snapshot: item, adjustment: adjustment }`. |
| **Fase 1** | Paso a RPC atómica `update_fintrack_investment_operation` | Error de llamada si faltan columnas opcionales en el payload | Contrastar firma en migración `20260923140000`. Probar en entorno de pruebas antes de desplegar en producción. |
| **Fase 1** | Retirar blur de lienzos Canvas en Modo Privado | Parpadeo visual o exposición de cifras en ejes de coordenadas | El Canvas dibuja líneas y barras proporcionales sin texto numérico embebido en la zona de trazado. Los importes numéricos residen en tooltips y leyendas HTML que sí reciben el difuminado semántico. |
| **Fase 1** | Inclusión de vendor (`jspdf`, `exceljs`) en `PRECACHE` | Instalación inicial más lenta en redes móviles (~1.3 MB extra) | Precargar librerías vendor de forma tolerante (`cache.addAll().catch(...)`) para que una red inestable durante la descarga de Excel no aborte la instalación de `index.html`. |
| **Fase 2** | Eliminación de `#homeAnnualBtn` de la cabecera móvil | Desconcierto de usuarios habituados a conmutar modo anual desde Inicio | Mantener accesible la visión anual desde la Pestaña 3 ("Análisis") y desde el filtro de ámbito temporal en el panel de búsqueda de movimientos. |
| **Fase 2** | Reubicación de `.undo-toast` a la zona superior | Superposición con la cabecera o safe-area de la cámara | Utilizar `top: calc(16px + var(--safe-top))` con fondo Liquid Glass `backdrop-filter: blur(30px)` e índice de elevación `z-index: 999` para garantizar legibilidad sin tapar controles. |
| **Fase 2** | Barra de acción adhesiva (`position: sticky`) en modales | Desplazamiento inesperado del botón en navegadores con barra dinámica | Validar con `env(safe-area-inset-bottom)` y `max-height: 94dvh` asegurando que el formulario mantenga scroll independiente sobre el pie fijo. |
| **Fase 3** | Backoff exponencial en cola de sincronización | Demora percibida en sincronizar tras micro-cortes de red transitorios | Resetear inmediatamente el temporizador de reintento a 0 ante el evento nativo `online` del navegador o ante un pull-to-refresh explícito del usuario (`forceSync()`). |
| **Fase 3** | Reconciliación amplia en `loadData()` | Sobreescritura de ediciones concurrentes en múltiples dispositivos | Mantener resolución de conflictos con base en claves primarias (`id`) y timestamps deterministas, idéntico al comportamiento en transacciones. |
| **Fase 4** | Modularización en scripts independientes sin bundler | Errores de referencia `TypeError: is not defined` por orden de carga | Declarar utilidades y estado base en el primer script (`core.js`) y dependientes a continuación, o utilizar módulos ES (`type="module"`) donde el orden de importación es explícito y determinista. |

---

## 6. Protocolo de Verificación, Validación & Control de Calidad

Para verificar de manera exhaustiva e independiente la correcta implementación de las fases sin depender de herramientas de caja negra:

### 6.1 Batería de Validación Automatizada por Comandos
Tras cualquier modificación en el repositorio, es de obligado cumplimiento ejecutar la siguiente suite de verificación en consola PowerShell/Bash:

```powershell
# 1. Validación sintáctica estricta de todos los scripts embebidos en index.html
node scripts/validate-syntax.js
# Criterio: 0 errores sintácticos en los 4 bloques de script.

# 2. Verificación de CERO EMOJIS en el código fuente
$lines = Get-Content 'index.html'
$emojiRegex = [regex]'[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF]'
$count = ($lines | Where-Object { $emojiRegex.IsMatch($_) }).Count
Write-Output "Conteo de Emojis: $count"
# Criterio: Retorna exactamente 0.

# 3. Verificación de Casing de Marca (fintrack en minúsculas)
Select-String -Path "index.html" -Pattern "(FinTrack|Fintrack|FINTRACK)" -CaseSensitive
# Criterio: 0 coincidencias en cadenas visibles al usuario y código activo.

# 4. Verificación de pruebas unitarias financieras y contabilidad
node scripts/audit-finance-core.js
node scripts/audit-agent1-tx-core.js
node scripts/test-math-eval.js
node scripts/simulate-dashboard-stats.js
# Criterio: 100% de aserciones superadas.

# 5. Verificación de invariantes de sincronización y cola offline
powershell -ExecutionPolicy Bypass -File ".agents/teamwork/audit_agent_6/verify_audit.ps1"
# Criterio: Todas las comprobaciones en estado [PASS].
```

### 6.2 Lista de Comprobación Manual en Navegador (Mobile & Desktop)
1. **Prueba de Fuego Tri-Estado (Modo 2):**  
   - Crear un gasto de 500 € con categoría ordinaria y seleccionar cálculo "No computa" (Modo 2).  
   - Verificar en la pestaña Cuentas que el saldo bancario y el Patrimonio Total **no varían**.  
   - Verificar en Inicio que el total de gastos **no varía**.
2. **Prueba de Modo Privado Universal:**  
   - Activar el Modo Privado tocando la tarjeta de Balance o imagotipo `ft.`.  
   - Recorrer Inicio, Categorías, Cuentas, Análisis e Inversión: **todas las cifras numéricas deben lucir difuminadas (`filter: blur(...)`) o enmascaradas con `••••••`**.  
   - Los aros del Donut y las curvas de los gráficos anuales Canvas **deben permanecer nítidos, visibles y con transiciones activas**.
3. **Prueba de Operativa Offline End-to-End:**  
   - Activar Modo Avión en el terminal móvil o poner el Service Worker en `Offline` en DevTools.  
   - Registrar un gasto, crear una categoría y ajustar un saldo.  
   - Comprobar que los cambios se reflejan inmediatamente en la interfaz y que el contador de sincronización se incrementa.  
   - Matar el proceso de la PWA o cerrar la pestaña.  
   - Reabrir la PWA en modo avión: **los datos deben continuar presentes desde la caché cifrada**.  
   - Desactivar Modo Avión: la app debe procesar la cola automáticamente y vaciar los pendientes.
4. **Prueba de Exportación Offline Inmediata:**  
   - Abrir la app en modo offline.  
   - Ir a Ajustes > Exportar > Descargar PDF.  
   - El archivo PDF debe generarse y descargarse de inmediato sin requerir conexión a internet.
5. **Prueba de Erradicación de Colisiones Táctiles:**  
   - En emulador de iPhone 15 Pro, pulsar repetidamente el chevron de mes anterior (`#prevMonth`). Constatar que ya no se dispara accidentalmente la vista anual.
6. **Prueba de Teclado Virtual en Modal:**  
   - Pulsar el FAB (+). Con el teclado desplegado, constatar que la barra con los botones `Guardar` y `Cancelar` permanece fija y accesible por encima del teclado.

---

## 7. Certificación de Conformidad con Invariantes Arquitectónicos

El presente Plan Maestro ha sido examinado y certificado conforme a los principios fundacionales e inviolables de `fintrack`:

| Invariante Nuclear de fintrack | Estado de Conformidad del Plan | Justificación y Garantía Técnica |
|---|:---:|---|
| **1. Cero Build Tools, Cero Bundlers & Cero Frameworks** | **100% CONFORME** | Todas las soluciones propuestas (incluyendo la futura modularización de Fase 4) utilizan estrictamente vanilla JavaScript nativo, CSS estándar y HTML5. Prohibida la introducción de Webpack, Vite, Rollup, Babel, React, Vue o TypeScript compilado en el cliente. |
| **2. Cero Emojis en toda la Aplicación** | **100% CONFORME** | El plan ratifica la prohibición absoluta de glifos Unicode. Todas las categorías, botones, alertas y estados se representan mediante iconos vectoriales monocromáticos SVG en línea con trazo `2.0` o texto semántico. |
| **3. Casing de Marca: `fintrack` en Minúsculas** | **100% CONFORME** | Se exige la erradicación de las 4 referencias residuales de `FinTrack` en comentarios y consola. La marca corporativa permanece invariablemente en caja baja (`fintrack`). |
| **4. Modo Privado: Cifras Difuminadas, Gráficos Intactos** | **100% CONFORME** | Se retira el filtro destructor de los lienzos Canvas y se establece la regla universal de difuminado semántico CSS sobre todas las etiquetas numéricas de la aplicación. |
| **5. Separación Contable: Gasto/Ingreso vs Traspaso** | **100% CONFORME** | El plan preserva la neutralidad de los traspasos y blinda las transacciones de inversión contra sobreescrituras accidentales de tipo en `saveTx`. |
| **6. Cálculo de Desfase: Real vs Teórico** | **100% CONFORME** | Se respeta la separación entre saldo real observado y saldo teórico histórico. Las transacciones de ajuste vinculadas continúan excluidas del saldo teórico (`accountTxDelta` retorna 0). |
| **7. Contabilidad Tri-Estado (Modos 0, 1 y 2)** | **100% CONFORME** | Se subsana la filtración del Modo 2 en `accountTxDelta`, garantizando que las notas informativas no alteren los balances bancarios. |
| **8. Previsión Completa en Presupuestos** | **100% CONFORME** | Se preserva la regla de sumar gastos recurrentes previstos y se extiende el cálculo a la Edge Function `monthly-report` para el informe mensual PDF. |
| **9. Respeto Estricto a Decisiones Descartadas (§12 de `PROJECT_CONTEXT.md`)** | **100% CONFORME** | Se prohíbe reintroducir: botón visible de borrado en móvil (se mantiene swipe), evaluador inline en importe, calculadora en input, atajos de teclado alfanuméricos globales en PC (se retiran en Fase 1), chips de conceptos o proyecciones lineales especulativas de runway. |

---

*Fin del Plan Maestro de Implementación — Authoritative Master Implementation Plan for fintrack.*  
*Redactado y verificado por el Master Plan Consolidator & Lead Architect.*
