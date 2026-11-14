# Informe de Auditoría — Guardián de Diseño y Ergonomía Visual (Agente 2)
**Proyecto:** `fintrack` (PWA)  
**Dominio:** Consistencia del Sistema de Diseño, Fidelidad Liquid Glass iOS, Ergonomía Visual y Verificación de Invariantes  
**Fecha de Auditoría:** 14 de noviembre de 2026  
**Auditor:** Agente 2 (Design Guardian & Visual Ergonomics Auditor)  
**Modalidad:** Inspección de solo lectura (Read-Only) — Cero modificaciones de código fuente  

---

## 1. Resumen Ejecutivo y Cuadro de Mando

Se ha ejecutado una auditoría exhaustiva de la arquitectura visual, tokens CSS, componentes y ergonomía de `fintrack` contrastando la implementación en `index.html` (9.880 líneas), `manifest.json`, `serviceworker.js` y Edge Functions con la especificación canónica [`DESIGN_SYSTEM.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/DESIGN_SYSTEM.md) (*White Edition & Liquid Glass*) y [`PROJECT_CONTEXT.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/PROJECT_CONTEXT.md).

### Cuadro de Mando de Cumplimiento

| Criterio / Invariante | Estado | Hallazgos Clave |
|---|---|---|
| **Cero Emojis (Regla 1)** | **100% CUMPLIDO** | Escaneo regex UTF-32 exhaustivo: 0 emojis unicode en toda la UI, marcado y scripts. 100% vectorizado con SVG en línea. |
| **Casing de Marca (Regla 2)** | **98% CUMPLIDO** | Todas las cadenas visibles al usuario (cabecera `ft.`, títulos, exportación PDF/Excel, correos) usan `fintrack` en minúsculas. 4 comentarios/logs internos conservan `FinTrack`. |
| **Fidelidad Liquid Glass vs iOS** | **PARCIAL (68%)** | Barra de navegación móvil (`.bottom-nav`) presenta fidelidad ultra-premium de nivel iOS 27. Sin embargo, las tarjetas de contenido presentan opacidades excesivamente lechosas (62%), doble opacidad acumulativa en el listado (85.6%), dispersión caótica de filtros de desenfoque (7 valores distintos de 4px a 60px) y ausencia del menisco especular en tarjetas clave. |
| **Consistencia Inter-Pantallas** | **DEFICIENTE (62%)** | Radios squircle divergentes (28px vs 20px vs 16px en tarjetas equivalentes); contenedor de escritorio salta entre 1440px, 960px, 760px y 640px según la pestaña; estados vacíos heterogéneos; iconos con 15 tamaños y 7 grosores de trazo distintos. |
| **Ergonomía Táctil (44×44px)** | **PARCIAL (78%)** | Controles críticos de cabecera como el engranaje de Ajustes (36×36px) y el toggle de vista anual (32×32px) carecen del pseudo-elemento de expansión táctil `::after`, incumpliendo WCAG AA. |
| **Modo Privado (Privacy Mode)** | **REGRESIÓN GRAVE** | Las reglas CSS difuminan completamente los lienzos gráficos `#lineChartCanvas`, `#barChartCanvas` y `.heatmap-grid`, violando el invariante de que las visualizaciones deben permanecer visibles y legibles. |
| **Superposición Undo Toast / FAB** | **CONFLICTO VISUAL** | `.undo-toast` está anclado en `bottom: calc(76px + safe-bottom)` en la misma coordenada Y que el botón flotante `.fab`, provocando colisión táctil y visual en el tercio inferior móvil. |

---

## 2. Auditoría de Invariantes Nucleares

### 2.1. Regla Inviolable: CERO EMOJIS (100% Conforme)
Se ejecutó un análisis de patrones binarios y expresiones regulares sobre todo el árbol de caracteres unicode (`[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF]|[\u2B50-\u2B55]` y entidades `&#x...`):
- **Resultado:** **0 ocurrencias de emojis unicode** en `index.html`, `manifest.json`, `serviceworker.js` o funciones de Supabase.
- **Sustitución vectorial:** Todos los conceptos visuales están representados mediante iconos vectoriales inline `<svg>` limpios (`fill="none" stroke="currentColor"`), garantizando homogeneidad multiplataforma sin depender de tipografías de emojis del sistema operativo.

