# Lenguaje de Diseño y Sistema Visual — White Edition & Liquid Glass
*Documento canónico y guía de arquitectura visual, interacción, ergonomía y componentes para el ecosistema de aplicaciones.*

---

## 1. Filosofía y Principios Fundamentales

Este sistema de diseño nace para ofrecer una experiencia visual distinguible, sobria y de nivel industrial. Se fundamenta en la confluencia de dos corrientes estéticas: la **arquitectura editorial "White Edition"** (claridad tipográfica, fondos inmaculados, retículas limpias y trazos hairline) y los **materiales reactivos "Liquid Glass"** (refracción física, cáusticas perimétricas, desenfoques profundos y meniscos especulares inspirados en iOS y visionOS).

Cualquier aplicación que forme parte de este ecosistema debe regirse de manera estricta por los siguientes cinco principios:

### 1.1. Pureza visual y sobriedad editorial ("White Edition")
- **Fondos limpios:** En modo claro, los fondos son luminosos y cálidos (`#EEF0F3` base, `#FFFFFF` agrupado). En modo oscuro, son negros azabache profundos (`#06060A` base, `#1C1C1E` agrupado). Quedan terminantemente prohibidos los bloques negros pesados o macizos sobre fondos claros, así como los degradados agresivos o contrastes estridentes.
- **Líneas hairline:** Las fronteras entre elementos se trazan mediante separadores de `0.5px` a `1px` con opacidades sutiles (`rgba(60,60,67,0.06)` a `0.12`).
- **Respiración y espacio negativo:** La jerarquía se establece mediante padding equilibrado y márgenes proporcionales, no mediante marcos o cajas artificiales acumuladas.

### 1.2. Regla inviolable: CERO EMOJIS
- **Prohibición absoluta:** No se utilizará ningún emoji en ningún punto de la aplicación (ni en botones, alertas, selectores, insignias, títulos, tablas, exportaciones PDF o correos electrónicos).
- **Justificación de diseño:** Los emojis son heterogéneos entre plataformas (iOS, Android, Windows y Linux renderizan glifos distintos con diferente saturación), degradan la imagen corporativa hacia un aspecto infantil o informal y rompen la armonía tonal.
- **Sustitución estricta:** Todos los conceptos visuales se representan mediante **iconos vectoriales SVG monocromáticos** (`fill="none" stroke="currentColor"` con trazos de `2px` a `2.2px`) o texto semántico limpio.

### 1.3. Identidad de marca y convención en minúsculas
- **Marca en minúsculas:** El nombre de la aplicación se escribe siempre en caja baja (ej. `fintrack`, nunca `FinTrack`).
- **Logomarca / Imagotipo:** Tipografía `Outfit` con peso ultranegrita (`800`), tracking cerrado (`-1.2px` a `-1.5px`) y un punto final con color de acento semántico (ej. `ft.` o `appname.`).

### 1.4. Honestidad de datos y contención funcional
- **Sin simulaciones falsas:** Si no existen datos reales de un usuario o entidad, la interfaz muestra un estado vacío sobrio (`empty state`), nunca gráficos ficticios ni marcadores de posición aleatorios que desorienten.
- **Menos es más:** No se añaden tarjetas, widgets o calculadoras superfluas que no aporten valor operativo inmediato. Cada elemento en pantalla debe justificar su presencia.

### 1.5. Ergonomía orientada al uso a una sola mano ("Thumb Zone")
- En dispositivos móviles, los controles críticos de navegación y creación se sitúan en el tercio inferior de la pantalla (accesible directamente con el pulgar).
- Todos los elementos interactivos cuentan con un área táctil mínima garantizada de **44×44 px**.

---

## 2. Paleta Cromática y Tokens de Color

El sistema utiliza variables CSS para alternar fluidamente entre tema claro y tema oscuro mediante selectores de atributo (`data-theme="light"`, `data-theme="dark"`) y media queries automáticas (`@media (prefers-color-scheme: dark)`).

### 2.1. Tokens de Superficie y Fondo

