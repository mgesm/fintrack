# FinTrack — contexto técnico y operativo

> **Versión del documento:** 2.3  
> **Última actualización:** 2026-09-03  
> **Repositorio:** `mgesm/fintrack` (rama `main`)  
> **Producción:** https://mgesm.github.io/fintrack/  
> **Supabase:** proyecto `sswktibdpxqrumsqsegi`

## Instrucción obligatoria para cualquier chat nuevo

Este archivo es el punto de partida obligatorio para continuar FinTrack. Antes de analizar, corregir o implementar algo:

1. Léelo completo.
2. Contrasta lo que dice con el código actual del repositorio y, para producción, con el contenido remoto de GitHub/Supabase. El código y la base de datos vigentes prevalecen si hubiera una discrepancia.
3. Respeta las reglas de seguridad, datos y despliegue de este documento.
4. Tras **cada cambio funcional, técnico, de infraestructura o de interfaz**, actualiza las secciones afectadas de este archivo y añade una entrada al changelog con fecha, alcance, migraciones/funciones implicadas, validación y publicación.
5. Actualiza la versión y fecha de este encabezado. No des por terminado un cambio sin actualizar también este contexto.

Nunca anotes aquí secretos, claves API, tokens, correos privados completos, JWT, claves de servicio ni valores de configuración sensibles. Describe su nombre, finalidad y dónde se configura, pero no su contenido.

---

## 1. Qué es FinTrack

FinTrack es una aplicación web progresiva (PWA), privada y orientada a finanzas personales. Permite registrar ingresos, gastos, traspasos, categorías, presupuestos, cuentas y ajustes de saldo. Incluye una visión anual, exportaciones, copias de seguridad automáticas y un módulo de inversión con búsqueda de productos, cotizaciones, gráficos y operaciones de compra/venta.

La idea central es separar correctamente tres conceptos:

- **Gasto/ingreso:** movimiento que afecta al resultado y a las estadísticas.
- **Traspaso:** movimiento interno entre cuentas; modifica saldos, pero no debe contar como gasto ni ingreso.
- **Saldo real frente a teórico:** el real procede de una comprobación/ajuste de la cuenta; el teórico es lo que la aplicación espera a partir de los movimientos. Su diferencia es el desfase a investigar.

La interfaz está pensada primero para el uso diario: seleccionar periodo, registrar movimientos, consultar previsión/presupuesto, contrastar cuentas y revisar la cartera. Está disponible en escritorio y móvil, conserva estado de la sesión y puede seguir mostrando información básica sin conexión.

## 2. Arquitectura del proyecto

### 2.1 Frontend

No hay React, Vue, TypeScript compilado ni proceso de build. La aplicación es una SPA estática y monolítica:

| Archivo/ruta | Responsabilidad |
|---|---|
| `index.html` | HTML, CSS y prácticamente toda la lógica JavaScript de la aplicación. Es el archivo principal y el más delicado. |
| `manifest.json` | Metadatos de instalación PWA, iconos y colores. |
| `serviceworker.js` | Caché y estrategia offline/actualización de la PWA. |
| `supabase-js.min.js` | Cliente Supabase distribuido localmente. |
| `vendor/jspdf.umd.min.js` | Generación de PDF en navegador. |
| `vendor/exceljs.min.js` | Exportación Excel en navegador. |
| `icon-192.png`, `icon-512.png` | Iconos de instalación/acceso directo. |
| `supabase/` | Migraciones SQL, configuración de Supabase y código de Edge Functions. |

El HTML contiene funciones de renderizado por pestaña, consultas Supabase, estado global, modales, exportación, interacción de gráficos y estilos responsive. Esto facilita el despliegue, pero implica que cambios aparentemente pequeños pueden romper toda la interfaz si introducen un error de sintaxis. Antes de publicar, hay que validar los bloques JavaScript embebidos.

### 2.2 Diseño responsive

- En escritorio (`window.innerWidth >= 768`) se usa una disposición con barra lateral y renderizado de escritorio (`dtLayout`/`dtRender`).
- En móvil se utiliza cabecera compacta, navegación inferior y el contenedor `tabContent`.
- Las transiciones entre pestañas deben respetar `prefers-reduced-motion` y nunca bloquear navegación, formularios ni lectores de pantalla.
- Las pestañas Inicio, Categorías, Cuentas y Anual tienen animaciones de entrada sutiles. No se debe quitar esta coherencia al añadir secciones nuevas.

### 2.3 PWA y caché

`serviceworker.js` registra una caché versionada. La navegación utiliza red primero con respaldo de caché; los activos estáticos se sirven preferentemente desde caché. Esto permite instalación y cierta continuidad offline, pero es la principal causa de que una versión antigua siga visible.

**Regla de publicación obligatoria:** cualquier cambio de `index.html` que deba verse inmediatamente requiere incrementar tanto la versión visible de la app como el identificador de caché del service worker y publicar ambos archivos. Después hay que probar una recarga completa o cerrar y reabrir la PWA. El cache name vigente conocido al redactar este documento es `fintrack-cache-v103` y la versión de aplicación es `2026.09.02.2`; deben tratarse como valores que se incrementan, no como constantes eternas.

La sección Versión de Ajustes muestra además `APP_PUBLISHED_AT`: fecha y hora de publicación en España. Debe actualizarse en cada despliegue junto con `APP_VERSION` y la caché.

### 2.4 Autenticación y sincronización

FinTrack usa Supabase Auth. El frontend crea un cliente con la URL pública del proyecto y una clave pública/publishable; nunca necesita ni debe incluir una service-role key.

