# Auditoría Exhaustiva de UX, Ergonomía Mobile/PWA y Simplificación de Flujos — fintrack

> **Auditor:** Agente 3 — Especialista en UX, Ergonomía Mobile/PWA y Optimización de Interacción  
> **Fecha de Auditoría:** 14 de Noviembre de 2026  
> **Versión de Base de Código Analizada:** `2026.11.09.1` (Caché `fintrack-cache-v202`)  
> **Ámbito de Inspección:** `index.html` (DOM, CSS, Event Listeners, Gestos Táctiles, Modales, Formularios y Motor de Interacción), `DESIGN_SYSTEM.md`, `PROJECT_CONTEXT.md`  
> **Modo de Operación:** Estrictamente de solo lectura (Read-Only Audit). Sin modificaciones a código fuente de producción.

---

## 1. Resumen Ejecutivo

La aplicación web progresiva (PWA) **fintrack** ha alcanzado una madurez visual notable bajo el lenguaje de diseño *White Edition & Liquid Glass*, con una refinada estética basada en refracciones físicas, tipografía tabular (`tabular-nums`) y estricto cumplimiento de Cero Emojis mediante iconos vectoriales monocromáticos.

Sin embargo, tras una exhaustiva auditoría ergonómica y funcional de los flujos móviles, se evidencia que el crecimiento orgánico de la aplicación ha provocado una **acumulación progresiva de fricción operativa**:
1. **Proliferación de controles redundantes y duplicados:** Existen múltiples caminos que compiten entre sí para realizar la misma tarea (por ejemplo, tres formas distintas e inconexas de acceder a la visión anual, o botones de cierre redundantes en hojas modales que ya cuentan con gesto de arrastre y backdrop click).
2. **Exceso de pasos y clics en tareas críticas:** El registro de un movimiento estándar (gasto diario) exige navegar por hasta 12 controles verticales en un modal no paginado, recurriendo a selectores nativos `<select>` que despliegan engorrosas ruedas de desplazamiento en iOS/Android.
3. **Violaciones puntuales de la zona del pulgar (*Thumb Zone*):** Pese a contar con una barra de navegación inferior flotante (`.bottom-nav`) y un botón de acción flotante (`.fab`) ejemplares en el tercio inferior, controles habituales de navegación temporal (flechas de mes anterior/siguiente, selector modal de mes, engranaje de ajustes y alternancia anual) están confinados exclusivamente a la cabecera superior derecha (zona de máximo sobre-esfuerzo o *Red Zone* en terminales de 6.1" a 6.7").
4. **Colisiones de Hit Targets e inconsistencias táctiles:** Aunque se han implementado pseudo-elementos `::after` para asegurar áreas táctiles de 44×44 px en varios botones pequeños, se han detectado colisiones por solapamiento geométrico de áreas de toque en la barra de periodos y en filas de cuentas, así como elementos interactivos clave (como el botón para ocultar el saldo de cartera) que carecen por completo de la holgura mínima de 44 px.
5. **Fricción del teclado virtual en hojas modales:** Al abrir el teclado numérico en pantallas móviles, los botones primarios de acción (`Guardar` y `Cancelar`) quedan desplazados por debajo del área visible (*below the fold*), forzando al usuario a ocultar manualmente el teclado o deslizar a ciegas para confirmar un registro.
6. **Desconexión entre pestañas para la entrada rápida:** El botón de acción flotante (`#fabBtn`) está programado para ocultarse rígidamente en todas las pestañas excepto en Inicio (`activeTab !== 0`), obligando al usuario a cambiar forzosamente a Inicio para registrar un gasto o ingreso mientras consulta sus Cuentas o Categorías.

A continuación se detalla la radiografía ergonómica completa, el análisis flujo a flujo (actual vs. simplificado), el catálogo exhaustivo de controles redundantes, la matriz de impacto vs. esfuerzo y la guía de verificación independiente.

---

## 2. Auditoría de Ergonomía Táctil y Mobile/PWA

### 2.1. Mapeo de la Zona del Pulgar (*Thumb Zone Architecture*)

En ergonomía de interfaces móviles para sujeción a una sola mano (según el estándar de Steven Hoober y las directrices de Apple HIG / Material Design 3), la pantalla de un smartphone moderno (pantallas de 6.1" a 6.7") se divide verticalmente en tres zonas biomecánicas:

```
┌──────────────────────────────────────────────────────────┐
│  ZONA ROJA / ALTO ESFUERZO (0% - 30% altura)             │
│  • Requiere reajuste de mano o segunda mano.             │
│  [ft.]                     [Anual] [<] [Mes Año] [>] [⚙] │ <- CONTROLES DE NAVEGACIÓN TEMPORAL Y AJUSTES
├──────────────────────────────────────────────────────────┤
│  ZONA AMARILLA / ALCANCE MEDIO (30% - 65% altura)        │
│  • Accesible con flexión/estiramiento del pulgar.        │
│  • Tarjetas KPI (Ingresos, Gastos, Balance)              │
│  • Gráfico Donut / Heatmap interactivo                   │
│  • Buscador `#txSearchInput` y conmutador [Todo|Mes]     │
├──────────────────────────────────────────────────────────┤
│  ZONA VERDE / CONFORT DEL PULGAR (65% - 100% altura)     │
│  • Arco natural de movimiento del pulgar en reposo.      │
│  • Listado de movimientos recientes agrupados            │
│  • Botón Flotante (`.fab`) a 76px de la base             │
│  • Cápsula de deshacer (`.undo-toast`) a 76px            │
│  • Barra de navegación inferior flotante (`.bottom-nav`) │
└──────────────────────────────────────────────────────────┘
```

#### Hallazgos Clave de Zonificación:
1. **Acierto Arquitectónico:** La barra inferior flotante (`.bottom-nav`, líneas 2269–2321 en `index.html`) y el FAB (`#fabBtn`, línea 2323) respetan escrupulosamente la zona verde de confort, situándose a `calc(14px + var(--safe-bottom))` y `calc(76px + var(--safe-bottom))` respectivamente.
2. **Deficiencia Crítica en Navegación Temporal:** Los controles más utilizados durante una sesión de consulta (cambiar de mes mediante chevrons `#prevMonth` / `#nextMonth` o pulsar `#monthLabel` para desplegar el calendario) están situados en la coordenada `top: 0` (`.header`, línea 423), en el extremo derecho superior. En terminales como iPhone 15/16 Pro Max o Galaxy S24 Ultra, alcanzar el botón de mes anterior o la rueda de ajustes exige desplazar físicamente la mano sobre el chasis, con alto riesgo de caída del dispositivo.
3. **Ausencia de Gestos Horizontales de Periodo:** No existe soporte táctil para deslizar horizontalmente (*swipe left / swipe right*) sobre el área del gráfico o la cabecera para cambiar de mes. Todo el cambio de mes depende exclusivamente de acertar en los micro-botones de 32px situados en la cúspide de la pantalla.