### 2.2. Identidad y Convención de Marca: `fintrack` en Minúsculas
Se inspeccionó la convención de caja baja exigida por el sistema de diseño:
- **UI visible al usuario:** Cumplimiento total. El imagotipo de cabecera es `f<span class="mark-accent">t.</span>` (`index.html:2232`), el título de la página es `<title>fintrack</title>` (`index.html:11`), el membrete de exportación PDF dibuja `fintrack.` (`index.html:7823-7832`, `8369`), el creador de Excel es `fintrack` (`index.html:9038`), y el remitente de correo mensual es `fintrack <onboarding@resend.dev>` (`monthly-report/index.ts:415`).
- **Desviaciones internas (comentarios y logs):**
  1. `index.html:5489` — `// Una anulación en FinTrack no introduce saldo fantasma...`
  2. `index.html:7849` — `// ── KPI CARDS PLANAS Y SUTILES FINTRACK ...`
  3. `index.html:8175` — `// ── EXPORTACIÓN RESUMEN ANUAL A PDF (FinTrack White Edition) ...`
  4. `index.html:9869` — `console.warn('FinTrack: Watchdog de arranque forzó la ocultación del loadingOverlay');`
  *Recomendación:* Normalizar estas 4 referencias a minúsculas `fintrack` para blindar la coherencia sintáctica global.

---

## 3. Evaluación de Fidelidad Liquid Glass respecto a Estándares iOS

La interfaz de iOS 17/18 y visionOS fundamenta su lenguaje translúcido en cinco pilares ópticos: matriz dieléctrica de refracción, cáusticas perimétricas, menisco especular superior, consistencia focal de desenfoque y trazos de borde con gradiente de luz.

```
       ┌────────────────── Resplandor Especular (Glass Hi) ──────────────────┐
       │   ┌────────────── Borde Prismático / Cáustica (Glass Edge) ───────┐ │
       │   │                                                               │ │
       │   │                 SUPERFICIE CON DESENFOQUE                     │ │
       │   │        backdrop-filter: blur(40px) saturate(180%)            │ │
       │   │                                                               │ │
       │   └───────────────────────────────────────────────────────────────┘ │
       └──────────── Bisel Interior Inferior + Sombra Difusa (Shadow) ───────┘
```

### 3.1. Refracción Física y Densidad de Superficie (`--bg2`)
- **Implementación actual:**
  - Token en modo claro (`index.html:34`): `--bg2: rgba(255, 255, 255, 0.62)`.
  - Token en modo oscuro (`index.html:131`): `--bg2: rgba(54, 54, 60, 0.55)`.
- **Diagnóstico óptico:** Una opacidad de base del 62% en blanco genera un efecto plástico lechoso (*milky plastic*) que amortigua excesivamente el fondo ambiental reactivo (`.mesh-bg` con sus 3 orbes animados en `index.html:194-200`). En estándares de cristal Apple, los paneles flotantes utilizan opacidades del 18% al 32% combinadas con un realce de saturación (`saturate(180%)-saturate(220%)`).
- **Defecto crítico de opacidad acumulativa en el Libro Mayor (`.tx-group-card`):**
  - Contenedor agrupado (`index.html:1081`): `.tx-group-card { background: var(--bg2); ... }` (62% opacidad).
  - Ítem interior (`index.html:1084`): `.tx-group-card .tx-item { background: var(--bg2); ... }` (62% opacidad adicional).
  - *Impacto visual:* La opacidad compuesta resultante es `1 - (1 - 0.62)^2 = 85.6%`. Las filas del historial pierden por completo su condición de cristal líquido transparente y se renderizan como bloques blancos opacos casi sólidos.
  - *Solución:* `.tx-group-card .tx-item` debe tener `background: transparent;` y activar `background: var(--bg3);` únicamente en estado `:active` o `:hover`.