El estado de cada usuario se carga y sincroniza desde Supabase. Las colecciones principales se conservan en memoria durante la sesión (por ejemplo: `transactions`, `categories`, `accounts`, `patrimony`, `budgets`, exclusiones de recurrencias, anulaciones e inversiones). Hay caché local y una cola offline que se reintenta al recuperar conectividad. Cualquier cambio de esquema o formato debe contemplar:

- Filtrado estricto por `user_id`.
- Compatibilidad con datos ya cacheados.
- Reintentos seguros: una acción enviada más de una vez no debe crear duplicados.
- Actualización visual después de éxito remoto y tras eventos de sincronización.

El punto de sincronización se eliminó de las cabeceras de las pestañas para reducir ruido visual. El estado de sincronización se consulta desde Ajustes.

## 3. Navegación e interfaz

### 3.1 Cabecera

La marca superior es el texto `ft.`; la `t` y el punto final usan el verde de la identidad visual. No debe sustituirse por un icono grande: se eligió precisamente para liberar espacio.

En las vistas mensuales se mantiene el selector de mes y los controles existentes alineados a la derecha. El engranaje de Ajustes queda a su derecha. En Anual y Ajustes no se muestran el selector de mes ni el botón Anual, porque no corresponden a esas pantallas.

### 3.2 Pestañas

| Pestaña | Objetivo principal |
|---|---|
| Inicio | Resumen del periodo seleccionado: ingresos, gastos, balance, presupuesto y distribución por categorías. |
| Categorías | Gestión de categorías/subcategorías, tipo ingreso/gasto, archivo, presupuestos y análisis por categoría. |
| Cuentas | Saldos, historial, traspasos, cuenta predeterminada, ajustes reales y desfases frente al teórico. |
| Anual | Comparativa y agregados del año: evolución, ahorro, patrimonio y estadísticas. |
| Inversión | Exploración de productos, detalle de cotización/gráfico, cartera y operaciones de compra/venta. |
| Ajustes | Preferencias, exportaciones, seguridad/administración y estado de sincronización. |

La vista, el periodo y, si está abierto, el detalle de un activo se persisten por usuario mediante `ft_uistate_<userId>` para que minimizar y reabrir la PWA no devuelva innecesariamente a Inicio.

## 4. Modelo de datos y reglas financieras

Las tablas exactas, índices, políticas RLS y RPC son la autoridad. Antes de modificar datos hay que leer las migraciones y consultar el esquema desplegado. Las entidades siguientes describen su propósito funcional.

### 4.1 Categorías

`categories` contiene categorías y subcategorías. Cada categoría debe pertenecer al usuario y tener un **tipo** (`income` o `expense`), que determina en qué formularios, totales y presupuestos aparece. Se pueden archivar sin perder movimientos históricos.

Cambiar, borrar o archivar una categoría requiere preservar integridad histórica. Las migraciones de integridad y borrados atómicos existen para evitar movimientos huérfanos.

### 4.2 Transacciones

`transactions` representa ingresos, gastos, traspasos y ajustes. Las propiedades relevantes incluyen importe, fecha, cuenta de origen/destino cuando aplica, categoría/subcategoría, nota, etiquetas, recurrencia y vínculos técnicos.

Reglas:

- Un gasto reduce el saldo teórico de la cuenta asociada y participa en gasto, presupuesto y análisis.
- Un ingreso aumenta el saldo teórico y participa en ingresos.
- Un traspaso reduce una cuenta y aumenta otra; no aparece como gasto ni ingreso del periodo.
- Una transacción recurrente se materializa o proyecta según la lógica existente y puede tener fecha de inicio, intervalo, fecha fin y exclusiones.
- Eliminar/anular una transacción no debe reintroducir ocurrencias recurrentes ni distorsionar periodos cerrados. Para ello se usa `transaction_voids`.

### 4.3 Recurrencias, suscripciones y presupuesto

Las suscripciones son gastos recurrentes. Su ejecución/registro afecta a los gastos efectivos cuando corresponde a la fecha del periodo. El presupuesto mensual, en cambio, es una **previsión completa**: debe sumar los gastos recurrentes previstos de ese mes, aunque todavía no se hayan producido. No se debe cambiar esta regla para hacer que presupuesto y gasto real sean iguales.

`recurrence_exclusions` registra ocurrencias que deben omitirse; es imprescindible respetarla al generar listados, previsiones y totales. `transaction_voids` preserva anulaciones/borrados para que una recurrencia no reaparezca por cálculo posterior.

### 4.4 Presupuestos

`budgets` guarda presupuestos por categoría y total del mes (`category_id`, `amount`, `is_total`, `month_year`, `note`, según el esquema). El periodo de presupuesto es mensual. La pantalla compara gasto real con presupuesto, pero esta comparación no cambia el importe presupuestado.

### 4.5 Cuentas, patrimonio y desfases

`accounts` define cuentas financieras, incluida una posible cuenta de inversión marcada con `is_investment`. `patrimony` almacena snapshots de saldo real y metadatos de cálculo.

Conceptos no negociables:

| Campo/concepto | Significado |
|---|---|
| Saldo real (`patrimony.amount`) | Saldo observado que el usuario introduce para una fecha. |
| Saldo teórico (`patrimony.theoretical_amount`) | Saldo que deberían producir los movimientos conocidos hasta esa fecha. |
| Desfase | `real - teórico`. Puede ser positivo o negativo. |

Al ajustar un saldo real, el valor real **no debe sobrescribir** el teórico. Para cuadrar la contabilidad se crea una transacción vinculada de ajuste (`is_balance_adjustment=true`, `balance_adjustment_patrimony_id`) por la diferencia, como ingreso o gasto según el sentido. Esta transacción se conserva para cuadrar resultados, pero se excluye del cálculo del saldo teórico: si no se excluyera, se enmascararía el desfase y real/teórico pasarían artificialmente a coincidir.