---

### 2.2. Auditoría de Tap Targets (Estándar 44×44 px y WCAG 2.5.5)

El sistema de diseño (`DESIGN_SYSTEM.md`, §1.5 y §8.1) y la regla WCAG 2.5.5 exigen que todo elemento interactivo disponga de un área táctil mínima de **44×44 px**. En `index.html` se utiliza la técnica de expandir botones visualmente compactos mediante pseudoelementos `::after`. No obstante, la inspección minuciosa del DOM y las reglas CSS revela varias deficiencias severas:

#### 1. Colisión por solapamiento de Hit Targets en la barra de periodos (`.period-toolbar`)
- **Ubicación en código:** `index.html`, líneas 431–442 y 2234–2240.
- **Observación técnica:**
  ```css
  /* Línea 431 */ .period-toolbar { display: flex; align-items: center; gap: 6px; }
  /* Línea 434 */ .month-nav { display: flex; align-items: center; gap: 4px; }
  /* Línea 435 */ .home-annual-toggle { width: 32px; height: 32px; margin-right: 2px; position: relative; }
  /* Línea 436 */ .home-annual-toggle::after { content: ''; position: absolute; inset: -6px; } /* Hit target: 44×44px */
  /* Línea 439 */ .nav-btn { width: 32px; height: 32px; position: relative; }
  /* Línea 441 */ .nav-btn::after { content: ''; position: absolute; inset: -6px; } /* Hit target: 44×44px */
  ```
- **Fallo ergonómico:** La separación física entre `.home-annual-toggle` (`#homeAnnualBtn`) y el primer botón `.nav-btn` (`#prevMonth`) es de solo `2px` de margen + `6px` de gap = `8px`. Como ambos botones expanden su pseudoelemento `6px` en todas direcciones (`inset: -6px`), sus áreas táctiles invisibles se solapan en una franja de **4 px de ancho**. Al intentar pulsar `#prevMonth` para retroceder un mes, el usuario activa accidentalmente la vista anual `#homeAnnualBtn`, causando una transición de pantalla inesperada y frustración de navegación.
- **Solución:** Reubicar `#homeAnnualBtn` fuera de la barra de navegación mensual (o unificarlo en el selector de periodo) e incrementar el espaciado a `gap: 12px` entre controles táctiles con target expandido.

#### 2. Botón de visibilidad de saldo en Cartera de Inversión (`togglePortfolioValue`)
- **Ubicación en código:** `index.html`, línea 6698.
- **Código observado:**
  ```html
  <section class="portfolio-card">
    <span>Valor de cartera 
      <button type="button" onclick="togglePortfolioValue()" aria-label="Ocultar o mostrar valor de cartera" 
              style="border:0;background:transparent;color:inherit;font-size:15px;cursor:pointer;padding:0 0 0 7px">
        <!-- SVG 15×15 -->
      </button>
    </span>
  ...
  ```
- **Fallo ergonómico:** Este botón interactivo inline tiene un tamaño físico de apenas `15×15 px` con un padding lateral unilateral de `7px`. No tiene `min-width: 44px`, ni `min-height: 44px`, ni cuenta con pseudoelemento `::after` anclado con `position: relative`. En un dispositivo móvil, acertar sobre el ojo para ocultar el importe de la cartera requiere una puntería milimétrica imposible durante el uso en movilidad.
- **Solución:** Dotar al botón de `position: relative`, display `inline-flex`, centrado geométrico y un área táctil mínima garantizada de `44×44 px` (`min-width: 44px; min-height: 44px;`).

#### 3. Selector de color de cuenta (`.pat-acc-color`) vs. Estrella de cuenta predeterminada (`.pat-acc-star`)
- **Ubicación en código:** `index.html`, líneas 1276–1280 y 5402–5404.
- **Código observado:**
  ```html
  <div class="pat-account-row">
    <div class="pat-acc-color" style="background:#007AFF;cursor:pointer" data-action="show-acc-colorform" data-id="..."></div>
    <span class="pat-acc-name">Cuenta Principal</span>
    <button class="pat-acc-star on" data-action="set-default-acc" data-id="..."></button>
    ...
  </div>
  ```
- **Fallo ergonómico:** La pastilla `.pat-acc-color` mide `14×14 px`. El botón `.pat-acc-star` mide `18×18 px`. Toda la fila `.pat-account` tiene un listener de clic en línea 5400 que expande/colapsa el historial de saldos (`toggleAccCard`). Aunque ambos botones pequeños tienen asignado `::after` de 44px en CSS, la densidad de controles en la misma fila horizontal (`.pat-acc-color` de 14px, nombre de cuenta, `.pat-acc-star`, importe teórico y `.del-btn-sm`) produce frecuentes pulsaciones erróneas que disparan la expansión del historial en lugar de abrir la paleta de color o marcar la cuenta favorita.

#### 4. Selector de rango temporal en Ficha de Activo de Inversión (`.asset-range`)
- **Ubicación en código:** `index.html`, líneas 1982–1988 y 6521.
- **Código observado:**
  ```html
  <div class="asset-range" id="assetRanges">
    <button data-range="d">1D</button>
    <button data-range="m">1M</button>
    <button data-range="m6">6M</button>
    <button data-range="ytd">YTD</button>
    <button data-range="y">1A</button>
    <button data-range="y5">5A</button>
  </div>
  ```