```css
:root {
  /* Modo Claro (Alabastro / Frost White) */
  --bg: #EEF0F3;                      /* Fondo base del lienzo */
  --bg2: rgba(255, 255, 255, 0.62);    /* Superficie primaria Liquid Glass */
  --bg3: rgba(120, 120, 140, 0.08);   /* Superficie secundaria / Contenedores de campo */
  --bg4: rgba(120, 120, 140, 0.14);   /* Superficie terciaria / Hover y estados activos */
  --bg-grouped: #FFFFFF;              /* Fondo de tarjetas agrupadas sólidas */
  --card-border: rgba(255, 255, 255, 0.65); /* Borde de cristal claro */

  /* Separadores */
  --separator: rgba(60, 60, 67, 0.12);  /* Divisores estructurados */
  --separator2: rgba(60, 60, 67, 0.06); /* Divisores hairline sutiles (0.5px) */
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Modo Oscuro (Onyx / Jet Black) */
    --bg: #06060A;                      /* Negro azabache profundo */
    --bg2: rgba(54, 54, 60, 0.55);      /* Cristal oscuro ahumado */
    --bg3: rgba(255, 255, 255, 0.07);   /* Superficie secundaria oscura */
    --bg4: rgba(255, 255, 255, 0.12);   /* Hover / Fondos interactivos oscuros */
    --bg-grouped: #1C1C1E;              /* Gris profundo de agrupaciones iOS */
    --card-border: rgba(255, 255, 255, 0.12); /* Borde sutil refractivo */

    --separator: rgba(84, 84, 88, 0.6);
    --separator2: rgba(84, 84, 88, 0.36);
  }
}
```

### 2.2. Jerarquía de Texto y Contraste WCAG AA

Los niveles de texto están calibrados para superar una relación de contraste mínima de 4.5:1 (AA) sobre sus respectivos fondos:

| Token | Modo Claro | Modo Oscuro | Relación de Contraste | Uso |
|---|---|---|---|---|
| `--text` | `#1C1C1E` | `#FFFFFF` | > 14:1 | Títulos, importes principales, datos clave. |
| `--text2` | `#3C3C43` | `rgba(235, 235, 245, 0.78)` | > 7:1 | Párrafos, subtítulos, nombres secundarios. |
| `--text3` | `#5C5C61` | `rgba(235, 235, 245, 0.58)` | > 5.9:1 | Etiquetas, leyendas, metadatos, kickers. |
| `--text4` | `#71717A` | `rgba(235, 235, 245, 0.48)` | > 4.6:1 | Placeholders, divisores inactivos, flechas sutiles. |

### 2.3. Colores Semánticos y Funcionales

Los colores semánticos se emplean para comunicar estado y significado contable/operativo:

```css
:root {
  /* Éxito / Ingreso / Positivo */
  --green: #34C759;
  --green-text: #1E7B35;   /* Calibrado oscuro en modo claro para máxima legibilidad (>5.2:1) */
  --brand-green: #248A3D;  /* Verde institucional */

  /* Peligro / Gasto / Negativo */
  --red: #FF3B30;          /* Rojo carmesí iOS */

  /* Alerta / Precaución / Estado Pendiente */
  --amber: #FF9500;        /* Ámbar puro */

  /* Información / Transferencia / Neutral */
  --blue: #007AFF;         /* Azul cobalto */

  /* Gradiente insignia para acciones principales */
  --accent-grad: linear-gradient(135deg, #34C759, #0FB8AD);
}

@media (prefers-color-scheme: dark) {
  :root {
    --green-text: #34C759; /* En fondo oscuro se utiliza el verde brillante */
    --brand-green: #34C759;
  }
}
```

### 2.4. Paleta Curada para Categorías y Entidades

Cuando una aplicación requiere asociar colores a categorías, cuentas o proyectos, se utiliza esta paleta armónica de 12 tonos:

```javascript
const PALETTE = [
  '#007AFF', // Azul cobalto
  '#34C759', // Verde esmeralda
  '#FF9500', // Ámbar cálido
  '#FF3B30', // Rojo coral
  '#AF52DE', // Púrpura orquídea
  '#5856D6', // Índigo eléctrico
  '#00C7BE', // Turquesa
  '#32ADE6', // Celeste
  '#FF2D55', // Rosa frambuesa
  '#A2845E', // Bronce / Cuero
  '#64D2FF', // Azul cielo
  '#30B0C7'  // Cian profundo
];
```

---

## 3. Arquitectura de Material: Liquid Glass

El material **Liquid Glass** simula la presencia física de una lámina convexa de cristal templado pulido suspendida sobre el contenido.

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

### 3.1. Tokens de Cristal y Sombras