El movimiento de actualización se ignora completamente en el cálculo del teórico y del desfase: nunca se suma ni se resta como gasto/ingreso. Sin embargo, el saldo real de cada snapshot pasa a ser el punto de partida para los movimientos posteriores. Así, un desfase anterior no se arrastra al siguiente ajuste; cada snapshot compara el real con los movimientos ordinarios desde el ajuste previo.

El cálculo de un ajuste se hace **al final de la fecha elegida**: incluye todos los ingresos, gastos y traspasos ordinarios registrados en ese mismo día. Por ejemplo, un saldo real a 1 de agosto se contrasta con todos los movimientos del 1 de agosto, no solo con los de días anteriores.

El cálculo debe considerar la fecha del snapshot, movimientos hasta esa fecha, traspasos, anulaciones y ajustes posteriores. Un ajuste a 30 de agosto, por ejemplo, no debe hacer que el teórico de ese día incluya gastos posteriores ni convertirlo en el real introducido.

**Ante un error de desfase:** inspeccionar primero el snapshot guardado, la transacción de ajuste vinculada, movimientos posteriores, `transaction_voids` y el cálculo de fecha. No aplicar la solución antigua de copiar el saldo real en `theoretical_amount`.

### 4.6 Inversiones y cuenta de inversión

`investment_operations` guarda compras y ventas. La migración de inversiones añade `accounts.is_investment` y RPC para registrar/eliminar las operaciones con permisos del usuario.

Modelo acordado:

- La **cuenta de inversión** en Cuentas muestra únicamente el capital que se ha aportado/retirado para invertir, no la valoración de mercado en tiempo real.
- La pestaña **Inversión** muestra la valoración actual de la cartera con precios de mercado/NAV.
- Al comprar se elige producto, unidades o importe, precio, cuenta de origen y fecha efectiva. El dinero sale de esa cuenta como **traspaso**, no como gasto.
- Al vender se realiza el flujo inverso hacia una cuenta de destino elegida.
- Al eliminar una operación se elimina de forma segura también el traspaso vinculado, de modo que no quedan saldos artificiales.
- El usuario puede abrir el detalle directamente pulsando una posición de su cartera.
- La ficha de producto conserva las métricas anteriores a la última tanda de cartera (último cierre, variación diaria, volumen y posición). No añadir de nuevo precio medio, plusvalía ni rentabilidad por posición sin una petición expresa; el gráfico de evolución de aportaciones netas frente a valoración sí se mantiene.
- El bloque de valor de activos incorpora una evolución comparativa: una línea de aportaciones netas y otra de valoración de mercado. Se construye con compras/ventas fechadas y los cierres históricos devueltos por `market-data`; no se deben inventar puntos si el proveedor no devuelve una cotización.
- La privacidad de cartera oculta todas estas cifras y el saldo de la cuenta de inversión; además, dicha cuenta queda excluida del total visible de Cuentas mientras el modo privado esté activo.

## 5. Comportamiento de cada módulo

### 5.1 Inicio

Muestra el resumen del mes seleccionado: ingresos, gastos, balance y progreso de presupuesto. Contiene gráficos de reparto y tarjetas interactivas; en escritorio y móvil sus interacciones deben seguir siendo accesibles. Inicio usa animación de entrada al cambiar de pestaña.

### 5.2 Categorías

Permite crear, editar, ordenar, archivar y consultar categorías/subcategorías. Las categorías de gasto pueden tener presupuesto. Los gráficos y tarjetas de categoría usan una animación de entrada coherente con las demás pantallas. No mezclar categorías de ingresos con presupuestos de gastos.

### 5.3 Cuentas

Muestra patrimonio y cada cuenta, permite traspasar dinero, definir cuenta predeterminada y guardar saldos reales históricos. La tarjeta/lista debe mostrar claramente saldo real, teórico y desfase sin manipular la cifra teórica. Esta vista tiene animación de entrada para evitar un salto brusco al navegar desde otra pestaña.

### 5.4 Anual

No depende del selector mensual. Resume evolución de ingresos, gasto, ahorro y patrimonio, con comparaciones y estadísticas del año. El cambio a esta pantalla debe animar controles, comparativas, gráficos y estadísticas de forma discreta.

### 5.5 Inversión

La pestaña se está consolidando como un servicio de inversión interno, no como una simulación decorativa.

**Cartera y privacidad visual**

- La cabecera de valor de cartera permite ocultar/mostrar el importe. La preferencia se guarda en `ft_invest_portfolio_hidden_<userId>`.
- Al activar esa privacidad se enmascaran todos los datos numéricos de las posiciones abiertas en el panel de cartera: valor total, invertido, rentabilidad, número de posiciones, unidades y coste por posición. Los nombres y símbolos se mantienen visibles.
- No deben aparecer posiciones ni gráficos de ejemplo si el usuario no tiene operaciones reales.
- Debajo de los tres contenedores de resumen se listan los productos de cartera; más abajo se listan las operaciones.
- Las operaciones pueden eliminarse y su borrado revierte el traspaso asociado.

**Explorar mercados**

- El buscador vive en “Explorar mercados”. Mientras se escribe, muestra resultados filtrados, no exige un botón de búsqueda.
- Los tres productos destacados de esa zona son los **tres últimos abiertos**, persistidos con `ft_invest_recent_assets_<userId>`, y no ejemplos fijos.
- Actualmente los recientes se muestran bajo el campo de búsqueda. El intento de moverlos encima y eliminar su rótulo se revirtió el 2026-09-02 por una regresión de inicio que requiere investigación antes de volver a aplicarlo.
- Al seleccionar producto se abre una hoja/modal cerrable dentro de la pestaña; no debe cubrir indebidamente el menú lateral de escritorio.