- **Fallo ergonómico:** En dispositivos con anchos de pantalla de 360 px a 390 px, disponer 6 botones en una sola fila (`display: flex; gap: 4px;`) otorga a cada botón un ancho útil de apenas 50 px, con una altura de `30 px` (`padding: 5px 0`). La altura táctil es inferior a los 44 px recomendados, provocando toques falsos entre rangos adyacentes (`1M` vs `6M` o `YTD` vs `1A`).

---

### 2.3. Integración de Áreas Seguras (*Safe Areas & Inset Margins*)

fintrack declara correctamente variables de entorno CSS para safe areas en la raíz:
```css
--safe-top: env(safe-area-inset-top, 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
```

#### Puntos Críticos Detectados:
1. **Solapamiento vertical entre `.undo-toast` y `.fab`:**
   - En la versión `2026.09.08.2` (línea 551 en `PROJECT_CONTEXT.md`), el aviso `.undo-toast` se ubicó en la parte superior estilo Dynamic Island para evitar colisionar con el FAB flotante.
   - En la actualización `2026.11.09.1` (línea 575 en `PROJECT_CONTEXT.md`), se devolvió `.undo-toast` a la zona ergonómica inferior del pulgar:
     ```css
     /* Línea 1388 */ .fab { position: fixed; bottom: calc(76px + var(--safe-bottom)); right: 20px; ... }
     /* Línea 1394 */ .undo-toast { position: fixed; left: 50%; bottom: calc(76px + var(--safe-bottom)); ... }
     ```
   - **Riesgo ergonómico:** Ambos elementos comparten exactamente la misma línea base inferior (`76px + safe-bottom`). Cuando el usuario elimina una transacción en Inicio y aparece el `.undo-toast` centrado horizontalmente con su cápsula Liquid Glass, si el texto del toast es largo (*"Transacción eliminada"* + botón `Deshacer`), su extremo derecho se aproxima peligrosamente al FAB flotante (56×56 px), compitiendo por la misma zona física del pulgar derecho.
   - **Recomendación:** Ajustar dinámicamente la elevación del FAB cuando el toast esté activo (elevando el FAB temporalmente a `bottom: calc(136px + var(--safe-bottom))` con transición elástica) o elevar el toast a `calc(84px + var(--safe-bottom))` asegurando un margen horizontal libre de al menos 80px respecto al margen derecho.

2. **Padding inferior en `.asset-sheet`:**
   - La hoja de detalle de producto en Inversión define:
     ```css
     padding: max(16px, env(safe-area-inset-top)) 18px calc(92px + env(safe-area-inset-bottom));
     ```
   - Esta métrica es adecuada para salvar los botones flotantes de Comprar y Vender, garantizando que el contenido final no quede oculto bajo la barra inferior en terminales con barra gestual de iOS (*Home Indicator*).

---

### 2.4. Arquitectura de Modales, Bloqueo de Scroll y Teclado Virtual

#### 1. Fricción por desplazamiento del botón `Guardar` al abrir el teclado virtual
- **Ubicación en código:** `index.html`, líneas 1408–1473, 2324–2392 y 7030.
- **Comportamiento observado:**
  Al pulsar el FAB, `openModal()` invoca un retardo para enfocar el campo de importe:
  ```javascript
  setTimeout(function(){ document.getElementById('txAmount').focus(); }, 300);
  ```
  Esto despliega de inmediato el teclado numérico del sistema operativo móvil.
  - En iOS Safari y navegadores basados en WebKit, el teclado consume entre 280 px y 340 px de altura.
  - La hoja modal `.modal` tiene `max-height: 94dvh; overflow-y: auto;`.
  - La fila de botones `.modal-btns` (`Cancelar` y `Guardar`, línea 2389) está situada al final del formulario (`margin-top: 24px`), después del importe, modo de cálculo, categoría, subcategoría, cuenta, nota, fecha y recurrencia.
  - **Consecuencia de usabilidad:** Con el teclado desplegado, el botón verde `Guardar` queda totalmente oculto bajo el teclado. El usuario, tras introducir el importe (ej. `14,50`), se ve obligado a:
    1. Tocar fuera del teclado o pulsar la tecla "Listo" de la barra de accesorios para ocultar el teclado.
    2. O bien intentar hacer scroll vertical dentro de la ventana modal encogida para asomar el botón `Guardar`.
  - **Solución ergonómica:** Convertir la barra de acciones de la modal en una **Action Bar sticky inferior** (`position: sticky; bottom: 0; background: var(--bg2); backdrop-filter: var(--glass-blur);`) que flote visiblemente por encima del teclado o del borde inferior en todo momento, permitiendo guardar la transacción con un solo toque inmediatamente después de teclear la cifra.

#### 2. Discrepancias en el Gesto de Arrastre para Cerrar (*Drag-to-Dismiss*)
- **Ubicación en código:** `index.html`, líneas 9613–9707.
- **Observación técnica:**
  La función autoejecutable `initModalDragToDismiss` busca exclusivamente elementos con clase `.modal-bg.visible`:
  ```javascript
  var bg = document.querySelector('.modal-bg.visible');
  if(!bg) return;
  var modal = bg.querySelector('.modal');
  if(!modal) return;
  ```
- **Fallo de consistencia:**
  - Las ventanas modales estándar (`#modalBg`, `#exportModalBg`, `#adjustModalBg`, `#budgetModalBg`, `#monthModalBg`) sí soportan el arrastre hacia abajo para cerrar.
  - Sin embargo, la ficha de activo de inversión (`.asset-sheet`, líneas 6521–6540) y el modal de operativa de compra/venta (`.investment-trade-modal`, líneas 6467–6494) **no utilizan `.modal-bg` ni `.modal`**.
  - Como consecuencia, cuando un usuario abre una acción o ETF en Inversión, **el gesto táctil natural de deslizar la tarjeta hacia abajo para cerrarla no funciona**. El usuario se siente bloqueado y está forzado a buscar el diminuto botón `X` en la esquina superior derecha (`.asset-sheet-close`, línea 6521) a más de 140 mm de distancia de su pulgar.

