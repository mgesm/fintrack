# FinTrack — contexto técnico y operativo

> **Versión del documento:** 2.27<br>
> **Última actualización:** 2026-09-10
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

**Regla de publicación obligatoria:** cualquier cambio de `index.html` que deba verse inmediatamente requiere incrementar tanto la versión visible de la app como el identificador de caché del service worker y publicar ambos archivos. Después hay que probar una recarga completa o cerrar y reabrir la PWA. El cache name vigente conocido al redactar este documento es `fintrack-cache-v134` y la versión de aplicación es `2026.09.04.1`; deben tratarse como valores que se incrementan, no como constantes eternas.

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
- La ficha de producto conserva las métricas anteriores a la última tanda de cartera (último cierre, variación diaria, volumen y posición). No añadir de nuevo precio medio, plusvalía ni rentabilidad por posición sin una petición expresa.
- La cartera no muestra gráfico de evolución ni descarga histórico agregado: se limita al valor actual y a sus indicadores numéricos. Las gráficas individuales de la ficha de cada producto sí se conservan.
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
- No hay gráfico de evolución de cartera: se muestra únicamente la valoración numérica y sus indicadores. Las gráficas de cada producto permanecen en su ficha.
- Debajo de los tres contenedores de resumen se listan los productos de cartera; más abajo se listan las operaciones.
- Las operaciones pueden eliminarse y su borrado revierte el traspaso asociado.

**Explorar mercados**

- El buscador vive en “Explorar mercados”. Mientras se escribe, muestra resultados filtrados, no exige un botón de búsqueda.
- Los tres productos destacados de esa zona son los **tres últimos abiertos**, persistidos con `ft_invest_recent_assets_<userId>`, y no ejemplos fijos.
- Actualmente los recientes se muestran bajo el campo de búsqueda. El intento de moverlos encima y eliminar su rótulo se revirtió el 2026-09-02 por una regresión de inicio que requiere investigación antes de volver a aplicarlo.
- Al seleccionar producto se abre una hoja/modal cerrable dentro de la pestaña; no debe cubrir indebidamente el menú lateral de escritorio.

**Detalle de producto**

- Muestra nombre, símbolo/ISIN, icono, precio/NAV, variación diaria, estadísticas y botones Comprar/Vender.
- Los logotipos corporativos usan `assets.parqet.com/logos/symbol/{SYMBOL}` como fuente primaria (sin fondo, sin halo) y `t2.gstatic.com/faviconV2` como fallback para gestoras de fondos (`ASSET_LOGO_DOMAINS`). Fallback final: inicial del ticker. Clearbit está caído desde 2025-12 y ya no se usa.
- El gráfico representa la serie en orden cronológico: antiguo a la izquierda, reciente a la derecha.
- Rangos: `1D`, `1M`, `6M`, `YTD`, `1A`, `5A`.
- El valor superior derecho de la gráfica cambia según el rango seleccionado. La variación diaria visible en la ficha sigue siendo siempre diaria.
- La línea debe ser fina, uniforme y de aspecto de app de mercado (aprox. 1.6 px), no una curva de grosor irregular.
- Debe poder inspeccionarse precio/fecha mediante hover en escritorio y toque/arrastre en móvil.
- Usa carga progresiva y caché de series para minimizar esperas. No inventar datos si el proveedor falla: mostrar estado de carga/error claro.

**Fondos**

Los fondos necesitan especial cuidado porque suelen identificarse por ISIN y publicar valor liquidativo diario, no intradía. El ISIN debe poder buscarse directamente. El fondo `IE00BYX5MX67` tiene un resolver específico: prioriza el `price` actual de Twelve Data; después usa proveedores alternativos y, como último recurso, el NAV publicado de 16,40037595 € con fecha 2026-09-03. Un valor estático es solo respaldo y debe presentarse como tal, no como cotización en tiempo real. La solución definitiva requiere una fuente de NAV de fondos con licencia y cobertura fiable.

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

1. Crear copia de seguridad si el cambio es grande, siguiendo la convención existente. Solo sobrescribir el snapshot del repositorio cuando el usuario lo solicite expresamente.
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

| 2026-09-04 | Se implementó el conjunto de mejoras integrales: validación sintáctica automatizada con script Node.js, desacoplamiento y soporte multiusuario/autenticado en `monthly-report`, caché de cotizaciones con TTL de 10 min en Inversión, selector de ámbito para búsqueda global entre todos los movimientos o el mes actual, feedback interactivo de carga de precio en modal de compra/venta y monitorización del estado de copias en la nube en Ajustes. | `index.html`, `serviceworker.js`, `monthly-report/index.ts`, `automatic-backup/index.ts`, `scripts/validate-syntax.js`, `PROJECT_CONTEXT.md`. | Cuatro bloques de scripts embebidos validados sin errores con `node scripts/validate-syntax.js`; versión `2026.09.04.1`, caché `v134`. |

| 2026-09-04 | Se implementaron tres mejoras clave: 1) Barra de distribución de cartera (Asset Allocation) en Inversión por tipo de activo con cálculo dinámico en tiempo real y compatibilidad con modo privado; 2) Indexación en memoria de transacciones (_txByMonthStr, _txByYearStr, _txByAccount) eliminando sobrecoste de objetos Date y acelerando drásticamente cálculos de saldos, estadísticas anuales y exportaciones; 3) Botón en Ajustes para limpiar la caché local cifrada y resincronizar con Supabase protegiendo la cola offline; 4) Registro vinculante de descartados y preservación de calculadora/teclado rápido. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Cuatro bloques de scripts embebidos validados con `node scripts/validate-syntax.js` (0 errores); versión `2026.09.04.2`, caché `v135`. |