**Detalle de producto**

- Muestra nombre, símbolo/ISIN, icono, precio/NAV, variación diaria, estadísticas y botones Comprar/Vender.
- Los logotipos corporativos usan dominios de logo cuando existen (`ASSET_LOGO_DOMAINS`/Clearbit) y deben verse sin fondo, halo o recuadro blanco. Mantener fallback de iniciales cuando no haya logo fiable.
- El gráfico representa la serie en orden cronológico: antiguo a la izquierda, reciente a la derecha.
- Rangos: `1D`, `1M`, `6M`, `YTD`, `1A`, `5A`.
- El valor superior derecho de la gráfica cambia según el rango seleccionado. La variación diaria visible en la ficha sigue siendo siempre diaria.
- La línea debe ser fina, uniforme y de aspecto de app de mercado (aprox. 1.6 px), no una curva de grosor irregular.
- Debe poder inspeccionarse precio/fecha mediante hover en escritorio y toque/arrastre en móvil.
- Usa carga progresiva y caché de series para minimizar esperas. No inventar datos si el proveedor falla: mostrar estado de carga/error claro.

**Fondos**

Los fondos necesitan especial cuidado porque suelen identificarse por ISIN y publicar valor liquidativo diario, no intradía. El ISIN debe poder buscarse directamente. El fondo `IE00BYX5MX67` tiene un resolver específico y cadenas de respaldo, pero la fuente puede no devolver NAV de forma fiable. Un valor estático de último NAV publicado es solo último recurso y debe presentarse como tal, con fecha; no como cotización en tiempo real. La solución definitiva requiere una fuente de NAV de fondos con licencia y cobertura fiable.

## 6. Supabase

### 6.1 Configuración y seguridad

La configuración local está en `supabase/config.toml`. El acceso de usuario se protege con RLS. Cualquier tabla de datos personales debe tener políticas de lectura/escritura limitadas al propietario. Las RPC deben comprobar `auth.uid()`, usar `security invoker` cuando corresponde y un `search_path` fijo.

No se debe relajar RLS para “hacer que funcione” ni ejecutar operaciones de otro usuario desde cliente. Las operaciones administrativas de backups, correo o proveedores externos se hacen exclusivamente en Edge Functions con service role y secretos de Supabase.

### 6.2 Migraciones existentes

| Migración | Finalidad |
|---|---|
| `20260716124000_add_recurrence_exclusions.sql` | Exclusiones de recurrencias. |
| `20260716170000_atomic_import.sql` | Importaciones atómicas. |
| `20260716180000_category_kind_and_atomic_deletes.sql` | Tipo de categoría e integridad/borrados atómicos. |
| `20260720100000_track_voided_transactions.sql` | Seguimiento de transacciones anuladas. |
| `20260722090000_integrity_and_recurrence_hardening.sql` | Refuerzo de integridad y recurrencias. |
| `20260727090000_balance_adjustment_transactions.sql` | Transacciones vinculadas a ajustes de saldo. |
| `20260831090000_anchor_theoretical_balance_on_adjustment.sql` | Migración histórica problemática: ancló indebidamente el teórico al ajuste. No replicar su comportamiento. |
| `20260901113000_investment_operations.sql` | Cuenta de inversión, operaciones y RPC de registro. |
| `20260901123000_delete_investment_operations.sql` | Borrado seguro de operación de inversión y traspaso vinculado. |
| `20260901151000_restore_adjustment_theoretical_balances.sql` | Reparación del teórico: lo reconstruye desde el ajuste sin igualarlo al real. |

Antes de crear una migración, revisar el historial desplegado en Supabase: el directorio local puede estar desincronizado respecto a producción. Nunca editar una migración aplicada; crear otra migración reversible y documentarla aquí.

### 6.3 Edge Functions

| Función | Finalidad y contrato |
|---|---|
| `market-data` | Búsqueda, cotización e histórico de acciones/ETF/fondos mediante acciones `search`, `quote`, `history`. Verifica JWT y aplica CORS para `https://mgesm.github.io`. Usa el secreto `TWELVE_DATA_API_KEY`; no exponerlo en cliente. |
| `automatic-backup` | Copia de seguridad nativa periódica y copia de seguridad previa a importaciones. Requiere `POST` y cabecera `x-backup-cron-token` para cron; las copias manuales usan el JWT del usuario. Exporta los datos y guarda JSON en Storage. Conserva solo los tres últimos backups correctos por usuario. |
| `monthly-report` | Genera y envía el resumen mensual PDF. Requiere el mismo mecanismo de token. Ejecutada desde cron, comprueba la hora `Europe/Madrid` antes de enviar y registra ejecuciones para evitar duplicados. |

#### `market-data`

Para acciones y ETF utiliza Twelve Data a través del secreto configurado en Supabase. Para fondos, intenta resolver por ISIN con varias fuentes (incluido Yahoo y, en casos concretos, símbolos alternativos). El caso especial conocido `IE00BYX5MX67` tiene fallback de resolución. Los proveedores pueden devolver HTTP 400, series incompletas o resultados sin NAV: monitorizar logs de la función y datos reales del usuario antes de alterar el frontend. La aplicación no debe invertir el orden de la serie ni dibujar una serie artificial para ocultar un fallo del proveedor.

#### `automatic-backup`

El backup exporta por usuario, como mínimo, cuentas, categorías, transacciones, patrimonio, presupuestos, exclusiones de recurrencias, anulaciones, operaciones de inversión y auditoría. Sube un JSON a bucket `fintrack-backups` con ruta de usuario y registra resultado en `backup_runs`. El criterio es no generar uno si ya existe un backup satisfactorio reciente (objetivo: cada cinco días) y retener tres copias exitosas.