```css
:root {
  --glass-blur: blur(40px) saturate(180%);
  --glass-hi: rgba(255, 255, 255, 0.70);
  --glass-edge: rgba(255, 255, 255, 0.35);
  --glass-inner: 0 1px 0 rgba(255, 255, 255, 0.60) inset, 0 -0.5px 0 rgba(0, 0, 0, 0.04) inset;

  --shadow: 0 12px 34px rgba(30, 30, 60, 0.10), 0 2px 6px rgba(30, 30, 60, 0.05);
  --shadow-sm: 0 6px 18px rgba(30, 30, 60, 0.07), 0 1px 2px rgba(30, 30, 60, 0.04);
}

@media (prefers-color-scheme: dark) {
  :root {
    --glass-hi: rgba(255, 255, 255, 0.22);
    --glass-edge: rgba(255, 255, 255, 0.14);
    --glass-inner: 0 1px 0 rgba(255, 255, 255, 0.18) inset, 0 -0.5px 0 rgba(0, 0, 0, 0.20) inset;

    --shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 2px 4px rgba(0, 0, 0, 0.40);
    --shadow-sm: 0 8px 22px rgba(0, 0, 0, 0.40), 0 1px 2px rgba(0, 0, 0, 0.25);
  }
}
```

### 3.2. Malla Ambiental de Fondo (Ambient Mesh Background)
Para que el cristal refracte vida y color sin saturar, se coloca un fondo de orbes desenfocados detrás de la interfaz (`pointer-events: none`):

```html
<div class="mesh-bg" aria-hidden="true">
  <div class="mesh-orb m1"></div>
  <div class="mesh-orb m2"></div>
  <div class="mesh-orb m3"></div>
</div>
```

```css
.mesh-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.mesh-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(75px);
  opacity: 0.55;
  animation: meshFloat 24s ease-in-out infinite;
}
.mesh-orb.m1 {
  width: 380px; height: 380px;
  background: radial-gradient(circle, rgba(52, 199, 89, 0.50), transparent 70%);
  top: -120px; left: -100px;
}
.mesh-orb.m2 {
  width: 340px; height: 340px;
  background: radial-gradient(circle, rgba(0, 122, 255, 0.38), transparent 70%);
  top: 35%; right: -120px;
  animation-delay: -8s;
}
.mesh-orb.m3 {
  width: 300px; height: 300px;
  background: radial-gradient(circle, rgba(255, 149, 0, 0.28), transparent 70%);
  bottom: -80px; left: 15%;
  animation-delay: -16s;
}
@keyframes meshFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -25px) scale(1.08); }
}
@media (prefers-color-scheme: light) {
  .mesh-orb { opacity: 0.30; }
}
```

### 3.3. Barras de Desplazamiento Liquid Glass
Las barras de scroll deben integrarse sin ruido visual:

```css
* {
  scrollbar-width: thin;
  scrollbar-color: var(--bg4) transparent;
}
::-webkit-scrollbar {
  width: 7px;
  height: 7px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--bg4);
  border-radius: var(--radius-pill);
  border: 1.5px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text4);
  border: 1.5px solid transparent;
  background-clip: padding-box;
}
```

---

## 4. Tipografía, Jerarquía y Cifras Tabulares

### 4.1. Fuentes del Sistema
- **Texto Principal y Datos:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI Variable Text"`, `"Segoe UI"`, `Roboto`, `sans-serif`.
- **Logotipos e Identidad:** `Outfit`, peso `800`.
- **Optimización de lectura:** Activación de glifos contextuales:
  ```css
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  ```

### 4.2. REGLA NUMÉRICA INVIOLABLE: Cifras Tabulares (`tabular-nums`)
Cualquier cifra numérica (importes, saldos, fechas, horas, contadores, porcentajes, códigos de identificación) **debe tener ancho numérico tabular uniforme**. Esto impide que los números "bailen" horizontalmente cuando su valor cambia o al ordenarse en listas:

```css
table,
.tabular-nums,
.tx-amount,
.scard-value,
.amount-input,
.stat-val,
.date-str {
  font-variant-numeric: tabular-nums !important;
  -webkit-font-feature-settings: 'tnum' 1, 'cv02' 1, 'cv03' 1, 'cv04' 1, 'cv11' 1 !important;
  font-feature-settings: 'tnum' 1, 'cv02' 1, 'cv03' 1, 'cv04' 1, 'cv11' 1 !important;
}
```

### 4.3. Escala y Jerarquía Tipográfica