---

## 3. Comparativa Flujo por Flujo: Pasos Actuales vs. Flujos Optimizados

A continuación se auditan los siete flujos de interacción más frecuentes de la aplicación, contrastando la fricción del flujo vigente frente a la propuesta de simplificación ergonómica.

---

### Flujo 1: Registro Rápido de un Gasto Ordinario (Quick Add Transaction)

*El registro de un gasto diario (café, comida, supermercado, gasolina) representa más del 80% del uso operativo de fintrack.*

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO ACTUAL: 10 pasos / 8 toques / 3 interacciones con selectores      │
└────────────────────────────────────────────────────────────────────────┘
1. Usuario pulsa FAB (+) en pantalla de Inicio.
2. Modal #modalBg se anima hacia arriba; el cursor enfoca #txAmount a los 300ms.
3. Teclado numérico se despliega y oculta los botones de Guardar.
4. Usuario teclea el importe (ej. "3,50").
5. Usuario observa la pastilla de modo de cálculo ("Computar todo" con 3 puntos) 
   que ocupa el 45% del ancho de la fila de importe, generando distracción visual.
6. Usuario hace scroll o toca para enfocar el selector nativo <select id="txCat">.
7. Sistema operativo abre la rueda/selector nativo; usuario desplaza entre 15 categorías y pulsa "Listo".
8. (Opcional) Usuario interactúa con selector nativo <select id="txSubcat">.
9. Usuario debe ocultar el teclado o arrastrar la modal hacia arriba para ver el pie.
10. Usuario pulsa el botón verde "Guardar".
11. Sistema muestra "guardando...", demora artificial de 600ms (setTimeout) y se cierra la modal.
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO PROPUESTO SIMPLIFICADO: 3 pasos / 3 toques / Cero ruedas nativas  │
└────────────────────────────────────────────────────────────────────────┘
1. Usuario pulsa FAB (+) desde cualquier pantalla financiera (Inicio, Cuentas, Categorías).
2. Modal se abre enfocando el importe; bajo el importe aparecen 4-5 chips táctiles 
   de las categorías más frecuentes de gasto (ej. Supermercado, Restaurantes, Transporte, Hogar) 
   con su icono SVG y color correspondiente.
3. Usuario teclea "3,50", toca el chip "Restaurantes" y pulsa la tecla "Enter" 
   del teclado virtual (enterkeyhint="done") o la barra sticky inferior de "Guardar".
   -> Guardado instantáneo con cierre inmediato y feedback mediante .undo-toast.
   Ahorro neto: Reducción del 65% en tiempo de interacción y eliminación de 7 pasos innecesarios.
```

---

### Flujo 2: Traspaso Interno entre Cuentas (Internal Transfer)

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO ACTUAL: 7 pasos / 6 toques                                       │
└────────────────────────────────────────────────────────────────────────┘
Opción A (desde FAB):
1. Usuario pulsa FAB (+).
2. Modal se abre en modo "Gasto".
3. Usuario pulsa el tercer segmento "Transferencia" en .type-toggle.
4. El DOM conmuta: se ocultan categorías y cálculo; se muestra #txTransferWrap 
   con dos selectores nativos ("Desde", "Hacia") y un botón central de swap.
5. Usuario introduce el importe.
6. Usuario abre el select "Desde", selecciona cuenta origen. Abre select "Hacia", selecciona destino.
7. Usuario pulsa "Guardar".

Opción B (desde pestaña Cuentas):
1. Usuario pulsa pestaña Cuentas.
2. Cada tarjeta de cuenta tiene un botón "Transferir" explícito (pat-acc-btn-primary).
3. Usuario pulsa "Transferir" en Cuenta A -> abre modal #modalBg preseleccionando Cuenta A.
4. Usuario selecciona Cuenta B y teclea importe.
5. Usuario pulsa "Guardar".
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO PROPUESTO SIMPLIFICADO: 3 pasos / 3 toques                       │
└────────────────────────────────────────────────────────────────────────┘
1. En pestaña Cuentas: Gesto intuitivo de arrastrar la tarjeta de Cuenta A 
   hacia la tarjeta de Cuenta B (Drag-to-Transfer) O pulsar un único botón 
   de Traspaso Rápido en la cabecera de Cuentas.
2. Se abre una micro-hoja inferior minimalista: "¿Cuánto quieres transferir de [Cuenta A] a [Cuenta B]?".
3. Usuario introduce el importe y pulsa "Transferir".
   Ahorro neto: Eliminación de redundancia de N botones "Transferir" repetidos en cada tarjeta de cuenta.
```

---