Antes de restaurar la última copia, `restore-backup` devuelve una vista previa con fecha y recuentos. Al restaurar, la función crea primero una copia de seguridad del estado actual y solo después sustituye los datos. Antes de importar un JSON, el cliente crea una copia de seguridad equivalente y la RPC `replace_fintrack_data(jsonb)` restaura de forma atómica las colecciones, incluidas `accounts.is_investment` e `investment_operations`. Conservar esta secuencia: **vista previa → confirmación → backup previo → sustitución atómica → recarga**.

La caché local de datos se guarda cifrada con AES-GCM mediante una clave no exportable de Web Crypto almacenada en IndexedDB. Esto evita dejar el contenido financiero legible en `localStorage`, pero no sustituye una política contra XSS ni cifra los datos ya sincronizados en Supabase. La caché es una ayuda offline, no una copia de seguridad.

La programación debe ser **nativa de Supabase** (cron/pg_cron o mecanismo desplegado equivalente), no depender de una conversación con ChatGPT. Tras cambiar el cron, revisar token, zona horaria, permisos de Storage, ejecución real y retención. No asumir que la programación está activa solo porque el código de la función exista.

#### `monthly-report`

Esta función utiliza `pdf-lib` y `supabase-js` remotos dentro de Deno. Genera el mes anterior (o una previsualización solicitada) con las mismas secciones esenciales del PDF de exportación de la app: cabecera, KPIs, distribución de gasto, cuentas, categorías/presupuesto y listado de movimientos. Después añade páginas de análisis: categorías sobre presupuesto, gastos excepcionalmente altos y lectura de balance.

El correo se envía con Resend usando un secreto recuperado por RPC y se archiva en bucket `fintrack-reports`; las ejecuciones se anotan en `monthly_report_runs`. El diseño actual está limitado intencionalmente a un único usuario configurado en la función. Si se generaliza, debe sustituirse esa selección por un sistema explícito de preferencias/consentimiento por usuario, sin enviar informes a nadie por defecto.

El horario deseado es el día 1 a las **14:00 de España**, con corrección automática de horario de verano/invierno usando `Europe/Madrid`. Se debe verificar que el cron invoque la función con suficiente frecuencia para que su comprobación horaria sea efectiva.

## 7. Integraciones externas

| Servicio | Uso | Dónde se configura | Precaución |
|---|---|---|---|
| GitHub | Código fuente y publicación. | Repositorio `mgesm/fintrack`, rama `main`. | El worktree local puede estar sucio/desincronizado; comprobar remoto antes de editar. |
| GitHub Pages | Hosting estático de producción. | Configuración del repositorio. | Publicar y considerar caché PWA. |
| Supabase | Auth, Postgres, RLS, Storage, Functions, secretos y cron. | Proyecto `sswktibdpxqrumsqsegi`. | Revisar políticas y esquema antes de datos/migraciones. |
| Twelve Data | Datos de mercado para acciones/ETF. | Secreto `TWELVE_DATA_API_KEY` en Supabase. | Límites/latencia/cobertura; nunca clave en frontend. |
| Yahoo/otras fuentes de fondos | Fallback de búsqueda/NAV de fondos. | Dentro de `market-data`. | No son garantía contractual ni fuente fiable de NAV; mostrar fecha y errores. |
| Resend | Entrega de informe mensual. | Secreto accesible solo desde función/RPC. | Clave, remitente y destinatario nunca en frontend/contexto. |
| Supabase Storage | Backups (`fintrack-backups`) e informes (`fintrack-reports`). | Buckets y políticas de Supabase. | Verificar acceso privado y retención. |
| jsPDF / ExcelJS | Exportaciones manuales locales. | Archivos `vendor/`. | Mantener licencias y compatibilidad de navegador. |

## 8. Exportaciones e informes

La app puede exportar PDF y Excel desde navegador. El informe por correo mensual no debe ser un PDF genérico distinto: debe reutilizar la estructura y contenido del PDF mensual de exportación y **sumar** las páginas de análisis acordadas.

Al modificar una exportación hay que comprobar:

- Que el filtro de mes/año y las anulaciones se aplican igual que en la interfaz.
- Que traspasos no se suman como gasto/ingreso.
- Que presupuestos y gasto real conservan sus significados distintos.
- Que el PDF se renderiza correctamente en móvil/escritorio y correo.
- Que los datos sensibles no se filtran entre usuarios ni en nombres de fichero públicos.

## 9. Procedimiento seguro de desarrollo y publicación

1. Crear copia de seguridad si el cambio es grande, siguiendo la convención existente y sin sobrescribir backups previos.
2. Consultar `PROJECT_CONTEXT.md`, `index.html`, migraciones relevantes y Edge Functions afectadas.
3. Obtener la última versión remota de GitHub antes de modificar. El árbol local contiene cambios históricos y puede no ser la fuente más reciente.
4. Implementar el cambio mínimo coherente, preservando datos y RLS.
5. Validar sintaxis JavaScript de los scripts embebidos en `index.html`, revisar el diff y probar el flujo funcional afectado.
6. Si hay base de datos: aplicar una nueva migración, verificar políticas/RPC y comprobar datos reales con cuidado.
7. Si cambia frontend: incrementar versión visible y caché del service worker; publicar ambos de forma coordinada.
8. Verificar producción en la URL de GitHub Pages con sesión válida, recarga completa/PWA y móvil cuando haya cambios responsive.
9. Actualizar este archivo y el changelog antes de comunicar finalización.

Para actualizaciones mediante API de GitHub, obtener siempre el SHA actual del archivo antes de escribir. No publicar dos modificaciones concurrentes sobre el mismo archivo. No usar `git reset --hard`, `git checkout --` ni sobrescrituras globales para “limpiar” el árbol.