| 2026-09-04 | Remediación integral y exhaustiva de todos los hallazgos identificados por los 10 agentes auditores: 1) Edge Functions: restauración de utilidades en `monthly-report` (`euro`, `json`, `sha256`, `base64`, `median`, `exportPdf`), corrección de extracción de fechas históricas de Yahoo en `market-data` (`slice(0,16)` vs `slice(0,10)`), paginación por lotes en `automatic-backup` para eliminar el límite de 1.000 filas de PostgREST; 2) Migración SQL `20260904122000_update_replace_fintrack_data_for_investments.sql`: inclusión de `investment_operations` y `accounts.is_investment` en backup/restore atómico `replace_fintrack_data` y permisos RLS en `transaction_voids`; 3) Frontend & Motor Financiero: token `--brand-green` ajustado a `#248A3D` en tema claro para cumplir contraste WCAG 4.5:1, tap targets de 44px con pseudo-elementos táctiles en controles pequeños, corrección de corrupción de entidades HTML en `hlText`, búsqueda insensible a diacríticos (`normStr`) y con precedencia de ámbito completo sobre modo anual, solución al desplazamiento de día ancla en recurrencias (`root.recur_anchor_date`), importe dinámico en presupuestos recurrentes, rescate de eliminaciones recurrentes por clave compuesta `(user_id, recur_series_id, skipped_date)`, fallback a cola offline en borrado si la RPC de anulación falla, blindaje contra colisiones 23505 y mutex concurrente `isProcessingOfflineQueue` en la cola offline, aislamiento total multiusuario de colas y operaciones en memoria al cerrar sesión, renombramiento y borrado offline de categorías, enmascaramiento estricto en modo privado de operaciones, movimientos y patrimonios de inversión, exportación PDF con numeración de páginas (`Pág. X de Y`), desglose de cuentas en transferencias y exclusión de ajustes de saldo en gráficos circulares, optimización O(N) en resumen mensual de exportación Excel, purga de código muerto en importación JSON y redondeo/cuenta por defecto en `dtQuickAdd`. | `index.html`, `serviceworker.js`, `supabase/functions/monthly-report/index.ts`, `supabase/functions/market-data/index.ts`, `supabase/functions/automatic-backup/index.ts`, `supabase/migrations/20260904122000_update_replace_fintrack_data_for_investments.sql`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores); batería de tests y simulaciones de motor financiero superada (13/13 tests); versión `2026.09.04.3`, caché `v136`. |

| 2026-09-04 | Se eliminó el encabezado redundante de la pestaña de Inversión (`.invest-head`: «Mercados y cartera», «Inversión», «Sincronizado»), maximizando el espacio vertical disponible y alineando el diseño directamente con la tarjeta de valor de cartera (`.portfolio-card`), homogéneo con las demás pestañas. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica exitosa con `node scripts/validate-syntax.js`; versión `2026.09.04.4`, caché `v137`. |

| 2026-09-04 | Se restauraron los logos corporativos en la ficha de producto de Inversión: se sustituyó la API Clearbit (caída en diciembre 2025) por `assets.parqet.com/logos/symbol/{SYMBOL}` como fuente primaria (SVG limpio sin fondo para todas las acciones y ETFs con ticker), y `t2.gstatic.com/faviconV2` como fuente secundaria para gestoras de fondos cuyos tickers no estén en Parqet (Vanguard, iShares, BlackRock, Amundi, Fidelity…). `ASSET_LOGO_DOMAINS` ahora contiene únicamente los dominios de gestoras de respaldo; todos los tickers estándar van directamente a Parqet. El fallback final es la primera letra del símbolo. | `index.html`, `serviceworker.js`. | `node scripts/validate-syntax.js` (0 errores); versión `2026.09.04.5`, caché `v138`. |

| 2026-09-05 | Remediación integral masiva de hallazgos de auditoría (19 puntos corregidos de una tajada): 1) Backend y SQL: nueva migración `20260905140000_fix_replace_fintrack_data_investment_columns.sql` corrigiendo `transaction_id` (antes `linked_transaction_id`) e incorporando `investment_account_id` con fallback en `replace_fintrack_data`, cabeceras CORS completas y preflight `OPTIONS` en `monthly-report/index.ts`, exclusión de `is_balance_adjustment` en el informe mensual, y eliminación de tabla inexistente `audit_log` en `automatic-backup/index.ts`; 2) Motor financiero y transacciones: solución a regresión de cuotas recurrentes en `processRecurring` tomando valores de `latest` en vez de `root`, mitigación de pérdida de decimales con coma europea en `saveTx`, selección de cuenta obligatoria cuando existen múltiples cuentas, filtrado de categorías por `kind` en formularios y recarga en `setType`, y blindaje de código muerto en `dtQuickAdd`; 3) Visualizaciones y Dashboard: corrección del bug en canales `00` en `donutRgb` evitando desaturación a 140, cálculo exacto de porcentajes del donut sobre `chartTotal`, límite inferior `Math.max(0, ...)` en barra de presupuesto ante meses con ajustes positivos de tesorería, y precedencia de filtros de fecha sobre modo anual en `getDashboardTx`; 4) Privacidad, búsqueda y resiliencia: protección del importe en `editTx` bloqueando exposición si el modo privado está activo, encolado previo de borrado de `budgets` en `deleteCat` offline previniendo colisiones de claves foráneas, borrado por clave compuesta `(user_id, recur_series_id, skipped_date)` en `undoRecurringOccurrenceDelete`, y búsqueda numérica optimizada con formato euro y decimales con punto; 5) Accesibilidad: contraste WCAG AA mejorado en banner offline (`#1A1814` sobre fondo ámbar), comprobación de `prefers-reduced-motion` en `shouldAnimateNumbers`, y áreas táctiles de 44x44px con pseudo-elementos `::after` en controles pequeños. Se descartó expresamente añadir botón de borrado en móvil para transacciones, manteniéndose swipe por diseño. | `index.html`, `serviceworker.js`, `supabase/migrations/20260905140000_fix_replace_fintrack_data_investment_columns.sql`, `supabase/functions/monthly-report/index.ts`, `supabase/functions/automatic-backup/index.ts`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores); batería de suites de auditoría ejecutada con éxito (Agente 8: 17/17, Agente 4: 100%, Agente 3: 17/17); versión `2026.09.05.1`, caché `v139`. |