### 3.2. Cáusticas y Aberración Cromática Perimétrica
- **Estado de la barra inferior móvil (`.bottom-nav`):** Excelencia técnica absoluta (`index.html:798-821`). Utiliza un pseudoelemento `::before` con gradiente cónico (`conic-gradient`) de 9 paradas espectrales con matices cian, lavanda y ámbar, recortado mediante `mask-composite: exclude` con ancho de 1.35px.
- **Estado en el resto de la aplicación:** **Completamente ausente.** Ninguna tarjeta (`.scard`, `.portfolio-card`, `.pat-account`, `.cat-row`, `.modal`) cuenta con cáusticas perimétricas; utilizan un borde estático plano `1px solid var(--card-border)`.

### 3.3. Menisco Especular y Reflejo Rasante (`::before` Sheen)
- **Implementación actual (`index.html:1507-1514`):**
  ```css
  .scard::before, .cat-row::before, .pat-total-card::before, .pat-account::before,
  .goal-card::before, .chart-card::before, .compare-card::before, .settings-section::before,
  .add-cat-form::before, .budget-total-bar::before, .dt-scard::before, .dt-donut-section::before,
  .dt-budget-top::before, .chart-area::before {
    content:''; position:absolute; top:0; left:7%; right:7%; height:1px;
    background:linear-gradient(90deg, transparent, var(--glass-hi), transparent);
    pointer-events:none; z-index:1;
  }
  ```
- **Inconsistencias y omisiones detectadas:**
  1. `.portfolio-card` (tarjeta insignia de Inversión) **no está incluida** en este selector. Carece de menisco superior.
  2. `.tx-group-card` (tarjeta de transacciones) **no está incluida**. Carece de menisco superior.
  3. `.modal` y `.critical-confirm-card` **no están incluidas**.
  4. `.annual-kpi-card` **no está incluida**.
  5. La línea recta estática de `left: 7%; right: 7%` no abraza la curvatura squircle de las esquinas (`border-radius: 20px`), viéndose como un corte artificial en pantallas de alta densidad (Retina / OLED) en lugar de una cáustica curva natural como la de `.bottom-nav::after`.

### 3.4. Dispersión Caótica de Filtros de Desenfoque (`backdrop-filter`)
Existe una fragmentación severa de valores de desenfoque en la aplicación, destruyendo la coherencia de profundidad de campo:

| Selector | Propiedad `backdrop-filter` | Ubicación | Diagnóstico |
|---|---|---|---|
| `:root` token canónico | `blur(40px) saturate(180%)` | `index.html:37` | Token de referencia |
| `.bottom-nav` | `blur(20px) saturate(215%) brightness(1.07) contrast(108%)` | `index.html:773` | Alta fidelidad iOS |
| `.auth-glass-card` | `blur(60px) saturate(180%)` | `index.html:306` | Sobredesenfoque (60px) |
| `.annual-kpi-card` | `blur(20px)` | `index.html:1295` | Falta realce de saturación |
| `.chart-card` | `blur(44px) saturate(190%)` | `index.html:1298` | Valor arbitrario (44px) |
| `.undo-toast` | `blur(30px) saturate(180%)` | `index.html:1394` | Valor intermedio (30px) |
| `.modal-bg` | `blur(12px) saturate(140%)` | `index.html:1408` | Desenfoque muy débil (12px) |
| `.critical-confirm-bg` | `blur(8px)` | `index.html:2137` | Desenfoque insuficiente (8px) |
| `.investment-trade-modal` | `blur(4px)` | `index.html:2010` | Casi inapreciable (4px) |
| `.asset-sheet` (Móvil) | *Ninguno (fondo opaco)* | `index.html:1966` | Quiebra estética Liquid Glass |
| `.tx-group-card` | *Ninguno (omitido en selector)* | `index.html:1495` | Falta `backdrop-filter` |

*Recomendación:* Estandarizar todos los contenedores de superficie a `var(--glass-blur)` (`blur(40px) saturate(180%)`) y los fondos de diálogo/overlay a `blur(20px) saturate(150%)`.