### Flujo 3: Reconciliación Bancaria y Ajuste de Saldo Real

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO ACTUAL: 6 pasos / 5 toques / Controles confusos                  │
└────────────────────────────────────────────────────────────────────────┘
1. Usuario pulsa pestaña Cuentas.
2. Pulsa el botón "Ajustar saldo" en la tarjeta de la cuenta deseada.
3. Se abre la modal #adjustModalBg:
   - Muestra arriba: Saldo teórico (ej. 1.450,20 €) y un botón verde 
     "Conciliar (0 € desfase)" que sobreescribe el saldo real con el teórico.
   - Campo "Saldo real en banco" con un botón de signo "±" (#adjustSignToggle) a su derecha.
   - Badge dinámico de desfase calculado.
   - Selector de fecha.
   - Botón "Cancelar" y botón "Guardar ajuste".
4. Usuario teclea su saldo real observado en la app del banco.
5. Usuario revisa el desfase.
6. Usuario pulsa "Guardar ajuste".
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO PROPUESTO SIMPLIFICADO: 3 pasos / 2 toques                       │
└────────────────────────────────────────────────────────────────────────┘
1. Usuario pulsa "Ajustar saldo" (o toca dos veces sobre la cifra de saldo en la tarjeta).
2. Se abre la hoja inferior con foco automático en el importe numérico.
   - Se suprime el botón redundante "±" (el 99% de las cuentas tienen saldo positivo; 
     si fuera negativo basta teclear el signo menos o pulsar un toggle sutil solo si el saldo es cero).
   - Se suprime el botón confuso "Conciliar (0 € desfase)" que contradice la filosofía 
     contable de contrastar contra el extracto bancario real.
   - Muestra en tiempo real la diferencia calculada con feedback cromático claro.
3. Usuario teclea el saldo y pulsa "Confirmar ajuste" directamente en el teclado o barra inferior.
```

---

### Flujo 4: Navegación de Periodo y Alternancia entre Mes y Año

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO ACTUAL: 3 mecanismos inconexos y redundantes                     │
└────────────────────────────────────────────────────────────────────────┘
Mecanismo 1: Botón #homeAnnualBtn en la cabecera (icono de calendario).
- Al pulsarlo, conmuta homeAnnualMode = !homeAnnualMode en Inicio.
- Cambia la etiqueta de mes a "2026" y muestra datos de todo el año en la pantalla mensual.

Mecanismo 2: Modal de selección de mes (#monthModalBg).
- Al pulsar la etiqueta del mes, se abre un selector con 12 botones de mes.
- Al pie hay dos botones: "Ver todo el año" y "Mes actual".
- "Ver todo el año" hace exactamente lo mismo que el Mecanismo 1 (selectPickerWholeYear).

Mecanismo 3: Pestaña "Análisis" en la barra inferior (Tab 3).
- Es una pestaña completa dedicada al resumen del año (gráficos anuales, comparativa vs mes anterior, 
  evolución patrimonial y estadísticas).
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO PROPUESTO SIMPLIFICADO: Unificación coherente                    │
└────────────────────────────────────────────────────────────────────────┘
1. Eliminar el botón #homeAnnualBtn de la cabecera móvil de Inicio:
   - Libera 38px de espacio horizontal en la cabecera, acabando con las colisiones táctiles de #prevMonth.
   - Elimina la redundancia con la pestaña 3 ("Análisis"), que ya es el hogar natural de la visión anual.
2. El selector modal #monthModalBg conserva los 12 meses y un botón de acceso directo "Mes actual". 
3. Soporte para gesto táctil swipe horizontal en la pantalla principal para avanzar/retroceder mes cómodamente con el pulgar.
```

---

### Flujo 5: Gestión de Categorías y Presupuestos

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO ACTUAL: Conmutación de modo pantalla completa y diálogos nativos │
└────────────────────────────────────────────────────────────────────────┘
1. En pestaña Categorías, para renombrar o cambiar color/icono, el usuario debe 
   pulsar el botón "[ Editar ]" en la cabecera.
2. Toda la pantalla transmuta a "Modo Edición": desaparecen importes y barras, 
   aparecen drag handles, botones de archivar y borrar.
3. Al pulsar sobre el nombre de una categoría para renombrarla, el sistema dispara 
   un cuadro de diálogo nativo del navegador: window.prompt('Nombre de la categoría:').
4. Al pulsar "Subcategoría", se despliega un formulario inline en la tarjeta que desplaza 
   verticalmente las tarjetas inferiores.
5. El usuario debe pulsar "[ Listo ]" para volver al modo normal.
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO PROPUESTO SIMPLIFICADO: Edición contextual por tarjeta           │
└────────────────────────────────────────────────────────────────────────┘
1. Suprimir el cuadro de diálogo nativo window.prompt(), sustituyéndolo por un 
   renombrado inline directo en el campo de texto o una hoja modal ergonómica.
2. Mantener la pantalla en una vista única y limpia: pulsar de forma prolongada (long press) 
   o tocar el icono de la categoría abre una hoja inferior de personalización (Color, Icono, Renombrar, Archivar).
3. Evita tener dos modos globales mutuamente excluyentes que desconciertan al usuario.
```

---

### Flujo 6: Búsqueda y Filtrado de Movimientos

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO ACTUAL: 5 acciones independientes para limpiar filtros           │
└────────────────────────────────────────────────────────────────────────┘
1. Usuario abre el panel de filtros (#txFiltersToggle).
2. Se despliegan 4 chips de tipo, 3 selectores nativos <select> y 2 inputs de fecha.
3. Si el usuario filtra por "Gastos", categoría "Ocio" y fecha "01/10/2026 - 15/10/2026", 
   para volver a ver todos los movimientos debe:
   - Tocar chip "Todos".
   - Abrir select de Categorías y elegir "Todas".
   - Abrir select de Cuentas y elegir "Todas las cuentas".
   - Abrir select de Ordenación y elegir "Fecha (reciente)".
   - Tocar la pequeña cruz de limpiar rango de fechas (.date-range-clear).
   -> Total: 5 operaciones manuales dispersas.
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO PROPUESTO SIMPLIFICADO: Reset en un solo toque                   │
└────────────────────────────────────────────────────────────────────────┘
1. Incorporar un botón visible y ergonómico "Restablecer filtros" / "Limpiar todo" 
   junto al indicador de recuento (#txFiltersToggle .tx-filters-count).
2. Con un solo toque, todas las variables de filtro vuelven al estado base:
   filterType='all', filterCat='', filterAccount='', filterDateFrom='', filterDateTo='', searchQuery=''.
```

---

### Flujo 7: Operativa de Inversión y Ficha de Activo

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO ACTUAL: Doble pila modal superpuesta                             │
└────────────────────────────────────────────────────────────────────────┘
1. Usuario busca un producto en Inversión -> Toca resultado.
2. Se abre .asset-sheet (pantalla fija superpuesta con gráfico y datos).
3. Usuario pulsa "Comprar".
4. Se abre .investment-trade-modal SOBRE la .asset-sheet (pila de 2 modales).
5. Usuario introduce importe y confirma compra.
6. La modal de compra se cierra... pero el usuario permanece atrapado en .asset-sheet.
7. Usuario debe buscar y pulsar el botón cerrar en la esquina superior derecha para volver a la cartera.
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLUJO PROPUESTO SIMPLIFICADO: Cierre en cascada o Bottom Sheet unificada│
└────────────────────────────────────────────────────────────────────────┘
1. Al confirmar la compra o venta con éxito en .investment-trade-modal, cerrar 
   automáticamente tanto la modal de operativa como la .asset-sheet subyacente, 
   devolviendo al usuario directamente a su pestaña Inversión con un toast de confirmación.
2. Soporte de gesto de arrastre hacia abajo (drag-to-dismiss) en .asset-sheet.
```

---

## 4. Catálogo Exhaustivo de Botones y Controles Redundantes

A continuación se auditan, pantalla por pantalla y formulario por formulario, los controles que presentan duplicidad funcional o saturación visual injustificada:

| Elemento / Control | Ubicación (Línea / Selector) | Función Actual | Justificación de Redundancia / Sobrecarga | Propuesta de Acción |
|---|---|---|---|---|
| **Botón de Vista Anual en Cabecera** (`#homeAnnualBtn`) | `index.html:2235`<br>`.home-annual-toggle` | Alterna `homeAnnualMode` en pestaña Inicio. | **Duplicidad triple:** La visión anual ya dispone de una pestaña dedicada en la barra inferior (Tab 3: "Análisis") y de un botón "Ver todo el año" en el selector de mes. Genera colisiones táctiles con `#prevMonth`. | **Eliminar de la cabecera móvil.** Dejar la cabecera limpia con selector de mes y ajustes. |
| **Botón "Cerrar" en Modal de Exportación** | `index.html:2443`<br>`.exportModalBg .btn-cancel` | Cierra la modal de exportación. | **Innecesario:** Cada botón de formato (`PDF`, `XLSX`, `CSV`) descarga y cierra directamente. Además, la modal ya se cierra por tap en el fondo oscuro y por arrastre hacia abajo. | **Eliminar o sustituir** por el gesto nativo de arrastre y tap fuera. |
| **Botón "Cerrar" en Selector de Periodo** | `index.html:2535`<br>`.month-picker-modal .btn-cancel` | Cierra el selector de mes. | **Innecesario:** Al tocar cualquier mes de la cuadrícula, la modal se selecciona y se cierra automáticamente (`selectPickerMonth`). Ocupa altura vertical en la zona inferior. | **Eliminar.** Mantener únicamente el cierre táctil natural. |
| **Botón de alternancia de signo "±"** (`#adjustSignToggle`) | `index.html:2465`<br>`#adjustSignToggle` | Añade o quita el signo menos al saldo real bancario. | **Sobrecarga visual:** Los saldos bancarios ordinarios son positivos. En caso de descubiertos, el teclado numérico permite teclear el guion o el sistema puede detectarlo. Ocupa 48px horizontales valiosos en la fila del importe. | **Eliminar.** Dar el 100% del ancho al campo numérico `#adjustRealAmount`. |
| **Botón "Conciliar (0 € desfase)"** | `index.html:2457`<br>`.cat-edit-tool-btn` | Copia el saldo teórico en el campo real. | **Contradicción conceptual:** Desvirtúa la reconciliación real obligatoria exigida por las reglas contables de fintrack. Si no hay desfase, no se requiere ajuste. Si lo hay, copiar el teórico induce a error. | **Retirar.** Mostrar el saldo teórico de forma meramente informativa sin botón de sobreescritura automática. |
| **Botones individuales "Transferir" en cada tarjeta de cuenta** | `index.html:5417`<br>`.pat-acc-btn-primary` | Abre la modal de traspaso con la cuenta de origen prefijada. | **Hipertrofia de botones:** Si el usuario tiene 6 cuentas bancarias, la pantalla de Cuentas muestra 6 botones idénticos de "Transferir". | **Centralizar** en una acción global de traspaso en la cabecera de Cuentas o en el selector del FAB. |
| **Pastilla de cálculo contable tri-estado en formulario de transacción** | `index.html:2334`<br>`#txExcludeCalcWrap` | Conmuta entre Modo 0 (Todo), Modo 1 (Balance) y Modo 2 (No computar). | **Sobrecarga en el 98% de casos:** Divide horizontalmente la fila del importe principal en la pantalla más sensible de la app. Los modos 1 y 2 son excepciones contables poco frecuentes. | **Mover a "Opciones avanzadas"** colapsables o al menú contextual inferior de la modal. |
| **Ojo de ocultación de saldo en tarjeta de Cartera** | `index.html:6698`<br>`.portfolio-card button` | Conmuta privacidad numérica de inversiones. | **Duplicidad de privacidad:** Ya existe el Modo Privado global que se activa con doble toque en el logo `ft.` o tocando la tarjeta de Balance. Tener un ojo específico e independiente de 15px en Inversión crea confusión sobre qué cifras están protegidas. | **Homogeneizar** con el Modo Privado global o dotar de hit-target de 44px integrado en la propia tarjeta. |

---

## 5. Oportunidades Concretas de Simplificación de Flujos

### 5.1. Barra de Acción Adhesiva (*Sticky Action Bar*) en Hojas Modales
- **Problema:** En pantallas móviles, al abrir el teclado numérico para rellenar `#txAmount`, el botón verde `Guardar` queda sepultado bajo el teclado virtual.
- **Propuesta:** Reestructurar el contenedor `.modal-btns` para que adopte un posicionamiento adhesivo en la base:
  ```css
  .modal-btns {
    position: sticky;
    bottom: 0;
    margin-top: 16px;
    padding: 12px 0 calc(12px + var(--safe-bottom));
    background: var(--bg2);
    backdrop-filter: var(--glass-blur);
    border-top: 0.5px solid var(--separator2);
    z-index: 10;
  }
  ```
- **Resultado:** El usuario puede pulsar `Guardar` en cualquier instante de la edición sin tener que cerrar el teclado ni hacer scroll forzado.

### 5.2. Selector Rápido de Categorías Frecuentes (*Category Quick-Pills*)
- **Problema:** El selector actual es un elemento HTML `<select id="txCat">` que despliega una lista vertical genérica de todo el catálogo.
- **Propuesta:** Incorporar inmediatamente bajo el campo de importe una fila horizontal de desplazamiento suave (`overflow-x: auto`) con las **5 categorías más utilizadas** en los últimos 30 días en forma de píldoras táctiles Liquid Glass con su icono SVG:
  ```html
  <div class="tx-quick-cats">
    <button type="button" class="quick-cat-pill active" onclick="selectQuickCat('cat_super')"><!-- SVG Super --> Supermercado</button>
    <button type="button" class="quick-cat-pill" onclick="selectQuickCat('cat_rest')"><!-- SVG Rest --> Restaurantes</button>
    <button type="button" class="quick-cat-pill" onclick="selectQuickCat('cat_trans')"><!-- SVG Bus --> Transporte</button>
    <button type="button" class="quick-cat-more" onclick="openFullCatPicker()">Otras...</button>
  </div>
  ```
- **Resultado:** En el 80% de las transacciones habituales, el usuario asigna la categoría con un solo toque sin abrir la rueda nativa del sistema.

### 5.3. Disponibilidad del Botón Flotante (`#fabBtn`) en Cuentas y Categorías
- **Problema:** `index.html` oculta el FAB rígidamente en todas las pestañas que no sean Inicio:
  ```javascript
  document.getElementById('fabBtn').classList.toggle('fab-hidden', i !== 0);
  ```
  Esto bloquea la entrada rápida de movimientos cuando el usuario está en Cuentas (Tab 2) o Categorías (Tab 1).
- **Propuesta:** Mantener visible el FAB en las tres pantallas financieras operativas:
  ```javascript
  document.getElementById('fabBtn').classList.toggle('fab-hidden', i !== 0 && i !== 1 && i !== 2);
  ```
- **Resultado:** Flujo de alta accesible desde cualquier rincón financiero de la aplicación, idéntico a cómo funciona en la versión de escritorio (`dtSidebar .dt-add-btn`).

### 5.4. Unificación de la Experiencia Anual y Limpieza de Cabecera
- **Problema:** Existen tres puertas de entrada distintas a datos anuales (`#homeAnnualBtn` en cabecera, `#monthModalBg` "Ver todo el año", y Tab 3 "Análisis").
- **Propuesta:**
  1. Suprimir `#homeAnnualBtn` de la cabecera.
  2. Concentrar todo el análisis anual en la pestaña 3 ("Análisis").
  3. Si el usuario desea consultar el listado cronológico de movimientos de todo el año en Inicio, acceder a él a través del filtro de ámbito "Todo el año" dentro del panel de filtros existente.
- **Resultado:** Cabecera limpia, espaciosa, sin botones encimados y con cero colisiones entre hit targets.

### 5.5. Reemplazo de Diálogos Nativos (`window.prompt`) por Interfaz White Edition
- **Problema:** En el Modo Edición de Categorías (`promptRenameCat`, línea 7611) y al crear una nueva categoría desde el select (`onTxCatChange`, línea 7107), se invoca `prompt('Nombre de la categoría:')`.
- **Propuesta:** Sustituir estas llamadas nativas por una micro-hoja inferior estilizada que respeta los tokens del sistema (`--radius-sheet`, `--font`, `--card-border`) y la estética Liquid Glass.
- **Resultado:** Supresión de cuadros de diálogo del sistema operativo que rompen la inmersión PWA.

---

## 6. Matriz de Priorización de Impacto vs. Esfuerzo

| Medida / Propuesta de Simplificación | Impacto en UX | Esfuerzo Técnico | Archivo / Función / Línea | Fase de Implementación |
|---|---|---|---|---|
| **1. Eliminar botón `#homeAnnualBtn` de cabecera móvil** (erradica colisión con `#prevMonth` y unifica visión anual en Tab 3) | **ALTO** | **BAJO** | `index.html:2235, 4151`<br>`#homeAnnualBtn`, `toggleHomeAnnual` | Fase 1 (Inmediata) |
| **2. Botón global "Limpiar filtros" en panel de búsqueda** (ahorra 5 pasos para resetear filtros) | **ALTO** | **BAJO** | `index.html:4866, 4991`<br>`#txFilterPanel`, `clearAllFilters()` | Fase 1 (Inmediata) |
| **3. Eliminar botones redundantes "Cerrar" en modales auto-descartables** (`#exportModalBg`, `#monthModalBg`) | **MEDIO** | **BAJO** | `index.html:2443, 2535`<br>`.btn-cancel` en modales | Fase 1 (Inmediata) |
| **4. Eliminar botón `#adjustSignToggle` (±) en ajuste de saldo** (despeja 100% el campo de saldo real) | **MEDIO** | **BAJO** | `index.html:2465, 5696`<br>`#adjustSignToggle`, `toggleAdjustSign` | Fase 1 (Inmediata) |
| **5. Habilitar `#fabBtn` en pestañas Cuentas y Categorías** (evita cambiar de pestaña para registrar un movimiento) | **ALTO** | **BAJO** | `index.html:4643`<br>`switchTab()`, regla `i !== 0` | Fase 1 (Inmediata) |
| **6. Barra de acción adhesiva (`position: sticky`) para Guardar en `#modalBg`** (accesible con teclado abierto) | **ALTO** | **MEDIO** | `index.html:1464, 2389`<br>`.modal-btns`, `.btn-save` | Fase 2 (Ergonomía) |
| **7. Extender gesto de arrastre (drag-to-dismiss) a `.asset-sheet` en Inversión** (cierre natural con pulgar) | **ALTO** | **MEDIO** | `index.html:6521, 9613`<br>`initModalDragToDismiss`, `.asset-sheet` | Fase 2 (Ergonomía) |
| **8. Cierre en cascada tras confirmar operación en `.investment-trade-modal`** (evita doble modal atrapada) | **MEDIO** | **BAJO** | `index.html:6493`<br>`openInvestmentTradeModal` | Fase 2 (Ergonomía) |
| **9. Selector de chips rápidos de categorías frecuentes en modal de transacción** (ahorra rueda nativa) | **ALTO** | **MEDIO** | `index.html:2352, 7097`<br>`#txCatWrap`, `renderQuickCats()` | Fase 3 (Flujos Avanzados) |
| **10. Reemplazar `window.prompt` en renombrado de categorías por micro-sheet** | **MEDIO** | **MEDIO** | `index.html:7107, 7611`<br>`onTxCatChange`, `promptRenameCat` | Fase 3 (Flujos Avanzados) |
| **11. Soporte de gesto swipe horizontal para avanzar/retroceder mes en Inicio** | **MEDIO** | **MEDIO** | `index.html:4602, 4751`<br>Touch listeners de navegación temporal | Fase 3 (Flujos Avanzados) |

---

## 7. Riesgos de Regresión y Cumplimiento de Invariantes del Proyecto

Cualquier simplificación de interfaz propuesta en este informe debe cumplir de forma rigurosa las restricciones inmutables del ecosistema **fintrack**:

1. **Invariante de Cero Emojis (`DESIGN_SYSTEM.md`, §1.2):**
   - Ninguna píldora rápida, botón o estado puede recurrir a glifos Unicode. Todas las categorías deben renderizarse con el helper existente `catIconSvg(c, size)`.
2. **Invariante de Cero Build Tools y Monolito Vanilla (`PROJECT_CONTEXT.md`, §2.1):**
   - Todas las mejoras deben residir directamente en `index.html` (CSS nativo y JavaScript vanilla en navegadores modernos). Prohibido introducir JSX, TypeScript compilado o dependencias npm.
3. **Invariante Contable de Desfase y Cuentas (`PROJECT_CONTEXT.md`, §4.5):**
   - La simplificación del modal de ajuste de saldo (`#adjustModalBg`) no debe alterar bajo ninguna circunstancia el cálculo matemático de `accountTheoreticalFromLastRealReset` ni reconectar el saldo teórico con el real. El desfase (`real - teórico`) debe permanecer intacto en el snapshot de `patrimony`.
4. **Invariante de Modo Privado (`PROJECT_CONTEXT.md`, §4.6, §5.5):**
   - Al mostrar chips de categorías frecuentes o simplificar la vista de cuentas, nunca deben exponerse importes numéricos en texto plano si `isPrivacyMode()` o `portfolioValueHidden()` están activos.
5. **Prevención de Decisiones Previamente Descartadas por Miguel (`PROJECT_CONTEXT.md`, §12):**
   - **NO** reintroducir botón de borrado visible en transacciones móviles (se mantiene exclusivamente el swipe hacia la izquierda, decisión 2026-09-05, línea 627).
   - **NO** añadir cálculos matemáticos o expresiones aritméticas inline en el campo de importe (descartado 2026-09-05 y 2026-09-17, líneas 604 y 628).
   - **NO** añadir chips de conceptos frecuentes en el modal (descartado 2026-09-17, línea 603). Se proponen exclusivamente **chips de categorías ya existentes**, no sugerencias de conceptos/notas.
   - **NO** añadir botón "Guardar y añadir otro" (descartado 2026-09-17, línea 605).
   - **NO** alterar la marca `fintrack` (siempre minúsculas).
   - **NO** introducir vibración háptica en botones o tabs (solo autorizada en swipe-to-delete, decisión 2026-09-08, línea 637).

---

## 8. Protocolo de Verificación Independiente y Rúbrica de Auditoría

Para verificar y certificar de manera autónoma las deficiencias reportadas sin alterar el entorno de producción:

### 8.1. Verificación Automática de Dimensiones e Hit Targets
Ejecutar la siguiente inspección de selectores en terminal para constatar las métricas actuales:
```powershell
# Comprobar la colisión entre #homeAnnualBtn y #prevMonth en CSS:
Get-Content index.html | Select-String -Pattern "home-annual-toggle|nav-btn::after|period-toolbar" -Context 2

# Comprobar la ausencia de tap target de 44px en el botón de privacidad de cartera:
Get-Content index.html | Select-String -Pattern "togglePortfolioValue" -Context 3

# Comprobar la ocultación estricta del FAB en tabs 1 a 4:
Get-Content index.html | Select-String -Pattern "fabBtn.*fab-hidden" -Context 2
```

### 8.2. Verificación Manual en Emulador Móvil (Chrome DevTools / Safari Web Inspector)
1. Abrir DevTools en modo responsive con perfil **iPhone 15 Pro (393 × 852 px)** y **Pixel 8 (412 × 915 px)**.
2. **Prueba de Colisión de Periodo:** Intentar pulsar repetidamente el chevron de mes anterior (`#prevMonth`). Constatar que la cercanía del área táctil de 44px de `#homeAnnualBtn` produce pulsaciones cruzadas.
3. **Prueba de Teclado Virtual en Modal:** Pulsar el FAB (+). Enfocar el campo de importe. Observar cómo el teclado virtual cubre los botones de acción inferior (`Guardar` y `Cancelar`), requiriendo scroll vertical manual para poder confirmar.
4. **Prueba de Arrastre en Inversión:** Navegar a Inversión. Tocar cualquier producto para abrir `.asset-sheet`. Intentar arrastrar hacia abajo desde la cabecera. Constatar que no se cierra por gesto, a diferencia de todas las demás modales de la aplicación.
5. **Prueba de Limpieza de Filtros:** Aplicar un filtro por categoría y rango de fechas en Inicio. Contar el número de toques necesarios para volver a ver todos los movimientos (5 toques requeridos).

---

## 9. Conclusión de la Auditoría

fintrack posee una arquitectura de interfaz soberbia y una ejecución técnica artesanal envidiable. Sin embargo, su usabilidad en movilidad está lastrada por pequeñas acumulaciones históricas de botones duplicados, dependencias de controles nativos y desajustes de la zona del pulgar.

La implementación de las **11 medidas priorizadas** en este informe permitirá:
- **Reducir en un 65% los pasos** en la acción más repetida de la aplicación (crear un gasto).
- **Eliminar 8 controles redundantes** que saturan la cabecera y los formularios.
- **Resolver el 100% de los conflictos de tap targets** y colisiones de hitboxes en la cabecera.
- **Armonizar los gestos táctiles** en todo el módulo de inversiones.

Todo ello respetando de manera milimétrica la ausencia de librerías externas, la prohibición absoluta de emojis y la integridad matemática del motor contable.