| 2026-09-05 | Remediación integral ronda 2 y mejoras avanzadas aprobadas (excluidas 1, 3 y 6 por decisión del usuario): 1) Privacidad y Seguridad: blindaje absoluto de importes de inversión en edición de operaciones (`openInvestmentOperationEdit`) bajo modo privado y cierre de canal lateral en búsqueda de movimientos (las búsquedas numéricas no revelan movimientos de inversión si el modo privado está activo); 2) Cola Offline y Resincronización: eliminación de condición de carrera en `processRecurring` y `processOfflineQueue` mediante instantánea determinista con `Set` de elementos procesados, promesa única compartida en vuelo (`offlineQueuePromise`) y detección anticipada de falta de red (`networkDown`) evitando bucles de reintento inútiles; 3) Motor Financiero y Recurrencias: soporte para cadencias trimestral (`quarterly`, +3 meses) y semestral (`semiannual`, +6 meses) en selector, motor de cuotas y validación de importaciones; propagación estricta de `recur_end_date` desde `latest` o `root` respetando fin de serie; propagación de `recur_anchor_date` al editar cuotas en `saveTx`; conciliación de cuentas robusta ante desfases residuales de coma flotante y umbral >= 0.005 €; bloqueo de edición/borrado manual de ajustes de saldo (`is_balance_adjustment`) con aviso toast pedagógico; 4) Inversión: valor real de posición viva en "Tu posición" en ficha de producto enlazado a `investmentPositionList()`, filtro de polvo infinitesimal (threshold `0.0000001`) en `investmentUnits` y soporte para taxonomía Bitcoin (`crypto`) en `normalizeAssetType`; 5) UX y Visualización: filtro multicriterio por cuenta bancaria en panel de filtros y listado de transacciones; feedback háptico (`navigator.vibrate(10)`) en gesto móvil swipe al cruzar el umbral del 38%; prevención de event bubbling en cara trasera del heatmap mensual y panel KPI anual en modo anual volteado; 6) Importación y Backend: validación preventiva de `investmentOperations` y `accounts.is_investment` booleano en importador JSON con bloqueo preventivo si no hay red; nueva migración `20260905180000_fix_recurring_tags_and_add_indexes.sql` con casteo explícito de `tags` a `text[]` en `create_fintrack_recurring_occurrence` y 6 índices compuestos para alta velocidad en consultas de movimientos, saldos y operaciones; sincronización y robustecimiento de Edge Function `restore-backup` mediante llamada atómica a `replace_fintrack_data`; 7) Accesibilidad: contraste WCAG AA mejorado con `--text3: #6E6E73` en tema claro, tap targets ampliado a >= 44x44px en paleta de colores, borrado de operaciones y controles de presupuesto; gestión de foco (`trapFocus`), `role="dialog"` y cierre con tecla `Escape` en ficha de activo. | `index.html`, `serviceworker.js`, `supabase/migrations/20260905180000_fix_recurring_tags_and_add_indexes.sql`, `supabase/functions/restore-backup/index.ts`, `supabase/functions/automatic-backup/index.ts`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores); batería de auditoría y tests aprobada; versión `2026.09.05.2`, caché `v140`. |

| 2026-09-05 | Corrección crítica de arranque: resolución de pantalla de carga bloqueada (`ReferenceError: filterAccount is not defined`). Se declaró `filterAccount` en el ámbito global de variables de filtro, se blindó `setAccent` para evitar llamadas a `refreshTab` antes de la carga de datos (`!loadDataInFlight`), se protegió la preparación de UI en `showApp` con bloque `try/catch` garantizando que `loadData()` y `hideLoading()` se ejecuten siempre, se aseguró la limpieza de `loadDataInFlight` y llamada a `hideLoading` en el bloque `finally` de `loadData`, y se añadió un watchdog de seguridad de 5 segundos que fuerza la ocultación del `loadingOverlay` ante cualquier latencia extrema o fallo imprevisto. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores y validación en navegador real (Edge headless CDP); versión `2026.09.05.3`, caché `v141`. |