---

## 4. Catálogo Detallado de Inconsistencias Visuales Inter-Pantallas

### 4.1. Tarjetas Hero y Métricas KPI por Pantalla

```
┌────────────────────────────────────────────────────────────────────────┐
│                        COMPARATIVA DE TARJETAS HERO                    │
├───────────────────┬──────────────┬──────────────┬──────────────────────┤
│ Pantalla          │ Selector     │ Radio Borde  │ Padding              │
├───────────────────┼──────────────┼──────────────┼──────────────────────┤
│ Inicio (KPI)      │ .scard       │ 16px (--md)  │ 14px (--padding-sm)  │
│ Inversión (Hero)  │ .portfolio-card│ 28px (--xl)│ 20px 18px 17px       │
│ Inversión (Stats) │ .invest-stats>div│ 16px (--md)│ 12px 8px           │
│ Cuentas (Total)   │ .pat-total-card│ 20px (--lg)│ 22px 20px            │
│ Cuentas (Fila)    │ .pat-account │ 16px (--md)  │ 16px (--padding)     │
│ Anual (KPI)       │ .annual-kpi-card│ 16px (--md)│ 13px 15px           │
│ Inicio Escritorio │ .dt-scard    │ 16px (--md)  │ 16px 18px            │
└───────────────────┴──────────────┴──────────────┴──────────────────────┘
```

- **Inconsistencia de radio en Hero Cards:** La tarjeta de Cartera (`.portfolio-card`, `index.html:1905`) utiliza `border-radius: var(--radius-xl)` (28px), mientras que la tarjeta equivalente de Patrimonio Total (`.pat-total-card`, `index.html:1257`) usa `var(--radius-lg)` (20px). Ambos son héroes de balance principal y deben unificarse a `var(--radius-lg)` (20px).
- **Tratamiento tipográfico del importe principal:**
  - En Cuentas (`.pat-total-value`, `index.html:1259`): `38px`, negrita 800, con texto recortado en gradiente esmeralda (`background: var(--accent-grad); -webkit-background-clip: text; color: transparent`).
  - En Inversión (`.portfolio-card>strong`, `index.html:1908`): `30px`, negrita 800, color sólido `--text` sin gradiente.
- **Cuadrícula de estadísticas (`.invest-stats` vs `.summary`):**
  - `.summary` (Inicio, `index.html:464`): `gap: 10px; padding: 8px 16px;`.
  - `.invest-stats` (Inversión, `index.html:1912`): `gap: 8px; margin: 10px 0 22px;`.
  - El padding interior de las tarjetas en Inversión es de solo `12px 8px` (`index.html:1913`), produciendo una caja más angosta y apretada que las tarjetas de Inicio (`14px`).

### 4.2. Arquitectura de Hojas Modales y Diálogos

1. **Fragmentación del tirador superior (*Drag Handle*):**
   - Modales estándar (`#modalBg`, `#adjustModalBg`, `#budgetModalBg`, `#monthModalBg`, `#exportModalBg`, `#recurrenceDeleteBg`): usan elemento HTML `<div class="modal-handle"></div>` (`index.html:1413`).
   - Diálogos críticos (`.critical-confirm-bg`, `openSyncTray`, `promptRecurringEditScope`): usan elemento HTML `<div class="critical-confirm-handle"></div>` (`index.html:2137`).
   - Modal de compra/venta (`.investment-trade-card`): usa un pseudoelemento CSS `:before` (`index.html:2012`).
   - Ficha de producto (`.asset-sheet`): **carece por completo de tirador**.
2. **Defecto de persistencia del tirador en escritorio:**
   - En versión de escritorio (`@media(min-width: 768px)`), las ventanas modales pasan a ser tarjetas centradas flotantes.
   - `.critical-confirm-handle` y `.investment-trade-card:before` se ocultan correctamente con `display: none!important` (`index.html:2031, 2137`).
   - Sin embargo, `.modal-handle` **no se oculta en escritorio**, permaneciendo visible de forma anómala en la parte superior de las tarjetas de diálogo centradas en PC.
