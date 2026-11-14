# Reglas Obligatorias y Contexto Vivo de fintrack

Este repositorio contiene **fintrack**, una PWA privada y offline-first de finanzas personales.
Cualquier asistente de IA, agente o desarrollador que opere en este proyecto debe acatar estrictamente las siguientes reglas en cada conversación.

---

## 1. Contexto Vivo y Documentación Canónica

Antes de analizar, modificar o implementar cualquier código, consulta los documentos de referencia:

1. **[PROJECT_CONTEXT.md](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/PROJECT_CONTEXT.md):** Contiene el contexto vivo, la arquitectura completa, el histórico de decisiones y el changelog del proyecto.
2. **[DESIGN_SYSTEM.md](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/DESIGN_SYSTEM.md):** Guía visual canónica *White Edition & Liquid Glass*.
3. **Versión actual de la app:** Consulta siempre `APP_VERSION` en `index.html` y la versión de caché en `serviceworker.js`.

---

## 2. Reglas Inviolables de Arquitectura y Diseño

- **Arquitectura Monolítica sin Build:** No uses React, Vue, Vite, TypeScript ni empaquetadores. Toda la interfaz y la lógica residen en `index.html`. Un error de sintaxis bloquea toda la aplicación.
- **Regla CERO EMOJIS:** Prohibición absoluta de utilizar emojis en cualquier parte de la app (ni en botones, alertas, selectores, insignias, títulos, tablas o exportaciones). Utiliza únicamente iconos vectoriales SVG monocromáticos (`stroke="currentColor"`).
- **Identidad de Marca:** El nombre de la aplicación se escribe siempre en minúsculas: `fintrack` (nunca `FinTrack`).
- **Modo Privacidad:** Al activar el modo oculto, difumina los importes numéricos (`.privacy-blur`), pero **nunca** difumines la estructura de los gráficos de dona ni los selectores.
- **Tokens de Color y Squircles:** Usa exclusivamente variables CSS (`var(--bg)`, `var(--bg2)`, `var(--card-border)`, etc.) y radios squircle (`var(--radius-card)`, `var(--radius-md)`). Están prohibidos los colores hex hardcodeados en el CSS de componentes.
- **Área táctil mínima:** Todo elemento interactivo en móvil debe tener un área táctil mínima de 44×44 px.

---

## 3. Lógica Contable y Financiera

- **Tri-estado contable (`computa_todo`):**
  - `0`: Computa en saldo y en estadísticas de ingresos/gastos.
  - `1`: Solo computa en saldo patrimonial (excluido de analítica de gastos).
  - `2`: No computa (apunte informativo).
- **Traspasos internos:** Modifican saldos de cuentas de origen y destino, pero **nunca** computan como gasto o ingreso global.
- **Saldo real vs. teórico:** El saldo real proviene de comprobación física bancaria; el teórico de la suma de movimientos calculados. La diferencia es el desfase.

---

## 4. Protocolo de Publicación Obligatorio

Tras cualquier cambio funcional, técnico o visual:
1. Valida la sintaxis: `node scripts/validate-syntax.js`.
2. Ejecuta los tests: `node scripts/test-math-eval.js` y `node scripts/audit-finance-core.js`.
3. Incrementa `APP_VERSION` y `APP_PUBLISHED_AT` en `index.html`.
4. Incrementa `CACHE_NAME` en `serviceworker.js`.
5. Registra el cambio en el Changelog y cabecera de `PROJECT_CONTEXT.md`.

---

## 5. Skills Especializadas Disponibles

Este proyecto cuenta con las siguientes skills en `.agents/skills/`:
- `fintrack-live-context`: Resumen de dominio, arquitectura y flujos.
- `fintrack-design-guardian`: Auditoría estética, tokens Liquid Glass y verificación CERO emojis.
- `fintrack-deploy-checklist`: Automatización de pruebas, versionado y release a GitHub Pages.
- `fintrack-accounting-auditor`: Verificación matemática del motor contable y tri-estado.
- `fintrack-supabase-sync`: Coherencia con PostgreSQL, RLS y cola offline `processOfflineQueue`.