## 10. Problemas conocidos y deuda técnica

- `index.html` concentra demasiada lógica y estilos; cualquier refactor debe ser incremental y con validación estricta.
- No hay pipeline de build/test automatizado documentado. La comprobación manual de sintaxis, flujos y PWA es imprescindible; sería conveniente introducir pruebas gradualmente.
- La caché PWA puede mostrar versiones anteriores si no se incrementa el cache key de `serviceworker.js`.
- La cotización/NAV de fondos por ISIN no es totalmente fiable con las fuentes actuales. No presentar fallbacks estáticos como precio en vivo.
- La función de informe mensual está diseñada para un único usuario. Generalizarla sin diseño de consentimiento y preferencias de entrega sería un riesgo de privacidad.
- La programación de backups y de informes debe auditarse en Supabase; el código de una Edge Function no prueba que el cron ni las políticas de Storage estén activos.
- La migración `20260831090000_anchor_theoretical_balance_on_adjustment.sql` introdujo un comportamiento incorrecto de desfases. Las nuevas correcciones deben preservar la separación entre saldo real y teórico.

## 11. Changelog de producto y mantenimiento

Las entradas son acumulativas. Toda entrada nueva debe incluir fecha, cambio, archivos/servicios afectados, comprobación realizada y si quedó publicado.

| Fecha | Cambio | Componentes afectados | Validación/publicación |
|---|---|---|---|
| 2026-07 | Se reforzaron recurrencias, importación, categorías e historial de anulaciones. | Migraciones de recurrencias, importación e integridad. | Esquema versionado mediante migraciones. |
| 2026-07 | Se añadieron ajustes de saldo vinculados a transacciones para reconciliar cuentas. | `20260727090000_balance_adjustment_transactions.sql`, Cuentas. | Posteriormente se detectó que el teórico no debía anclarse al real. |
| 2026-08 | Se revisó la previsión de suscripciones: el presupuesto mensual representa todos los recurrentes previstos, separado del gasto ejecutado. | Inicio, Categorías, presupuesto/recurrencias. | Regla funcional acordada con el usuario. |
| 2026-08 | Se rediseñó la cabecera: marca textual `ft.`, selector mensual alineado, engranaje de Ajustes y sincronización movida a Ajustes. | `index.html`. | Publicado en GitHub Pages en iteraciones posteriores. |
| 2026-08/09 | Se creó el módulo Inversión: búsqueda, detalle, gráfico, cartera, operaciones y cuenta de inversión. | `index.html`, `market-data`, migraciones de inversiones. | Publicado y evolucionado en varias iteraciones. |
| 2026-09-01 | Se añadieron RPC y borrado seguro de operaciones para mantener traspaso y operación consistentes. | `20260901113000_investment_operations.sql`, `20260901123000_delete_investment_operations.sql`. | Requiere RLS/RPC desplegadas y prueba con una cuenta real. |
| 2026-09-01 | Se restauró el cálculo del saldo teórico independiente del real tras el error de desfases. | `20260901151000_restore_adjustment_theoretical_balances.sql`, lógica de Cuentas. | Debe validarse con snapshots fechados y movimientos posteriores/anulados. |
| 2026-09-01 | Se añadieron backups nativos periódicos con retención de tres copias y reporte mensual por correo con análisis adicional. | `automatic-backup`, `monthly-report`, Storage, cron, Resend. | Configuración de secretos/cron/políticas debe auditarse en Supabase. |
| 2026-09-01 | Se pulió Inversión: recientes en explorar, ocultación de valor de cartera, transacciones, logos sin fondo, acceso desde posiciones, rangos de gráfico y tooltip móvil/escritorio. | `index.html`, `market-data`. | Se debe seguir probando disponibilidad de datos de fondos. |
| 2026-09-02 | Se corrigieron regresiones de ajuste de saldo y se republicó evitando caché antigua. | Cuentas, `index.html`, `serviceworker.js`. | Producción con versión `2026.09.02.2` y caché `v103` conocida en ese momento. |
| 2026-09-02 | Se añadieron animaciones de entrada sutiles a Anual, Cuentas, Inicio y Categorías, respetando reducción de movimiento. | `index.html` (`animateTabEntrance` y estilos). | Publicado en los commits de frontend y service worker más recientes. |
| 2026-09-02 | Se creó este contexto de continuidad y se estableció su actualización obligatoria tras cada cambio. | `PROJECT_CONTEXT.md`. | Verificado con `git diff --check` y publicado en GitHub. |
| 2026-09-02 | Se simplificó la cabecera de Inversión y se movieron los recientes encima del buscador, sin título “Últimos visitados”. | `index.html`, `PROJECT_CONTEXT.md`, `serviceworker.js`. | Tres scripts embebidos validados; publicado con versión `2026.09.02.3` y caché `v104`. |
| 2026-09-02 | Se revirtió el último cambio visual de Inversión tras un bloqueo de entrada reportado por el usuario. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | La pantalla pública vuelve a salir de carga hacia Acceso; publicado con versión `2026.09.02.4` y caché `v105`. |
| 2026-09-02 | Se amplió el modo privado de cartera para enmascarar todas las cifras de posiciones abiertas. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Tres scripts embebidos validados; publicado con versión `2026.09.02.5` y caché `v106`. |
| 2026-09-02 | Se corrigió la reconstrucción del saldo teórico para snapshots históricos, excluyendo definitivamente las actualizaciones de saldo del desfase. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Tres scripts embebidos validados; publicado con versión `2026.09.02.6` y caché `v107`. |
| 2026-09-02 | Se publicó una reconstrucción desde ajuste vinculado, posteriormente descartada por no cumplir la regla financiera acordada. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Sustituida inmediatamente por la versión `2026.09.02.8`. |
| 2026-09-02 | Se corrigió definitivamente el cálculo: ajustes de saldo excluidos por completo del teórico/desfase; los históricos sin teórico se resuelven solo con movimientos ordinarios. También se ocultaron Invertido y Rentabilidad con el modo privado. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Tres scripts embebidos validados; publicado con versión `2026.09.02.8` y caché `v109`. |
| 2026-09-02 | Se corrigió el encadenamiento entre ajustes: el saldo real del ajuste previo ancla el siguiente cálculo, pero su transacción de actualización queda excluida. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Tres scripts embebidos validados; publicado con versión `2026.09.02.9` y caché `v110`. |
| 2026-09-02 | Se añadió fecha y hora de publicación a la sección Versión de Ajustes. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Tres scripts embebidos validados; publicado con versión `2026.09.02.10`, caché `v111` y hora `12:14 CEST`. |
| 2026-09-02 | Se documentó que un ajuste incorpora todos los movimientos ordinarios de su propia fecha. | `PROJECT_CONTEXT.md`. | Regla de cálculo confirmada por el usuario. |