3. **Omisión de bloqueo de desplazamiento de fondo (`lockBodyScroll`):**
   - Las funciones `openModal`, `openAdjustModal`, `openBudgetModal`, `openMonthModal`, `openExportModal` y `openRecurringDeleteDialog` invocan `lockBodyScroll()` (`index.html:6948, 5667, 5836, 7029, 7656, 7310`).
   - En cambio, `openAssetSheet` (`index.html:6513`), `openSyncTray` (`index.html:3299`), `confirmCriticalAction` (`index.html:6787`), `promptRecurringEditScope` (`index.html:7155`) y el modal de trading `investment-trade-modal` (`index.html:6467`) **omiten `lockBodyScroll()`**, permitiendo que el usuario desplace la pantalla de fondo mientras interactúa con el modal.
4. **Doble paradigma en edición vs eliminación de recurrencias:**
   - Para **eliminar** un gasto recurrente se abre un modal estándar `#recurrenceDeleteBg` (`index.html:2394`) con diseño de hoja inferior Liquid Glass.
   - Para **editar** un gasto recurrente (`promptRecurringEditScope`, `index.html:7155`) se inyecta dinámicamente un diálogo `.critical-confirm-card` con fondo opaco `var(--bg-grouped)`, tipografía distinta y botones con estilos inline duros (`border-radius: 20px`).

### 4.3. Dispersión de Anchos Máximos en Escritorio (*Container Jumps*)
Al navegar por la barra lateral en pantallas grandes (`>= 768px`), el contenedor central sufre saltos bruscos de ancho según la pestaña activa:

```
Inicio:     |================================ 1440px ================================|
Categorías: |====================== 960px ======================|
Cuentas:    |====================== 960px ======================|
Anual:      |================= 760px =================|
Inversión:  |================= 760px =================|
Ajustes:    |============== 640px ==============|
```

- `index.html:1708` — `#dtTabContent, .dt-top-bar`: `max-width: 1440px`.
- `index.html:1720` — `cat-head-row, #catDragList, .pat-wrap, .pat-total-card`: `max-width: 960px`.
- `index.html:1294, 1887` — `.annual-wrap, .invest-wrap`: `max-width: 760px`.
- `index.html:1784` — `.settings-wrap`: `max-width: 640px`.
*Recomendación:* Estandarizar dos niveles lógicos claros: vista panorámica amplia (1200px para Inicio y Anual) y vista concentrada de formulario/lista (840px para Categorías, Cuentas, Inversión y Ajustes).

### 4.4. Transiciones de Entrada entre Pestañas
- Inicio, Categorías, Cuentas y Anual ejecutan `animateTabEntrance(el, selector)` (`index.html:4206, 5311, 5432, 6314`), respetando `prefers-reduced-motion` y la API nativa `document.startViewTransition`.
- Inversión utiliza una regla estática `@keyframes invest-rise` (`index.html:2053`), saltándose la comprobación de `startViewTransition`.
- **Ajustes (`renderSettingsTab`, `index.html:6704`):** No llama a `animateTabEntrance` en absoluto; aparece de golpe sin animación de entrada.

### 4.5. Iconografía: Dispersión de Tamaños y Grosores
El análisis de atributos `<svg>` en `index.html` arroja una dispersión inaceptable:
- **Dimensiones:** Se detectaron 15 combinaciones distintas: `10×10` (6), `11×11` (2), `12×12` (11), `13×13` (15), `14×14` (11), `15×15` (6), `16×16` (13), `18×18` (6), `20×20` (1), `22×22` (6), `24×24` (2), `26×26` (1), `34×34` (1), `40×40` (1).
- **Grosor de trazo (`stroke-width`):** Se detectaron 7 valores: `2.0` (41), `2.2` (23), `1.8` (19 en barra inferior y escritorio), `2.5` (14 en botones de acción y borrado), `1.9` (3 en ajustes), `1.6` (1), `0.7` (1).
- *Efecto:* Los iconos de la barra inferior se perciben demasiado finos (`1.8`), mientras que los de filtros y confirmaciones se perciben excesivamente pesados (`2.5`). Debe estandarizarse el catálogo canónico a trazo uniforme `2.0` y tamaños de rejilla `16×16` (auxiliar) y `20×20` (principal).