| 2026-09-05 | Corrección del porcentaje de gasto en categorías respecto a lo presupuestado: en la cabecera de la fila de categoría (`.cat-row-top`), el porcentaje visible junto al importe refleja ahora el cumplimiento respecto al presupuesto asignado (`amt / budget * 100`) cuando `budget > 0`, en lugar de calcularse erróneamente sobre el total global de gastos del mes (`amt / pctDenom * 100`). Incorpora indicación cromática (`var(--red)` con peso 600 si se alcanza o supera el 100%, `var(--amber)` a partir del 80%) y mantiene el peso relativo sobre el total mensual solo en categorías sin presupuesto asignado o categorías de ingresos. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores) y batería de pruebas unitarias en Node.js; versión `2026.09.05.4`, caché `v142`. |
| 2026-09-08 | Armonización integral de diseño, UX y tokens de interfaz liderada por 10 agentes auditores especialistas: 1) Escala global de radios y tamaños (`--radius-xl: 28px`, `--radius-lg: 20px`, `--radius-md: 16px`, `--radius-sm: 14px`, `--radius-xs: 10px`, `--radius-pill: 9999px`, `--btn-h: 44px`, `--input-h: 44px`); 2) Autenticación y splash: sustitución de negro forzado por `var(--bg)` adaptable a tema claro/oscuro, tarjetas con `--radius-xl`, imagotipo vector `ft.` en lugar del zigzag genérico, y botón de acceso con gradiente esmeralda y resplandor; 3) Cabecera y navegación: separación de `.period-toolbar` y `.header-actions` como hermanos en `.header-right` para visibilidad de Ajustes en modo Anual móvil, chevrons SVG vectoriales en navegación de periodos, selector de mes inmune a CLS (`min-width: 120px`), botón de Ajustes de escritorio desacoplado de estilos de peligro, y píldora activa de navegación inferior móvil visible en tema claro con specular highlight; 4) Inicio y Transacciones: unificación de tarjetas KPI a `--radius-md`, purga de estilos obsoletos de inversión superpuestos, barra de presupuesto a 6px pill, alineación geométrica de filas de transacción con contenedor swipe coordinado e iconos de 36x36px; 5) Categorías: corrección de colisiones táctiles en paleta de colores (32px con gap de 10px), flip card 3D armonizado sin saltos dimensionales (26px y elevación idéntica en cara frontal y trasera), y marcador de presupuesto visible en modo oscuro; 6) Cuentas y Patrimonio: contenedor `.pat-wrap` (760px), tarjeta hero de patrimonio total con gradiente sutil líquido esmeralda, alineación tabular estricta de desfases con clases semánticas (`diff-pos`, `diff-neg`, `diff-zero`), y limpieza de indicadores de cuenta predeterminada; 7) Anual: contenedor `.annual-wrap`, chevrons vectoriales SVG en navegación de año, ocultación de días de la semana descontextualizados en heatmap anual volteado (con tarjetas de cristal líquido `.annual-kpi-card`), y sincronización milimétrica del eje lateral (`padL = 40`) entre gráfico de barras y líneas (se descartaron por petición expresa del usuario las 4 tarjetas KPI en cabecera anual); 8) Inversión: `.invest-wrap` armonizado, eliminación del aro decorativo `:after` en `.portfolio-card`, centrado modal de operativa en escritorio (`@media(min-width:768px)`), y corrección de contraste en porcentajes negativos; 9) Modales, Formularios y Toasts: reubicación de `.undo-toast` en la parte superior estilo Dynamic Island evitando solapamiento con el FAB flotante, chevron desplegable SVG en `select.field-input`, sustitución de botones verdes redundantes en el modal de exportación por cuadrícula de formato (`.export-format-grid`: PDF, XLSX, CSV), y purga de variables muertas en Ajustes. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica con script Node.js (0 errores en 4 bloques de script); versión `2026.09.08.2`, caché `v144`. |
| 2026-09-08 | Corrección crítica de ventana de inversión y ficha de producto (`.asset-sheet`): restauración del posicionamiento fijo modal (`position: fixed; inset: 0; background: var(--bg); z-index: 100; overflow-y: auto; -webkit-overflow-scrolling: touch;`), contenedor de escritorio centrado (`@media(min-width:768px)`) con sombra periférica de bloqueo modal (`0 0 0 100vmax rgba(0,0,0,.45)`), restauración íntegra de estilos base perdidos tras deduplicación errónea de CSS (`.invest-search`, `.search-results`, `.search-result`, `.invest-empty`), definición de clases globales `.positive` y `.negative` para coloración en variación diaria, hit target de 44x44px en botón de cierre, botones de acción inferior Comprar (`.buy` con gradiente y sombra táctil) y Vender (`.sell` con borde y color de alerta), y gestión de cierre limpio ante tecla Escape y pulsaciones fuera del modal sin memory leaks. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores, batería de tests de simulación de inversión (`test-investment-sim.js`) y dashboard (`simulate-dashboard-stats.js`); versión `2026.09.08.3`, caché `v145`. |
| 2026-09-08 | Corrección de maquetación y tamaño de iconos en listado de cartera de inversión (`.positions` y `.position`): consolidación y blindaje de las reglas CSS de cuadrícula (`.positions .position, .position` con `display: grid; grid-template-columns: 34px minmax(0,1fr) 30px auto 16px; align-items: center;`) y dimensiones estrictas para contenedores de logos e imágenes (`.position i` con `width/height` de 34px y `overflow: hidden; .position i img` con `max-width/max-height` de 34px y `object-fit: contain;` ídem para `.search-result i` con 30px y `.asset-logo` con 44px), impidiendo desbordamientos del 100% de pantalla en móvil y escritorio ante favicons/logos de gestoras (ej. Fidelity). Unificación de todos los fragmentos dispersos de CSS de inversión en la hoja de estilos principal. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Cuatro bloques de script embebidos validados sin errores con `validate-syntax.js`; versión `2026.09.08.4`, caché `v146`. |
| 2026-09-08 | Corrección de desbordamiento horizontal en móvil en la pestaña Inversión: eliminación de doble padding lateral (cero padding lateral en `.invest-wrap` en móvil al estar ya provisto por `.tab-content`, 14px 16px en escritorio), contención estricta de anchos fluidos (`min-width: 0; max-width: 100%; box-sizing: border-box;`) en `.invest-wrap`, `.portfolio-card`, `.invest-stats`, `.invest-allocation`, `.invest-explore`, `.positions` e `.invest-operations`. Contención y scroll horizontal táctil nativo aislado en `.invest-chips` con `overflow-x: auto; overflow-y: hidden; scrollbar-width: none;` e impedimento de expansión intrínseca de contenedores padre. Columnas de `.invest-stats` a `repeat(3, minmax(0, 1fr))` con elipsis en cifras y ajuste fino de cuadrícula de posiciones (`34px minmax(0,1fr) 24px auto 14px` con gap de 8px). Supresión de `transform: translateX(3px)` en hover para evitar jitter en pantallas táctiles. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Cuatro bloques de script embebidos validados sin errores con `validate-syntax.js`; simulaciones de inversión superadas; versión `2026.09.08.5`, caché `v147`. |
| 2026-09-08 | Corrección de cálculo en vivo de fondos de inversión y actualización dinámica de cartera: 1) Backend Edge Function (`market-data`): resolución de ISINs de fondos europeos mapeando a series de NAV diarias de Morningstar en Yahoo Finance (`0P0001CLDM.F` para Fidelity S&P 500 `IE00BYX5MX67`, `0P0001CLDK.F` para MSCI World, `0P00000RQC.F` para Vanguard), supresión del bypass que fijaba un fallback estático obsoleto del 3 de septiembre, soporte para `meta.regularMarketPrice` cuando el array de cierres viene vacío, y cabeceras con User-Agent de navegador moderno; 2) Frontend (`index.html`): actualización dinámica de las filas individuales de posiciones (`.positions .position`) en `refreshInvestmentMarketValue` sustituyendo la etiqueta fija «Coste» por el valor vivo actualizado y el porcentaje de plusvalía/minusvalía (`posPctStr` en verde o rojo) y sincronización de `position-spark`, ponderación equilibrada del valor total de cartera preservando el coste como suelo ante cotizaciones pendientes sin distorsionar la rentabilidad global, pase de la cotización real en vivo `p` a `getAssetPositionDisplay(symbol, p)` en la ficha de activo (`openAssetSheet`) para mostrar la plusvalía de «Tu posición», y reducción del TTL de caché de cotizaciones a 5 minutos. | `supabase/functions/market-data/index.ts`, `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores, batería de tests de simulación de inversión superada; versión `2026.09.08.6`, caché `v148`. |
| 2026-09-08 | Implementación de mejoras aprobadas de rendimiento, robustez, pulido visual y UX: 1) Visual Polish & UX: integración de la View Transitions API nativa (`document.startViewTransition`) en `switchTab` con CSS adaptado y respeto a `prefers-reduced-motion` para transiciones fluidas de pantalla, y alternancia global de Modo Privado mediante doble pulsación/clic en el imagotipo `ft.` (`.app-mark` móvil y `.dt-logo` escritorio) con toast informativo dinámico; 2) Rendimiento y resiliencia: sincronización inteligente con throttling de 25 segundos en `loadData(force)` evitando consultas repetitivas completas a Supabase en ráfagas de navegación pero permitiendo sincronización forzada inmediata en `forceSync()` y `clearLocalCacheAndResync()`, compresión nativa con GZIP (`.json.gz`) en descarga de copias de seguridad mediante `CompressionStream('gzip')` y descompresión transparente al importar con `DecompressionStream('gzip')`, y desempaquetado tolerante en `getCachedQuote` para admitir cargas anidadas o directas de cotizaciones (`price`, `close`, `regularMarketPrice`); 3) Registro vinculante en Sección 12 de las 7 propuestas descartadas del brainstorming. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores, batería de simulación de inversión superada; versión `2026.09.08.7`, caché `v149`. |
| 2026-09-08 | Corrección crítica del valor de cartera a 0 € por tratamiento incorrecto de `null` en cierres de Yahoo Finance: Yahoo devuelve `null` en los días de fin de semana y futuros del array `indicators.quote[0].close`, y `Number(null) === 0` pasaba el filtro `Number.isFinite()`. Se reforzó el filtrado en la Edge Function `market-data` (`yahooQuote` y `yahooHistory`) exigiendo `v !== null && v !== undefined && Number(v) > 0` para descartar cierres nulos, con fallback a `meta.regularMarketPrice` cuando todos los cierres del array son nulos. En el frontend, `getCachedQuote` ahora valida `price > 0` antes de cachear, `refreshInvestmentMarketValue` y `openAssetSheet` incorporan `regularMarketPrice` como tercer fallback y comprueban `price > 0`, y el modal de compra/venta también valida positivamente el precio autorellenado. | `supabase/functions/market-data/index.ts`, `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores, batería de simulación de inversión superada; versión `2026.09.08.8`, caché `v150`. |
| 2026-09-09 | Implementación de 4 mejoras solicitadas: 1) Exclusión mensual de categorías en gastos (ej. Wetaca): nuevo toggle por categoría en la pestaña Categorías (`isCategoryExcludedFromExpense`) que permite activar o desactivar el cómputo de gastos para el mes seleccionado sin alterar el descuento del saldo real/teórico de la cuenta bancaria en `accountTxDelta`; 2) Personalización de color de cuentas: selector con paleta `PALETTE` al pulsar el indicador de color de cualquier cuenta en la pestaña Cuentas (`saveAccountColor`); 3) Personalización de icono de categorías: catálogo ampliado de 25 iconos SVG limpios y selector visual al pulsar sobre el icono de categoría (`saveCatIcon`); 4) Corrección del gráfico de evolución del patrimonio en Anual: cálculo inclusivo de series considerando la primera actividad (ajustes, transacciones u operaciones de inversión) para que las cuentas de inversión y cuentas activas dibujen su línea continua. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica con 0 errores, batería de tests de simulación de inversión superada; versión `2026.09.09.1`, caché `v151`. |
| 2026-09-09 | Ajustes finos en Evolución del Patrimonio y Tasa de Ahorro Media: 1) Inclusión automática y garantizada de la serie de Inversión en el gráfico de evolución patrimonial (`#lineChartCanvas`) cuando existen operaciones de inversión registradas, independientemente de si existe una fila explícita en `accounts` o solo operaciones en `investmentOperations`, asignando color contrastado no repetido y calculando el valor del portfolio mes a mes según posiciones y cotizaciones; 2) Corrección de la tarjeta «Tasa de ahorro media» en estadísticas anuales: el importe entre paréntesis muestra ahora la cantidad media mensual ahorrada (`avgSavPast = (sumIncPast - sumExpPast) / pastMonthsWithData.length`), en lugar del acumulado total anual, alineándose fielmente con la definición de media mensual; 3) Restauración de la función `legItem` en `renderAnnualTab` resolviendo error de referencia al renderizar leyendas de gráficos. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores, pruebas de renderizado DOM completas; versión `2026.09.09.4`, caché `v154`. |
| 2026-09-09 | Unificación y modernización tipográfica integral basada en la auditoría de 3 subagentes especialistas: 1) Pila tipográfica y Google Fonts: carga optimizada con preconnect a `fonts.gstatic.com`, estandarización de interfaz en `Plus Jakarta Sans` (400-800) geométrica y ultra-nítida, preservación estricta al 100% de la fuente del logotipo `Outfit` (800) para `ft.` e imagotipos, y corrección del token `--mono` a `JetBrains Mono` (400-800) con `font-variant-numeric: tabular-nums lining-nums;` y `font-feature-settings: 'tnum' 1, 'lnum' 1, 'cv05' 1;` eliminando la oscilación o wobble en importes financieros; 2) Accesibilidad y contraste: corrección de `--text3` en modo oscuro (opacidad elevada de 0.32 a 0.58, alcanzando ratio de contraste 5.4:1 y cumpliendo WCAG 2.1 AA); 3) Prevención de Auto-Zoom en Safari iOS: regla universal a 16px en `@media(max-width:767px)` para todos los inputs y selects de la app; 4) Armonización de jerarquía visual y micro-textos: normalización de overlines/mayúsculas con tracking semántico (`letter-spacing: 0.06em`), corrección de subpíxeles (`.bnav-label` a 10px / 600), .stat-title migrado a `var(--font)` y jerarquía unificada en transacciones (`.tx-cat` 15px/600, `.tx-subcat` 13px/500, `.tx-note` 12px/400, `.tx-amount` 15px/700/mono). | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores, batería de tests de simulación superada; versión `2026.09.09.5`, caché `v155`. |
| 2026-09-09 | Estandarización tipográfica con la fuente Inter (versión variable con soporte tabular y OpenType feature flags `tnum`, `cv02`, `cv03`, `cv04`, `cv11`) para unificar el diseño con el resto de aplicaciones del sistema SAEZ: 1) Font stack universal (`--saez-font-sans: 'Inter', 'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`); 2) Carga dual de Inter vía Google Fonts y `@font-face` con archivo local WOFF2 (`./fonts/inter-latin-wght-normal.woff2`) con unicode-range; 3) Sustitución de la fuente monoespaciada por cifras tabulares proporcionales de Inter en todas las cifras, importes, tablas, balances, carteras y KPIs (`font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1, 'cv02' 1, 'cv03' 1, 'cv04' 1, 'cv11' 1;`), evitando la apariencia monoespaciada tosca pero manteniendo la alineación vertical fija de dígitos; 4) Estilos de impresión y exportación (`@media print`) sincronizados; 5) Preservación estricta del imagotipo y marca `--logo-font: 'Outfit'` (800). | `index.html`, `serviceworker.js`, `fonts/inter-latin-wght-normal.woff2`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores; versión `2026.09.09.6`, caché `v156`. |
| 2026-09-10 | Rediseño integral y modernización de la extracción en PDF (FinTrack): 1) Identidad de marca y tipografía única: renderizado Hi-DPI en Canvas del imagotipo oficial `ft.` (`f` en blanco/texto y `t.` en verde esmeralda `#34C759`) con la fuente corporativa `Outfit` (peso 800) y marca `fintrack` en `Inter` (peso 800); 2) Cabecera ejecutiva en bloque obsidiana (`#121418`) con acento superior en gradiente esmeralda-cian (`#34C759` -> `#0FB8AD` -> `#007AFF`), badge de período, usuario y fecha de emisión; 3) Tarjetas KPI de resumen ejecutivo (Ingresos, Gastos, Balance Neto y Tasa de Ahorro) con superficies suaves tintadas (`#F0FDF4`, `#FEF2F2`, `#EFF6FF`), bordes delicados de 0.35mm, iconos circulares e importes en cifras tabulares; 4) Gráficos analíticos Hi-DPI: gráfico donut de distribución de gastos con pista de fondo (`#F3F4F6`), arcos anti-aliasing con la paleta real de categorías y centro informativo en `Inter`, acompañado de ranking de categorías con barras de progreso y porcentajes; 5) Evolución diaria del saldo: gráfico de área con curva suavizada, gradiente esmeralda semitransparente, cuadrícula discontinua y punto de saldo final resaltado; 6) Fichas de cuentas bancarias y cumplimiento presupuestario con barras de progreso y marcadores de objetivo; 7) Libro detallado de movimientos: cabecera oscura tipo pizarra (`#1E222A`), filas alternas suaves (`#FFFFFF` y `#F9FAFB`), badges de categorías, desglose de transferencias `Cuenta A → Cuenta B` e importes coloreados tabulares; 8) Paginación inteligente y pie de página institucional en todas las páginas. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores) y tests de simulación superados; versión `2026.09.10.1`, caché `v157`. |
| 2026-09-10 | Rediseño editorial de alta gama "White Edition" para la extracción en PDF (FinTrack) orquestado por 3 agentes especialistas (Dirección de Arte Editorial, Infografía Hi-DPI y Tipografía/Open Ledger): 1) Erradicación total de cuadros negros pesados y look principiante/tosco: eliminación del contenedor oscuro del encabezado (`#121418`) y de la cabecera negra de la tabla de movimientos (`#1E222A`). Toda la maquetación se despliega sobre fondo blanco inmaculado (`#FFFFFF`) con divisores *hairline* ultra-finos (0.15–0.25mm) en tonos Slate neutros (`#E2E8F0`, `#CBD5E1`); 2) Identidad de marca oficial auténtica: imagotipo flotante `ft.` sobre fondo blanco en tipografía `Outfit 800` (`f` en Slate 950 `#0F172A` y `t.` en Verde Esmeralda `#16A34A`), wordmark oficial `fin` (`#0F172A`) + `track.` (`#16A34A`) en `Outfit 800` idéntico a la pantalla de carga, y subtítulo en `Inter 600` con tracking expandido; 3) Tarjetas KPI ejecutivas en alabastro sutil (`#F8FAFC`) con reborde hairline de 0.22mm, micro-indicadores circulares de 1.2mm, y cifras en `Inter` tabular; 4) Infografía y gráficos Hi-DPI refinados: Donut de gasto ultra-esbelto (*The Slender Kinetic Ring*, grosor del anillo al 6.3% del diámetro, pista base seda `#F2F4F7`, separación angular de 0.018 rad y centro tipográfico en `Inter`), Gráfico de evolución diaria con trazo *hairline* de 1.05px en esmeralda `#059669`, spline cúbico suavizado ($\tau = 0.22$), gradiente líquido "Emerald Mist" ultratranslúcido (0.11 a 0.0), cuadrícula hairline discontinua tenue y puntero cronómetro de precisión (micro-dot de 2px con halo de 4px), y micro-barras de progreso de 1.5–1.6mm y aguja de relojero (*Watchmaker Needle*) de 0.18mm con cabezal horizontal simétrico para marcar presupuestos; 5) Libro de Movimientos "Open Ledger": cabecera abierta sobre alabastro (`#F8FAFC`) delimitada por doble *hairline* de 0.25mm en Slate 300, filas con altura generosa (7.2mm), micro-pastillas de categoría con tinte suave al 12%, importes rigurosamente tabulares a la derecha y barra de totales consolidados al pie; 6) Pie de página institucional y paginación fluida en todas las páginas: divisor hairline de 0.18mm, micro-imagotipo `ft.`, leyenda de confidencialidad y paginación tabular con formato `Página 01 / XX`; 7) Sincronización en `runExport` esperando `document.fonts.ready` para garantizar renderizado vectorial nítido de `Outfit` e `Inter` en Canvas. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores en 4 bloques de script) y simulación PDF end-to-end con 0 excepciones; versión `2026.09.10.2`, caché `v158`. |
| 2026-09-10 | Rediseño editorial White Edition 2.0 de la exportación PDF (FinTrack) con ADN visual unificado 1:1, micro-guías ultra-esbeltas de 0.8mm, Squircles y tarjetas KPI amplias: 1) Erradicación de tarjetas condensadas e infantiles: KPI cards ejecutivas con altura ampliada a 28mm (+33.3% de respiración y holgura), renderizado Canvas Retina Hi-DPI (300+ DPI, dpr=3) con los gradientes líquidos originales de FinTrack a 160° (`rgba(52,199,89,0.16)`, `rgba(255,59,48,0.14)`, `rgba(0,122,255,0.14)`), esquinas squircle de 16px (`--radius-md`), micro-insignias vectoriales (`↑`, `↓`, `◈`) y cifras numéricas en `Inter 800` con espaciado óptico y números tabulares estrictos; 2) Erradicación radical de barras de progreso gruesas y toscas: reducción a micro-guías de precisión de 0.8mm (reducción del 50% de espesor frente a 1.6mm) sobre pista neutral de seda `#EEF2F6` tanto en el ranking de categorías como en el control presupuestario; 3) Geometría squircle auténtica de FinTrack en todos los indicadores: sustitución de los círculos genéricos (`doc.circle`) por el squircle característico (`doc.roundedRect` 2.5x2.5mm con radio 0.75mm, ratio 1:3 exacto de `.cat-dot`); 4) Aguja de micro-precisión de relojero suizo (*Swiss Watchmaker Micro-Pin*): aguja hairline de 0.20mm coronada por micro-pip circular de 0.32mm para marcar los límites presupuestarios con máxima sutileza; 5) Cohesión tipográfica 100% libre de Helvetica en bloques de marca y resumen: imagotipo `ft.` y wordmark `fintrack.` en `Outfit 800` auténtica, Donut estilizado con centro en `Inter 800` y tracking `GASTOS`, curva spline de saldo con niebla esmeralda, y Libro Mayor "Open Ledger" con paginación fluida y micro-pastillas coloreadas; 6) Ritmo editorial en 2 páginas principales (Página 1: Resumen ejecutivo, Donut, categorías y evolución; Página 2: Cuentas bancarias, presupuestos con micro-agujas y Libro de movimientos con paginación automática). | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores en 4 bloques) y simulación PDF end-to-end con 0 excepciones; versión `2026.09.10.3`, caché `v159`. |
| 2026-09-10 | Refinamiento y rediseño de la exportación PDF (FinTrack) con gráficos anuales, tarjetas planas sutiles, cuentas no inversoras y Open Ledger mejorado: 1) Membrete depurado: eliminación de línea verde decorativa superior, imagotipo `ft.` y divisor vertical, y subtítulo editorial; se conserva únicamente la palabra de marca `fintrack.` en `Outfit 800` (`fin` en `#0F172A` y `track.` en `#16A34A`) alineada a la izquierda, junto al mes y fecha de emisión a la derecha (suprimiendo el chip de estado consolidado); 2) Tarjetas KPI planas y sutiles: eliminación de sombras, brillos, gradientes e iconos, adoptando fondos planos sutiles (`#F0FDF4` para Ingresos, `#FEF2F2` para Gastos y `#EFF6FF` para Balance), con borde sutil de 1px e importe de balance en azul marino oscuro `#1E3A8A` si es positivo (o rojo `#DC2626` si es negativo); 3) Sustitución del gráfico de evolución diaria por la Sección Anual con 2 gráficos: a) *Ingresos vs gastos y ahorro mensual* (gráfico de barras a 12 meses con barras de ingresos en verde, gastos en rojo y línea de ahorro en ámbar `#D97706` con nodos circulares y cuadrícula con valores en 'k'), y b) *Evolución mensual del patrimonio* (gráfico de líneas continuo a 12 meses para todas las cuentas ordinarias no de inversión con leyendas coloreadas e interpolación limpia); 4) Categorías y control presupuestario: viñetas cuadradas reducidas a pequeños puntos tipo viñeta (1.3 x 1.3 mm con radio 0.35 mm), textos de categoría en tamaño uniforme (7.5pt), y columna de importes en formato `gasto / límite` (ej. `120,00 € / 250,00 €`); 5) Exclusión estricta de cuentas de inversión en el PDF: se filtran tanto en el listado de estado de cuentas como en la evolución del patrimonio; 6) Libro Detallado de Movimientos (Open Ledger): corrección del espaciado vertical entre subtítulo y cabecera de tabla evitando solapamientos de texto, visualización del día de la semana antes de la fecha (ej. `Jue 15/08/2026`), y celdas de categoría como pastillas uniformes de ancho fijo (28 mm) con texto centrado. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica con `node scripts/validate-syntax.js` (0 errores en 4 bloques), simulación end-to-end superada; versión `2026.09.10.4`, caché `v160`. |
| 2026-09-10 | Reorganización de Página 1 en PDF, Tarjetas KPI con radio de 20px y borde 1px uniforme, y ampliación de espacio vertical en gráficos anuales: 1) Estado de Cuentas Bancarias reubicado en Página 1: se posiciona inmediatamente tras el bloque del Donut / Categorías y antes de los dos gráficos anuales, consolidando toda la visión mensual y de cuentas en la primera página sin necesidad de saltar de hoja; 2) Tarjetas KPI refinadas: radio de esquinas a 20px (`r = 20`), trazo perimétrico uniforme de 1px mediante inset de 0.5px (`cardX = cx + 0.5`, `cardY = 0.5`, `cardW = cw - 1`, `cardH = ch - 1`) evitando el recorte exterior al 50% de los bordes superior/inferior/laterales, y kicker renombrado limpiamente a `BALANCE` (en sustitución de `BALANCE NETO`); 3) Espacio y respiración en gráficos anuales: aumento de altura de canvas a 146px con `titleY = 20` y `padT = 48` (frente a 28 anterior), creando 28px de aire limpio y despejado entre títulos/leyendas y la zona de trazado de barras y curvas, eliminando la sensación de compresión visual cuando los valores alcanzan el techo del eje; 4) Página 2 reestructurada: arranca de forma limpia y directa con el Control Presupuestario y el Libro Detallado de Movimientos (Open Ledger). | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores en los 4 bloques; simulación A4 superada (`test-new-annual-pdf.js`); versión `2026.09.10.5`, caché `v161`. |
| 2026-09-10 | Separación clara entre días y cifras de totales coloreadas en el Libro Detallado de Movimientos del PDF: 1) Separación clara entre jornadas en el Libro Mayor (Open Ledger): se implementó detección de fin de jornada (`isDayEnd`) con línea de separación de mayor grosor (`0.45mm`, casi 4 veces el grosor de las líneas intra-día de `0.12mm`) en tono Slate neutro (`180, 195, 210`) y un margen vertical de respiración de `1.4mm` al cambiar de fecha, agrupando con nitidez los movimientos diarios; 2) Totales de cierre con cifras coloreadas: el importe total de ingresos se destaca en verde esmeralda (`#16A34A`), el de gastos en rojo coral (`#DC2626`), el balance neto en azul marino (`#1E3A8A`) o rojo según signo, y el recuento total de movimientos, manteniendo las etiquetas textuales en Slate-500 (`100, 116, 139`) y una retícula de espaciado perfectamente simétrica (gaps de ~22mm entre columnas). | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores en los 4 bloques; simulación PDF superada (`test-new-annual-pdf.js`); versión `2026.09.10.6`, caché `v162`. |
| 2026-09-10 | Calibración milimétrica del límite divisorio entre jornadas en el Libro Mayor del PDF: 1) Corrección de posición del límite: eliminación del salto artificial de `1.4mm` y trazado de la línea divisoria exactamente sobre la frontera geométrica entre filas (`y - 4.2`), tras el pintado del fondo alterno (`doc.rect`), asegurando que la línea quede visible al 100%, centrada con `2.2mm` de margen equidistante entre las entradas superior e inferior y sin desajuste de retícula; 2) Reducción del grosor de la línea a `0.26mm` (frente a `0.45mm` anterior), logrando un trazo limpio, esbelto y distinguible sin sobrecargar el documento. | `index.html`, `serviceworker.js`, `PROJECT_CONTEXT.md`. | Validación sintáctica (`node scripts/validate-syntax.js`) con 0 errores en los 4 bloques; simulación A4 superada (`test-new-annual-pdf.js`); versión `2026.09.10.7`, caché `v163`. |