```css
:root {
  --tracking-tight: -0.025em;
  --tracking-normal: -0.01em;
  --tracking-kicker: 0.06em;
}
```

- **Titular de Hero / Cartera:** `clamp(28px, 6vw, 36px)`, peso `800`, tracking `--tracking-tight`.
- **Valores KPI en Tarjetas:** `clamp(14px, 4.2vw, 18px)`, peso `800`, cifras tabulares, nowrap con elipsis.
- **Títulos de Sección / Modales:** `18px` a `20px`, peso `700`, tracking `-0.3px`.
- **Nombres de Ítem / Filas:** `15px`, peso `600`, tracking `--tracking-normal`.
- **Texto Secundario / Subtítulos:** `13px` a `14px`, peso `500`, color `var(--text2)`.
- **Kickers / Sobretítulos:** `11px` a `12px`, peso `700`, `letter-spacing: 0.06em`, `text-transform: uppercase`, color `var(--text3)`.
- **Micro-etiquetas / Badges:** `10px` a `11px`, peso `700`, padding `2px 7px`, radio `var(--radius-pill)`.

### 4.4. Convención de Formateo de Cifras
- **Separadores en castellano:** Punto como separador de miles (`.`) y coma como separador decimal (`,`), seguido de espacio y el símbolo de divisa (ej. `1.250,50 €`).
- **Signo menos matemático:** Para cantidades negativas o gastos se utiliza siempre el signo menos matemático (`−`, U+2212), nunca el guion corto (`-`).
- **Color de signo:**
  - Valores positivos o ingresos: `var(--green-text)`.
  - Valores negativos o gastos: `var(--red)`.
  - Cero o neutral: `var(--text3)`.

---

## 5. Iconografía Vectorial (Reglas y Catálogo)

Todos los iconos deben diseñarse o extraerse con la misma especificación geométrica:

### 5.1. Reglas Técnicas
1. Formato: SVG en línea (`<svg>`).
2. Dimensiones de lienzo: `viewBox="0 0 24 24"`.
3. Trazado: `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
4. Renderizado: Icono monocromático que hereda automáticamente el color del texto mediante `currentColor`.
5. Contenedor: Cuando se ubica en un listado o botón de categoría, se envuelve en un squircle:
   ```css
   .icon-wrap {
     width: 36px;
     height: 36px;
     border-radius: var(--radius-xs); /* 10px */
     background: rgba(120, 120, 140, 0.10);
     display: flex;
     align-items: center;
     justify-content: center;
     flex-shrink: 0;
   }
   ```

### 5.2. Catálogo de Iconos Fundamentales (SVG Base)

```html
<!-- Chevron hacia la derecha (navegación / apertura) -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>

<!-- Chevron hacia la izquierda (volver) -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>

<!-- Cruz / Cerrar -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

<!-- Lupa / Búsqueda -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

<!-- Filtros -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>

<!-- Ajustes / Engranaje -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>

<!-- Transferencia / Swap de cuentas -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>