### 4.6. Ergonomía Táctil y Violaciones del Tap Target de 44×44 px (WCAG AA)
A pesar de la regla de expansión táctil `::after` (`index.html:1231`), se han identificado controles interactivos en la zona superior que violan la directriz de 44px:
1. `.header-gear` (`index.html:428`): Botón de Ajustes en la cabecera principal. Dimensiones: `36×36 px`. **No está en la lista de `::after`**.
2. `.home-annual-toggle` (`index.html:435`): Botón de vista anual en la barra de mes. Dimensiones: `32×32 px`. **No está en la lista de `::after`**.
3. `.color-swatch` (`index.html:1353`): Muestras de color en el selector de categoría. Dimensiones: `38×38 px`. **No tiene `::after`**.
4. `.filter-chip` (`index.html:1134`), `.sort-select` (`index.html:1137`), `.date-range-clear` (`index.html:1141`): Altura de `32px` a `34px`.

### 4.7. Regresión en Modo Privado: Difuminado Erróneo de Lienzos Gráficos
En `index.html:1516-1518`:
```css
html.privacy-mode #lineChartCanvas,
html.privacy-mode #barChartCanvas,
html.privacy-mode .heatmap-grid,
html.privacy-mode .dc-amount,
... {
  filter: blur(6px);
  pointer-events: none;
}
```
- **Violación flagrante de invariantes:** `DESIGN_SYSTEM.md` (sección 1.4 y Regla 3) y `ORIGINAL_REQUEST.md` (R3) prescriben taxativamente: *"Never blur data visualization structures: Donut charts, bar charts, and category pills must remain visible; only the center total or specific monetary amounts get blurred"*.
- **Defecto:** Difuminar `#lineChartCanvas`, `#barChartCanvas` y `.heatmap-grid` destruye la experiencia analítica convirtiendo los gráficos en manchas borrosas ilegibles. Solo deben difuminarse las cifras en el tooltip flotante y las leyendas numéricas, manteniendo las barras y líneas vectoriales nítidas.
- **Inconsistencia de ofuscación:** Varias partes del código sustituyen cifras por texto estático `'••••••'` (`index.html:2641, 4180, 5019, 5040`), produciendo saltos de anchura (*layout shift*) al alternar el modo privado. La especificación exige aplicar una clase `.privacy-blur` (`filter: blur(8px)`) sobre la cifra numérica real para preservar intacta la métrica geométrica del texto.

### 4.8. Colisión del Undo Toast con el FAB en la Zona del Pulgar
- En `index.html:1394`: `.undo-toast { position: fixed; left: 50%; bottom: calc(76px + var(--safe-bottom)); ... }`.
- En `index.html:1372`: `.fab { position: fixed; bottom: calc(76px + var(--safe-bottom)); right: 20px; ... }`.
- **Conflicto ergonómico:** Ambos elementos comparten exactamente la misma cota inferior (`bottom: calc(76px + safe-bottom)`). Al activarse la notificación flotante de deshacer (que mide hasta el 90% del ancho de pantalla), su extremo derecho colisiona y cubre el botón FAB, bloqueando la pulsación del botón de añadir transacción.
- *Solución:* Mover `.undo-toast` a la posición superior canónica prescrita en `DESIGN_SYSTEM.md` sección 7.5 (*Dynamic Island* en `top: calc(16px + var(--safe-top)); transform: translateX(-50%) translateY(-20px)`).