| 2026-09-02 | La importación manual de copias se realiza seleccionando un archivo `.json`: sin área para pegar texto y dentro de la sección de copias de seguridad. Se valida tamaño, se lee el archivo y se conserva la importación atómica existente. | `index.html`, `replace_fintrack_data`. | JavaScript validado antes de publicar; caché renovada. |

| 2026-09-02 | Se colocó la restauración al final de las opciones de copia, con estilo neutro, y se cambió la lectura de JSON a `FileReader` para compatibilidad con la app instalada. | `index.html`, `serviceworker.js`. | JavaScript validado y caché renovada. |

| 2026-09-02 | Se simplificaron y reordenaron Ajustes: versión y sincronización, apariencia compacta, exportación, copias, cuenta y zona de peligro. Se eliminaron color de acento, presupuesto mensual y estado de sincronización. | `index.html`, `serviceworker.js`. | JavaScript validado y caché renovada. |

| 2026-09-02 | La importación manual acepta tanto la exportación local como un archivo procedente de la copia automática de Supabase; normaliza el bloque `data` y las claves técnicas antes de validar. | `index.html`, `automatic-backup`. | Validado el formato de ambas variantes y renovada la caché. |

| 2026-09-02 | Se corrigió la RPC de importación: `transactions.tags` llega como JSON y la columna usa `text[]`; ahora se transforma de forma explícita dentro de la operación atómica. | `replace_fintrack_data(jsonb)` en Supabase. | Logs identificaron el error de tipos y la conversión fue comprobada con etiquetas reales de ejemplo. |

| 2026-09-03 | La privacidad de cartera también enmascara el saldo mostrado de cualquier cuenta marcada como cuenta de inversión. | `index.html`, `serviceworker.js`. | JavaScript validado y caché renovada. |

| 2026-09-03 | Cuando la cartera está oculta, la cuenta de inversión se excluye del total de Cuentas, no solo se enmascara su importe individual. | `index.html`, `serviceworker.js`. | JavaScript validado y caché renovada. |

| 2026-09-03 | Se añadieron métricas de posición reales (precio medio, capital neto, plusvalía realizada/no realizada y rentabilidad anualizada) y la evolución comparativa de aportaciones netas frente a valoración de la cartera. | `index.html`, `market-data`. | Tres scripts embebidos validados; no se generan datos ficticios si falta histórico. |
| 2026-09-03 | Se reforzó la continuidad de copias: vista previa antes de restaurar, copia automática previa a restaurar/importar, y restauración/importación que incluye operaciones y cuenta de inversión. | `automatic-backup`, `restore-backup`, `replace_fintrack_data(jsonb)`, `index.html`. | Edge Functions desplegadas; migración `restore_investment_operations_and_investment_account_flag` aplicada. |
| 2026-09-03 | Se cifró la caché local con Web Crypto/IndexedDB y se añadieron confirmaciones con frase explícita para borrar cuentas, categorías y todos los movimientos. | `index.html`. | Tres scripts embebidos validados. |
| 2026-09-03 | Se unificaron tokens de movimiento, elevación y foco para tarjetas, filas y botones; se respetan preferencias de reducción de movimiento. | `index.html`, `serviceworker.js`. | Publicado con versión `2026.09.03.6` y caché `v127`. |

| 2026-09-03 | Se creó un registro vinculante de funcionalidades y alternativas descartadas, que debe actualizarse cada vez que Miguel rechace una propuesta. | `PROJECT_CONTEXT.md`. | Documentadas las decisiones previas recuperables. |

| 2026-09-03 | Se revirtió la última tanda de cambios de Inversión salvo el gráfico de evolución: se restauraron la ficha de producto y la cadena de cotización/valoración anteriores. | `index.html`, `market-data`, `serviceworker.js`. | Frontend `2026.09.03.8`, caché `v129`, Edge Function v12. |
| 2026-09-03 | Se comprobó que la regresión de cartera no procede de las operaciones guardadas; para este fondo se prioriza su símbolo de mercado en Twelve Data frente a un cierre secundario atrasado de Yahoo. | `investment_operations`, `market-data`. | Edge Function v13 desplegada. |

| 2026-09-03 | Se corrigió la valoración del fondo IE00BYX5MX67: el cliente prioriza `price` sobre un `close` potencialmente atrasado y el último NAV de respaldo se actualizó a 16,40037595 €. Con 122,3398784573215 participaciones y 2.000 € de coste, el resultado es 2.006,42 € y +0,32 %. | `index.html`, `market-data`, `serviceworker.js`. | Operaciones verificadas sin cambios; versión `2026.09.03.9`, caché `v130`. |
| 2026-09-03 | Se sincronizó el código versionado de copias con la función desplegada: intervalo de cinco días, copia manual autenticada e inclusión de operaciones de inversión. | `automatic-backup/index.ts`, `PROJECT_CONTEXT.md`. | Contraste con la función desplegada v3. |