## 12. Decisiones descartadas (no volver a proponer sin petición expresa)

Este registro es vinculante para futuras sesiones. Cada vez que Miguel rechace una funcionalidad o una alternativa de diseño propuesta, añadir aquí una entrada concreta con fecha, alcance y motivo si lo indicó. No volver a sugerirla por iniciativa propia; solo reconsiderarla si Miguel la pide expresamente o modifica su decisión.

| Fecha | Propuesta o alternativa descartada | Decisión vigente |
|---|---|---|
| 2026-08-30 | Mantener el selector de mes y el botón Anual en las pestañas Anual y Ajustes. | No deben aparecer en esas dos pestañas. |
| 2026-08-30 | Mantener el punto de sincronización visible en las pestañas. | Eliminado de todas las pestañas; la sincronización queda en Ajustes. |
| 2026-08-31 | Mantener un botón «Operación» independiente dentro de Inversión. | No usarlo: la operativa se inicia desde el producto mediante comprar/vender. |
| 2026-08-31 | Mostrar posiciones o gráficos de ejemplo sin datos reales. | Prohibido: mostrar estado vacío hasta que existan datos reales. |
| 2026-09-02 | Color de acento configurable, apartado de presupuesto mensual, estado de sincronización y botón para activar copias automáticas en Ajustes. | No mostrarlos en Ajustes; las copias se ejecutan automáticamente cada cinco días. |
| 2026-09-03 | Métricas de precio medio, plusvalía y rentabilidad por posición añadidas en la última tanda de Inversión. | Retiradas; no reintroducirlas sin petición expresa. |
| 2026-09-03 | Mantener o reintroducir el gráfico de evolución de cartera. | Eliminado por petición expresa; la cartera conserva solo el valor numérico y sus indicadores. |
| 2026-09-04 | Gestión u operaciones de dividendos en Inversión. | Descartado por petición expresa. |
| 2026-09-04 | Detección o avisos de movimientos duplicados al registrar transacciones. | Descartado por petición expresa. |
| 2026-09-04 | Módulo o función de objetivos/metas de ahorro. | Descartado por petición expresa. |
| 2026-09-04 | Swipe actions hacia la derecha para editar o interactuar con transacciones. | Descartado por petición expresa. |
| 2026-09-04 | Bloqueo biométrico nativo (WebAuthn / Face ID / Touch ID). | Descartado: probado previamente y no compatible con la PWA instalada en iOS. |
| 2026-09-05 | Botón visible de eliminación de transacciones en móvil o en modal de edición. | Descartado por diseño: en dispositivos móviles el borrado se efectúa exclusivamente mediante el gesto swipe hacia la izquierda. |
| 2026-09-05 | Evaluador de expresiones aritméticas simples en el campo de importe de transacción (ej. '15+4.5'). | Descartado por el usuario: el importe debe introducirse directamente sin cálculo aritmético en línea. |
| 2026-09-05 | Selector rápido de chips de período común en panel de filtros (ej. 'Últimos 30 días', 'Este año'). | Descartado por el usuario: se mantiene el filtrado manual por rango de fechas existente. |
| 2026-09-05 | Tooltip interactivo flotante en celdas del heatmap diario al pulsar o hacer hover. | Descartado por el usuario: se mantiene la visualización limpia del heatmap sin popovers emergentes adicionales. |
| 2026-09-08 | Cuadrícula de 4 tarjetas KPI en la cabecera superior de la pestaña Anual (Total Ingresos, Total Gastos, Ahorro Neto, Tasa de Ahorro). | Descartado por el usuario: la pestaña Anual mantiene directamente la comparativa con el mes anterior, los gráficos y las estadísticas anuales al pie sin bloque macro en cabecera. |
| 2026-09-08 | Previsión de tesorería a final de mes (Cash Flow Runway / proyección lineal basada en ritmo de gasto diario). | Descartado por el usuario: se mantiene el balance real y presupuestos sin proyecciones lineales estimadas. |
| 2026-09-08 | Plusvalía latente total en euros en cabecera de Inversión (+X € acumulados). | Descartado por el usuario: la cabecera conserva exclusivamente el valor y el porcentaje de rentabilidad global. |
| 2026-09-08 | Detector de coincidencias inteligentes en conciliación de cuentas bancarias (asistente de desajustes). | Descartado por el usuario: la comprobación de saldo en Cuentas se mantiene manual (saldo real vs teórico y desfase). |
| 2026-09-08 | App Shortcuts en manifest.json (accesos directos táctiles en icono de inicio del sistema operativo). | Descartado por el usuario: se mantiene el manifest limpio sin acciones directas de sistema. |
| 2026-09-08 | Memoria predictiva de cuenta habitual por categoría de gasto/ingreso. | Descartado por el usuario: no preasignar cuentas automáticamente por categoría; se mantiene la cuenta predeterminada o manual. |
| 2026-09-08 | Micro-feedback háptico generalizado en pulsaciones de interfaz (guardado de transacciones, cambio de pestaña, botones). | Descartado por el usuario: la vibración háptica se reserva exclusivamente para el swipe de borrado en móvil. |
| 2026-09-08 | Atajos de teclado globales en versión Desktop (N para nuevo movimiento, 1-5 para tabs, F para filtros). | Descartado por el usuario: navegación estándar con ratón/trackpad sin captura de teclas alfanuméricas globales. |
| 2026-09-10 | Bloques negros/oscuros macizos en cabecera (`#121418`) o tablas (`#1E222A`), trazos de línea gruesos (2.2px) y colores de gráficos saturados/caricaturescos en exportación PDF. | Rechazado rotundamente por el usuario («look principiante y cómic»). Se adopta la arquitectura editorial White Edition sobre fondo blanco inmaculado, trazos hairline (0.8–1.05px), tipografía Inter y Outfit oficial, y libro mayor Open Ledger. |
| 2026-09-10 | Barras de progreso de 1.5–1.6mm y tarjetas KPI condensadas de 21mm en PDF. | Descartado por el usuario: transmitían sensación tosca, pesada e infantil. Sustituido por micro-guías ultra-esbeltas de 0.8mm, squircles FinTrack y tarjetas KPI de 28mm con gradiente a 160°. |
| 2026-09-10 | Efecto de iluminación/gradientes a 160° e iconos en tarjetas KPI del PDF, chip de estado «ESTADO CONSOLIDADO», línea decorativa verde superior, imagotipo «ft.» y subtítulo en membrete, gráfico de evolución diaria del saldo en PDF, inclusión de cuentas de inversión en el apartado de cuentas del PDF, y viñetas de categorías más grandes que el texto. | Descartado por el usuario: cabecera limpia con solo `fintrack.` a la izquierda, tarjetas planas sutiles con fondo verde/rojo/azul claro sin iconos, balance en azul oscuro si es positivo o rojo si es negativo, sustitución del gráfico diario por los dos gráficos anuales (ingresos/gastos/ahorro y evolución del patrimonio de cuentas sin inversión), viñetas de categorías reducidas a puntos de numeración (1.3x1.3mm), exclusión de cuentas de inversión del PDF, formato de control presupuestario `gasto / límite`, y libro mayor con día de la semana y pastillas de categoría de tamaño uniforme y centradas sin solapamiento de textos. |

## 13. Ideas futuras priorizadas (no implementadas todavía)

Esta lista conserva las decisiones de producto pendientes. Antes de implementar una idea, actualizar su estado y añadir una entrada de changelog. Un nuevo chat debe consultar primero esta sección y no presentar como existente una función que siga aquí.

| Área | Idea futura | Criterio de entrega |
|---|---|---|
| Planificación | Previsión de tesorería a 30/60/90 días y calendario financiero. | Distinguir previsión de gasto ejecutado y explicar las hipótesis. |
| Presupuestos | Sugerencias basadas en meses anteriores y avisos de riesgo antes de superar el presupuesto. | Nunca alterar presupuestos sin confirmación del usuario. |
| Inversión | Distribución sectorial o por divisa, alertas de precio y rebalanceo de cartera. | Basado en datos de mercado verificables y con fuentes/fallbacks visibles. |
| Búsqueda | Búsqueda global de movimientos, categorías, cuentas y productos con filtros guardables. | Resultados rápidos, accesibles y sin exponer importes en modo privado. |
| Entrada rápida | Teclado numérico / calculadora rápida al introducir importes de transacciones. | No entorpecer el teclado nativo y facilitar sumas o restas rápidas opcionales. |
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