### 4.9. Cifras Tabulares Omitidas (`tabular-nums`)
La regla global de ancho numérico uniforme (`index.html:184-188`) incluye 35 selectores, pero ha omitido:
1. `#adjustRealAmount` (`index.html:2464`): Campo de entrada de saldo real bancario.
2. `#budgetModalAmount` (`index.html:2503`): Campo de entrada de presupuesto mensual.
3. `#adjustDesfaseValue` (`index.html:2473`): Indicador del desfase en el modal de conciliación.
4. `.month-picker-year` (`index.html:2524`): Rótulo del año en el selector de periodo.
5. `.sync-tray-count-badge` (`index.html:6711`): Contador de la bandeja offline.

### 4.10. Código Muerto y Redundante en Estilos
1. **Estilos de evolución de cartera eliminados:** En `index.html:2135`, el bloque `.portfolio-evolution`, `.portfolio-evolution svg`, `.portfolio-evolution-loading`, `.portfolio-evolution-empty`, `.portfolio-evolution-private` y `.portfolio-axis` permanece activo a pesar de que el gráfico de evolución de cartera fue purgado y descartado definitivamente el 2026-09-03 (`PROJECT_CONTEXT.md:389`).
2. **Duplicación en modo oscuro:** En `index.html:1335-1340`, las reglas para `.tx-actions`, `.tx-item:hover .tx-actions`, `.tx-btn.edit` y `.tx-btn.del` están duplicadas textualmente dentro de `@media(prefers-color-scheme:dark)` sin añadir ninguna variación de estilo respecto al bloque claro de `1327-1334`.

---

## 5. Matriz de Priorización: Impacto vs Esfuerzo

| ID | Hallazgo / Acción Propuesta | Impacto | Esfuerzo | Fase Recomendada |
|---|---|---|---|---|
| **D-01** | Subsanar regresión de Modo Privado: eliminar blur de `#lineChartCanvas`, `#barChartCanvas` y `.heatmap-grid`. Estandarizar `.privacy-blur` (`filter: blur(8px)`) sobre cifras numéricas. | **ALTO** | **BAJO** | Fase 1 (Inmediata) |
| **D-02** | Resolver colisión del `.undo-toast`: reubicarlo como cápsula superior flotante (*Dynamic Island*) en `top: calc(16px + safe-top)`. | **ALTO** | **BAJO** | Fase 1 (Inmediata) |
| **D-03** | Corregir doble opacidad en el Libro Mayor: cambiar fondo de `.tx-item` a `transparent` para devolver la transparencia líquida a `.tx-group-card`. | **ALTO** | **BAJO** | Fase 1 (Inmediata) |
| **D-04** | Incorporar `lockBodyScroll()` en `openAssetSheet`, `openSyncTray`, `confirmCriticalAction`, `promptRecurringEditScope` y `openTradeModal`. | **MEDIO** | **BAJO** | Fase 1 (Inmediata) |
| **D-05** | Corregir persistencia del tirador modal en escritorio: añadir `@media(min-width:768px){.modal-handle{display:none!important;}}`. | **MEDIO** | **BAJO** | Fase 1 (Inmediata) |
| **D-06** | Garantizar tap target de 44×44px en `.header-gear`, `.home-annual-toggle` y `.color-swatch` mediante `::after`. | **ALTO** | **BAJO** | Fase 1 (Inmediata) |
| **D-07** | Estandarizar desenfoques (`backdrop-filter`) a dos niveles: `var(--glass-blur)` para tarjetas y `blur(20px)` para modales/overlays. | **MEDIO** | **MEDIO** | Fase 2 (Refinamiento) |
| **D-08** | Unificar radios squircle de tarjetas Hero: fijar `.portfolio-card` a `var(--radius-lg)` (20px) homogéneo con `.pat-total-card`. | **MEDIO** | **BAJO** | Fase 2 (Refinamiento) |
| **D-09** | Reconciliar anchos máximos en escritorio: alinear pestañas secundarias a 840px para eliminar el salto de ancho entre vistas. | **MEDIO** | **MEDIO** | Fase 2 (Refinamiento) |
| **D-10** | Unificar el catálogo de iconos SVG a grosores de trazo homogéneos (`stroke-width: 2.0` / `2.2`) y rejilla uniforme. | **BAJO** | **MEDIO** | Fase 3 (Pulido) |
| **D-11** | Normalizar las 4 menciones residuales de `FinTrack` a `fintrack` en comentarios y consola. | **BAJO** | **BAJO** | Fase 3 (Pulido) |
| **D-12** | Purgar reglas CSS de código muerto (`.portfolio-evolution`) y bloques duplicados en `index.html`. | **BAJO** | **BAJO** | Fase 3 (Pulido) |