| 2026-09-03 | El gráfico de evolución ya se inicia con el precio real de la primera operación y añade la cotización actual como punto vivo, incluso sin histórico mensual disponible. No se rellenan fechas intermedias sin precio de mercado. | `index.html`, `serviceworker.js`. | Validado con compra del mismo día: punto inicial de coste y punto actual de cotización; versión `2026.09.03.10`, caché `v131`. |

| 2026-09-03 | Se hizo explícito el punto vivo final de la evolución: siempre usa la última fecha de la serie, no una ventana temporal durante la carga. | `index.html`, `serviceworker.js`. | Mantiene la cotización actual aun con latencia del proveedor; versión `2026.09.03.11`, caché `v132`. |

| 2026-09-03 | Se eliminó por completo el gráfico de evolución de cartera y sus consultas históricas. La cabecera conserva únicamente el valor numérico y los indicadores de cartera. | `index.html`, `serviceworker.js`. | Cálculo de valoración intacto; versión `2026.09.03.12`, caché `v133`. |

## 12. Decisiones descartadas (no volver a proponer sin petición expresa)

Este registro es vinculante para futuras sesiones. Cada vez que Miguel rechace una funcionalidad o una alternativa de diseño propuesta, añadir aquí una entrada concreta con fecha, alcance y motivo si lo indicó. No volver a sugerirla por iniciativa propia; solo reconsiderarla si Miguel la pide expresamente o modifica su decisión.

| Fecha | Propuesta o alternativa descartada | Decisión vigente |
|---|---|---|
| 2026-08-30 | Mantener el selector de mes y el botón Anual en las pestañas Anual y Ajustes. | No deben aparecer en esas dos pestañas. |
| 2026-08-30 | Mantener el punto de sincronización visible en las pestañas. | Eliminado de todas las pestañas; la sincronización queda en Ajustes. |
| 2026-08-31 | Mantener un botón «Operación» independiente dentro de Inversión. | No usarlo: la operativa se inicia desde el producto mediante comprar/vender. |
| 2026-08-31 | Mostrar posiciones o gráficos de ejemplo sin datos reales. | Prohibido: mostrar estado vacío hasta que existan datos reales. |
| 2026-09-02 | Color de acento configurable, apartado de presupuesto mensual, estado de sincronización y botón para activar copias automáticas en Ajustes. | No mostrarlos en Ajustes; las copias se ejecutan automáticamente cada cinco días. |
| 2026-09-03 | Métricas de precio medio, plusvalía y rentabilidad por posición añadidas en la última tanda de Inversión. | Retiradas; conservar únicamente el gráfico de evolución hasta una nueva petición expresa. |

## 13. Ideas futuras priorizadas (no implementadas todavía)

Esta lista conserva las decisiones de producto pendientes. Antes de implementar una idea, actualizar su estado y añadir una entrada de changelog. Un nuevo chat debe consultar primero esta sección y no presentar como existente una función que siga aquí.

| Área | Idea futura | Criterio de entrega |
|---|---|---|
| Planificación | Previsión de tesorería a 30/60/90 días, calendario financiero y objetivos de ahorro. | Distinguir previsión de gasto ejecutado y explicar las hipótesis. |
| Presupuestos | Sugerencias basadas en meses anteriores y avisos de riesgo antes de superar el presupuesto. | Nunca alterar presupuestos sin confirmación del usuario. |
| Inversión | Distribución por activo/sector/divisa, dividendos, alertas de precio y rebalanceo. | Basado en datos de mercado verificables y con fuentes/fallbacks visibles. |
| Búsqueda | Búsqueda global de movimientos, categorías, cuentas y productos con filtros guardables. | Resultados rápidos, accesibles y sin exponer importes en modo privado. |
| Rendimiento | Sincronización incremental, pruebas de regresión de cálculos y modularización progresiva del HTML único. | Mantener compatibilidad de PWA y rutas de datos existentes. |
| Seguridad | Revisión mensual de RLS, Edge Functions, secretos, Storage, backups, dependencias y recuperación. | Registrar hallazgos, corregir primero riesgos altos y comprobar restauración real. |

## 14. Lista de comprobación rápida por tipo de cambio

### Interfaz

- ¿Funciona en móvil y escritorio?
- ¿La vista respeta selección de mes/año y el estado persistido?
- ¿No hay ejemplos ficticios cuando no existen datos reales?
- ¿Se ha actualizado PWA/cache y publicado ambos archivos si cambió frontend?

### Datos financieros

- ¿Es gasto/ingreso/traspaso la semántica correcta?
- ¿Se respeta `user_id`, RLS y las fechas efectivas?
- ¿Un borrado deja datos vinculados coherentes?
- ¿Saldo real, teórico y desfase siguen separados?

### Supabase/infraestructura

- ¿La migración es nueva y no altera historia aplicada?
- ¿RPC y policies comprueban `auth.uid()`?
- ¿Secrets solo existen en Supabase/servidor?
- ¿Cron, Edge Functions y Storage se han comprobado de verdad?

### Mercado e informes

- ¿El proveedor devolvió datos reales y ordenados cronológicamente?
- ¿Se informa al usuario de una fuente/fallback no fiable?
- ¿El informe mensual conserva el PDF estándar y añade análisis, sin sustituirlo?

---

Este documento no sustituye la revisión del código ni de la base de datos antes de un cambio: sirve para que una nueva sesión comprenda el sistema, sus decisiones y sus riesgos sin volver a descubrirlos desde cero.