<!-- Candado / Seguro -->
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
```

---

## 6. Geometría, Espaciado y Escala Squircle

El diseño abandona esquinas afiladas o redondeos toscos en favor de radios continuos y armonizados (escala *squircle*):

```css
:root {
  /* Escala de Radios */
  --radius-xl: 28px;     /* Hojas modales, barra de navegación inferior, modales de confirmación */
  --radius-lg: 20px;     /* Tarjetas de grupo, hero cards, gráficos, botones grandes */
  --radius-md: 16px;     /* Tarjetas KPI, campos de entrada, list items */
  --radius-sm: 14px;     /* Botones secundarios, botones de acción rápida */
  --radius-xs: 10px;     /* Envoltorios de iconos, micro-badges */
  --radius-pill: 9999px; /* Píldoras deslizantes, selectores de fecha, chips */

  /* Espaciado de Tarjetas */
  --card-padding: 16px;
  --card-padding-sm: 14px;

  /* Alturas Estándar de Control Táctil */
  --btn-h: 44px;
  --input-h: 44px;

  /* Safe Areas (iOS Notch / Home Indicator) */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

---

## 7. Componentes Clave y Patrones de Interfaz

### 7.1. Barra de Navegación Móvil Liquid Glass iOS 27 (`.bottom-nav`)
La barra de navegación inferior flota suspendida sobre la parte inferior de la pantalla sin apoyarse contra el borde.

```html
<nav class="bottom-nav" role="tablist">
  <div class="bnav-pill" id="bnavPill"></div>
  <button class="bnav-btn active" role="tab" aria-selected="true" onclick="switchTab(0)">
    <div class="bnav-icon-wrap"><!-- SVG --></div>
    <span class="bnav-label">Inicio</span>
  </button>
  <button class="bnav-btn" role="tab" aria-selected="false" onclick="switchTab(1)">
    <div class="bnav-icon-wrap"><!-- SVG --></div>
    <span class="bnav-label">Categorías</span>
  </button>
</nav>
```

**Principios de construcción CSS:**
1. `position: fixed; bottom: calc(14px + var(--safe-bottom)); left: 50%; transform: translateX(-50%);`
2. `width: min(calc(100% - 24px), 390px);`
3. `backdrop-filter: blur(20px) saturate(215%) brightness(1.06) contrast(106%);`
4. Gradiente cónico perimétrico en `::before` simulando cáusticas refractivas del cristal.
5. Menisco especular en `::after` con destello superior rasante (`radial-gradient`).
6. Cápsula activa `.bnav-pill` con interpolación elástica:
   `transition: left 0.30s cubic-bezier(0.25, 1.15, 0.35, 1), width 0.30s;`

### 7.2. Tarjetas Resumen / KPI (`.scard`)
Cuadrícula de tres columnas donde cada tarjeta tiene un gradiente diagonal a 160° sutil con opacidades del 15% al 18% que se disuelve en `--bg2`:

```html
<div class="summary">
  <div class="scard t-inc">
    <div class="scard-label">Ingresos</div>
    <div class="scard-value inc">+2.450,00 €</div>
  </div>
  <div class="scard t-exp">
    <div class="scard-label">Gastos</div>
    <div class="scard-value exp">−1.120,40 €</div>
  </div>
  <div class="scard t-bal">
    <div class="scard-label">Balance</div>
    <div class="scard-value">+1.329,60 €</div>
  </div>
</div>
```

```css
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 8px 16px;
}
.scard {
  background: var(--bg2);
  border-radius: var(--radius-md);
  padding: var(--card-padding-sm);
  box-shadow: var(--glass-inner), var(--shadow-sm);
  border: 1px solid var(--card-border);
  transition: transform 0.15s ease;
}
.scard.t-inc { background: linear-gradient(160deg, rgba(52, 199, 89, 0.18), var(--bg2) 62%); }
.scard.t-exp { background: linear-gradient(160deg, rgba(255, 59, 48, 0.15), var(--bg2) 62%); }
.scard.t-bal { background: linear-gradient(160deg, rgba(0, 122, 255, 0.15), var(--bg2) 62%); }
.scard:active { transform: scale(0.97); }
```

### 7.3. Listas Agrupadas Estilo Apple Wallet / Linear (`.tx-group-card`)
En lugar de múltiples tarjetas sueltas que saturan la vista, los elementos cronológicos se agrupan en contenedores continuos con divisores interiores:

```html
<div class="tx-group-label">Hoy</div>
<div class="tx-group-card">
  <div class="tx-swipe-wrap" data-id="1">
    <div class="tx-item">
      <div class="tx-icon-wrap" style="background:#007AFF20;color:#007AFF;">
        <!-- SVG Icon -->
      </div>
      <div class="tx-info">
        <div class="tx-cat">Supermercado</div>
        <div class="tx-subcat">Compra semanal</div>
      </div>
      <div class="tx-amount exp">−45,20 €</div>
    </div>
  </div>
</div>
```

```css
.tx-group-card {
  background: var(--bg2);
  border-radius: var(--radius-lg);
  border: 1px solid var(--card-border);
  box-shadow: var(--glass-inner), var(--shadow-sm);
  overflow: hidden;
  margin-bottom: 12px;
}
.tx-group-card .tx-swipe-wrap {
  border-bottom: 0.5px solid var(--separator2);
}
.tx-group-card .tx-swipe-wrap:last-child {
  border-bottom: none;
}
```

### 7.4. Botón de Acción Flotante (`.fab`)
- Ubicación: Esquina inferior derecha del pulgar:
  ```css
  .fab {
    position: fixed;
    bottom: calc(76px + var(--safe-bottom));
    right: 20px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--accent-grad);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.35) inset, 0 10px 24px rgba(52, 199, 89, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.30);
    z-index: 100;
    transition: transform 0.20s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .fab.open { transform: rotate(45deg); }
  .fab:active { transform: scale(0.92); }
  ```

### 7.5. Notificación Píldora Superior ("Dynamic Island" Undo Toast)
Las alertas y avisos con opción de deshacer no cubren los controles inferiores; se suspenden en la parte superior:

```css
.undo-toast {
  position: fixed;
  left: 50%;
  top: calc(16px + var(--safe-top));
  transform: translateX(-50%) translateY(-20px);
  background: var(--bg2);
  color: var(--text);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-pill);
  padding: 8px 8px 8px 18px;
  box-shadow: var(--glass-inner), 0 12px 36px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(30px) saturate(180%);
  display: flex;
  align-items: center;
  gap: 14px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s, transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1);
  z-index: 999;
}
.undo-toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}
```

### 7.6. Hojas Modales y Bottom Sheets (`.modal-bg`, `.modal`)
- **Tirador superior:** Cápsula centradora `.modal-handle` de `36×4 px` en color `--bg4` para indicar visco-elasticidad.
- **Acciones sin contenedores pesados:** Los botones "Cancelar" y "Guardar" se integran directamente al pie del formulario en una fila con proporción 1:2 (`.modal-btns { display: flex; gap: 12px; margin-top: 24px; }`), eliminando barras de fondo sólidas pegadas.

---

## 8. Ergonomía Táctil y Accesibilidad (WCAG AA)

### 8.1. Garantía de Tap Target de 44×44 px en Controles Pequeños
Ningún botón o icono interactivo puede tener un área táctil menor a 44×44 px. Para botones visualmente compactos (de 24px a 36px), se expande el área de pulsación con pseudoelemento `::after`:

```css
.del-btn-sm,
.pat-hist-del,
.pat-acc-star,
.budget-icon-btn,
.nav-btn {
  position: relative; /* OBLIGATORIO para anclar el pseudoelemento */
}

.del-btn-sm::after,
.pat-hist-del::after,
.pat-acc-star::after,
.budget-icon-btn::after,
.nav-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 44px;
  min-height: 44px;
}
```

### 8.2. Paradigma Táctil Móvil: Borrado Exclusivo por Swipe
En pantallas móviles, **nunca se añade un botón de papelera visible en las filas de lista**:
- El borrado se efectúa exclusivamente arrastrando la fila hacia la izquierda (`txSwipe`).
- Superado el umbral de activación (80 px con dominancia horizontal), se activa el feedback visual rojo, se reproduce una única micro-vibración háptica y se colapsa la fila suavemente.

### 8.3. Política Estricta de Vibración Háptica
- **Regla:** Se prohíbe `navigator.vibrate()` en cambio de pestañas, apertura de modales, pulsación de botones o transiciones normales de pantalla.
- **Excepción única autorizada:** Exclusivamente en el gesto táctil de borrado por swipe en móvil cuando la fila supera el umbral crítico de eliminación (`navigator.vibrate(10)`).

### 8.4. Bloqueo de Scroll del Fondo (Scroll Lock)
Al abrir cualquier modal, diálogo o panel de pantalla completa, se debe congelar el scroll del body para evitar desplazamientos secundarios en iOS/Android:

```javascript
function lockBodyScroll() {
  document.body.classList.add('modal-open');
}
function unlockBodyScroll() {
  document.body.classList.remove('modal-open');
}
```
```css
body.modal-open {
  overflow: hidden !important;
  touch-action: none !important;
}
```

---

## 9. Cinemática, Microinteracciones y GPU (60/120 FPS)

Para garantizar un rendimiento de 60 FPS estables o 120 FPS en pantallas ProMotion, las animaciones se ejecutan exclusivamente sobre propiedades transformadas por GPU (`transform`, `opacity`).

### 9.1. Curvas de Aceleración Físicas
- **Salida / Cierre de pantalla:** `cubic-bezier(0.40, 0, 1, 1)` (duración: 200 ms).
- **Entrada / Apertura cinemática:** `cubic-bezier(0.16, 1, 0.30, 1)` (duración: 260 ms).
- **Volteo 3D y elementos con inercia:** `cubic-bezier(0.22, 1, 0.36, 1)` (duración: 620 ms).
- **Resortes / Muelles:** `cubic-bezier(0.34, 1.28, 0.64, 1)`.

### 9.2. Arquitectura de Volteo 3D Sin Colisiones (GPU Flip Card)
Al rotar una tarjeta para revelar un reverso (ej. Donut ⇄ Calendario o Resumen ⇄ Histórico):
1. El contenedor define `perspective: 1400px; transform-style: preserve-3d; isolation: isolate;`.
2. Las caras frontal y trasera definen `backface-visibility: hidden !important;`.
3. Para erradicar el aplanamiento 2D en Safari iOS, se separa en eje Z: `translateZ(1px)`.
4. Para evitar que la cara trasera se renderice en el plano 2D durante cambios de pestaña, se programa un retardo síncrono de visibilidad a los 90° (`transition: transform 0.62s, visibility 0s linear 0.31s`).

### 9.3. Soporte de Movimiento Reducido (Accesibilidad)
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 10. Adaptación a Pantallas de Escritorio (Desktop Layout)

A partir del breakpoint `@media (min-width: 768px)`, la aplicación transmuta de una experiencia móvil vertical a un panel de control horizontal de escritorio.

```
┌──────────────┬────────────────────────────────────────────────────────┐
│  SIDEBAR     │                      MAIN CONTENT                      │
│  width: 220px│  ┌──────────────────────────────────────────────────┐  │
│              │  │                   TOP SUMMARY                     │  │
│  [Logo ft.]  │  └──────────────────────────────────────────────────┘  │
│  [Mes / Año] │  ┌───────────────────────┬──────────────────────────┐  │
│              │  │  LEFT COLUMN (60%)    │  RIGHT COLUMN (40%)      │  │
│  [Nav Items] │  │  • Grouped Ledger     │  • Category Distribution │  │
│  [+ Añadir]  │  │  • Filtered Items     │  • Interactive Visuals   │  │
│              │  │                       │                          │  │
│  [Usuario]   │  └───────────────────────┴──────────────────────────┘  │
└──────────────┴────────────────────────────────────────────────────────┘
```

### 10.1. Reglas de Adaptación
1. **Ocultación de elementos móviles:** `.bottom-nav`, `.fab` y `.header` móvil se ocultan mediante `display: none !important;`.
2. **Sidebar estático:** Barra lateral izquierda fija (`width: 220px; height: 100dvh;`) que aloja el imagotipo, la navegación vertical por pestañas, el botón principal de acción y el perfil de usuario.
3. **Contención de ancho máximo:** El contenedor principal `.dt-main` acota su contenido (anchos de 760px a 1200px) para evitar la dispersión de datos en monitores ultrapanorámicos.
4. **Modales flotantes centrados:** Las hojas modales inferiores pasan a ser tarjetas emergentes centradas en pantalla (`max-width: 480px; border-radius: var(--radius-xl);`) con sombreado volumétrico.

---

## 11. Diseño Editorial para Exportaciones (PDF y Correo Electrónico)

### 11.1. Arquitectura de Exportación PDF ("White Edition A4")
- **Fondo:** `#FFFFFF` inmaculado (prohibidos marcos negros macizos).
- **Membrete institucional:** Logo textual limpio (`fin` en `#0F172A`, `track.` en verde esmeralda `#16A34A`), título en Outfit bold y metadatos en gris secundario `#64748B`.
- **Tarjetas KPI vectoriales:** Tarjetas planas sutiles con fondos translúcidos suaves (`rgba(52,199,89,0.08)`, `rgba(255,59,48,0.08)`, `rgba(0,122,255,0.08)`), bordes de `0.2mm` y esquinas suavemente curvadas.
- **Libro Mayor Agrupado:** Transacciones agrupadas por jornadas con cápsula de cabecera ultra-fina (4.6 mm de alto), insignias squircle de categoría renderizadas en alta resolución (Retina dpr=3) e importes formateados con cifras tabulares.
- **Separadores hairline:** Separación entre movimientos con micro-guías de `0.10mm` a `0.18mm` en color `#CBD5E1`.

### 11.2. Plantillas de Correo HTML Transaccional
- Contenedor White Edition centrado sobre fondo `#F8FAFC`.
- Membrete tipográfico oficial idéntico a la app.
- Tarjetas de resumen en cuadrícula con fondos pasteles suaves (`#F0FDF4` para positivo, `#FEF2F2` para gasto, `#EFF6FF` para balance).
- Botón principal de acción con esquinas squircle de 20px y color corporativo esmeralda `#16A34A`.

---

## 12. Plantilla Base CSS (Boilerplate Listo para Nuevos Proyectos)

Guarda este bloque en tu archivo `styles.css` o etiqueta `<style>` como punto de partida para cualquier nueva aplicación:

```css
/* ==========================================================================
   DESIGN SYSTEM BOILERPLATE — WHITE EDITION & LIQUID GLASS
   ========================================================================== */

/* 1. Reset e Importación Tipográfica */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  /* Tipografía */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-logo: 'Outfit', var(--font-sans);

  /* Tokens de Superficie (Modo Claro) */
  --bg: #EEF0F3;
  --bg2: rgba(255, 255, 255, 0.62);
  --bg3: rgba(120, 120, 140, 0.08);
  --bg4: rgba(120, 120, 140, 0.14);
  --bg-grouped: #FFFFFF;
  --card-border: rgba(255, 255, 255, 0.65);

  /* Texto */
  --text: #1C1C1E;
  --text2: #3C3C43;
  --text3: #5C5C61;
  --text4: #71717A;

  /* Separadores */
  --separator: rgba(60, 60, 67, 0.12);
  --separator2: rgba(60, 60, 67, 0.06);

  /* Acentos Semánticos */
  --green: #34C759;
  --green-text: #1E7B35;
  --brand-green: #248A3D;
  --red: #FF3B30;
  --amber: #FF9500;
  --blue: #007AFF;
  --accent-grad: linear-gradient(135deg, #34C759, #0FB8AD);

  /* Cristal y Sombras */
  --glass-inner: 0 1px 0 rgba(255, 255, 255, 0.60) inset, 0 -0.5px 0 rgba(0, 0, 0, 0.04) inset;
  --shadow: 0 12px 34px rgba(30, 30, 60, 0.10), 0 2px 6px rgba(30, 30, 60, 0.05);
  --shadow-sm: 0 6px 18px rgba(30, 30, 60, 0.07), 0 1px 2px rgba(30, 30, 60, 0.04);

  /* Radios Squircle */
  --radius-xl: 28px;
  --radius-lg: 20px;
  --radius-md: 16px;
  --radius-sm: 14px;
  --radius-xs: 10px;
  --radius-pill: 9999px;

  /* Ergonomía */
  --btn-h: 44px;
  --input-h: 44px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #06060A;
    --bg2: rgba(54, 54, 60, 0.55);
    --bg3: rgba(255, 255, 255, 0.07);
    --bg4: rgba(255, 255, 255, 0.12);
    --bg-grouped: #1C1C1E;
    --card-border: rgba(255, 255, 255, 0.12);

    --text: #FFFFFF;
    --text2: rgba(235, 235, 245, 0.78);
    --text3: rgba(235, 235, 245, 0.58);
    --text4: rgba(235, 235, 245, 0.48);

    --separator: rgba(84, 84, 88, 0.60);
    --separator2: rgba(84, 84, 88, 0.36);

    --green-text: #34C759;
    --brand-green: #34C759;

    --glass-inner: 0 1px 0 rgba(255, 255, 255, 0.18) inset, 0 -0.5px 0 rgba(0, 0, 0, 0.20) inset;
    --shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 2px 4px rgba(0, 0, 0, 0.40);
    --shadow-sm: 0 8px 22px rgba(0, 0, 0, 0.40), 0 1px 2px rgba(0, 0, 0, 0.25);
  }
}

/* 2. Cuerpo y Reglas de Renderizado */
html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  touch-action: pan-y;
}

/* 3. Cifras Tabulares Universales */
table, .tabular-nums, .num, .amount, .date, .kpi-val {
  font-variant-numeric: tabular-nums !important;
  -webkit-font-feature-settings: 'tnum' 1, 'cv02' 1, 'cv03' 1, 'cv04' 1, 'cv11' 1 !important;
  font-feature-settings: 'tnum' 1, 'cv02' 1, 'cv03' 1, 'cv04' 1, 'cv11' 1 !important;
}

/* 4. Tap Target de 44px Accesible */
.btn-icon, .icon-btn, .action-sm {
  position: relative;
}
.btn-icon::after, .icon-btn::after, .action-sm::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 44px;
  min-height: 44px;
}

/* 5. Scroll Lock de Modales */
body.modal-open {
  overflow: hidden !important;
  touch-action: none !important;
}

/* 6. Modo de Movimiento Reducido */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

*Fin del documento de especificación. Conservar este archivo como la biblia canónica de diseño para cualquier nueva aplicación del usuario.*