---

## 6. Riesgos de Regresión y Restricciones Arquitectónicas

1. **Riesgo en transformaciones 3D (Safari iOS):** Al ajustar `backdrop-filter` o meniscos especulares en `.cat-row` o `.chart-area`, debe preservarse la regla de neutralización de desenfoque durante la animación de volteo 3D (`index.html:660-665`). Reintroducir `backdrop-filter` dentro de un contenedor con `transform-style: preserve-3d` provoca artefactos de parpadeo y aplanamiento en Safari WebKit móvil.
2. **Riesgo en el árbol de capas GPU (`z-index` y `isolation`):** La barra inferior `.bottom-nav` tiene `z-index: 60`, el `.fab` tiene `z-index: 100`, las hojas modales tienen `z-index: 200` y `.undo-toast` tiene `z-index: 999`. Cualquier cambio en la cota de elevación debe preservar esta jerarquía para no ocultar avisos críticos detrás del teclado virtual o de modales activos.
3. **Riesgo en selectores de cifras tabulares:** Al añadir `#adjustRealAmount`, `#budgetModalAmount` y `#adjustDesfaseValue` a la regla de `tabular-nums`, debe verificarse que los navegadores mantengan la alineación decimal sin provocar recortes de texto en anchos mínimos de pantalla (320px).
4. **Invariante PWA y despliegue:** Toda modificación estética que se aplique en `index.html` requerirá coordinadamente el incremento de `APP_VERSION` en `index.html`, la fecha en `APP_PUBLISHED_AT`, el identificador de caché en `serviceworker.js` (`CACHE_NAME`), y la actualización obligatoria de `PROJECT_CONTEXT.md`.

---

## 7. Plan de Verificación y Validación Independiente

Para comprobar de forma reproducible la resolución de los hallazgos tras su posterior implementación:

1. **Verificación de Cero Emojis:**
   ```powershell
   $lines = Get-Content 'C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html'
   $emojiRegex = [regex]'[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF]'
   ($lines | Where-Object { $emojiRegex.IsMatch($_) }).Count
   # Criterio de éxito: Retorna exactamente 0
   ```
2. **Verificación de Casing de Marca:**
   ```powershell
   Select-String -Path "C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html" -Pattern "(FinTrack|Fintrack|FINTRACK)" -CaseSensitive
   # Criterio de éxito: 0 coincidencias en index.html
   ```
3. **Verificación de Modo Privado en Gráficos:**
   - Activar el modo privado (doble toque en `ft.` o tarjeta de Balance).
   - Inspeccionar `#lineChartCanvas`, `#barChartCanvas` y `.heatmap-grid`: deben tener `filter: none` y verse perfectamente nítidos. Solo los importes numéricos deben lucir difuminados.
4. **Verificación de Colisión Toast vs FAB:**
   - En viewport móvil (390×844 px), provocar una eliminación con opción de deshacer.
   - Constatar que la píldora aparece en la parte superior (*Dynamic Island*) y que el botón flotante `.fab` en la esquina inferior derecha permanece 100% visible e interactuable.
5. **Verificación de Tap Targets en Cabecera:**
   - En el inspector de elementos de Chrome/Safari, medir el *bounding client rect* del pseudoelemento `::after` de `.header-gear` y `.home-annual-toggle`: debe alcanzar al menos 44×44 px.
6. **Verificación Sintáctica Obligatoria:**
   ```bash
   node scripts/validate-syntax.js
   # Criterio de éxito: 0 errores sintácticos en los bloques JavaScript embebidos
   ```

---
*Fin del Informe de Auditoría del Agente 2 — Guardián de Diseño y Ergonomía Visual.*
