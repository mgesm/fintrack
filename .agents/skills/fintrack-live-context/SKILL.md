---
name: fintrack-live-context
description: >-
  Provides live project context, architecture, operational rules, and domain understanding
  for the fintrack personal finance PWA. Activate this skill whenever starting a new conversation
  or task on fintrack, answering questions about what fintrack is, how its modules interact,
  retrieving current versions, or reviewing architecture and design constraints before writing code.
---

# fintrack — Live Context & Project Understanding

This skill provides immediate, comprehensive context on the **fintrack** ecosystem. Use it as the canonical briefing before proposing, reviewing, or writing any code in this repository.

## 1. What is fintrack?

**fintrack** is an offline-first, private Personal Finance Progressive Web App (PWA). It enables users to record income, expenses, internal transfers, budgets, accounts, balance adjustments, recurring transactions, and manage investment portfolios (holdings, real-time quotes, charts, and buy/sell operations).

### Three Core Accounting Tenets:
1. **Expense/Income vs. Transfers:**
   - **Gasto / Ingreso:** Operational cash flow affecting net results and statistical aggregates.
   - **Traspaso (Internal Transfer):** Movement between two internal accounts. Changes account balances, but **never** counts as an expense or income.
2. **Real Balance vs. Theoretical Balance:**
   - **Saldo Real:** Verified balance confirmed by the user against actual bank records.
   - **Saldo Teórico:** Expected balance computed purely from the sum of recorded transactions.
   - **Desfase (Difference):** `Saldo Real - Saldo Teórico`. Indicates missing or unreconciled movements.
3. **Tri-State Accounting (`computa_todo`):**
   - `0`: Fully computed (affects bank account balance, monthly Balance KPI, AND global income/expense/budget statistics).
   - `1`: Net balance only (affects bank account balance AND monthly Balance KPI/patrimony, excluded from spending/income statistics and budgets).
   - `2`: Excluded from monthly Balance KPI, budgets, and income/expense statistics (0 impact in P&L/KPI `#totalBal`), **while still crediting/deducting physical money in bank account balances (`accountTxDelta`)**.

---

## 2. Architecture & File Structure

fintrack deliberately uses **zero build tools, zero bundlers, and zero client-side frameworks** (no React, Vue, Vite, or Webpack). It is a modular static Single Page Application (SPA) with external CSS (`styles.css`), strict-mode deferred JS modules (`js/*.js`), and Content Security Policy (`script-src 'self'`).

| File / Directory | Role & Responsibilities |
|---|---|
| [`index.html`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/index.html) | Semantic HTML shell, CSP meta tag, external stylesheet link, and ordered `<script defer>` tags (`0` inline `on*=` handlers). |
| [`styles.css`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/styles.css) | Complete *White Edition & Liquid Glass* stylesheet, responsive layout, and full-screen mobile transaction modal (`100dvh`). |
| [`js/`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/js) | Domain modules in `'use strict'`: `theme-init.js`, `core.js` (`APP_VERSION`, `APP_PUBLISHED_AT`), `accounting.js`, `recurring.js`, `sync.js`, `investments.js`, `charts.js`, `export.js`, `ui.js`, and `bootstrap.js`. |
| [`PROJECT_CONTEXT.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/PROJECT_CONTEXT.md) | **Living technical and operational document.** Contains architectural logs, current version history, discarded decisions (§12), and detailed functional specs. |
| [`DESIGN_SYSTEM.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/DESIGN_SYSTEM.md) | Canonical visual standard: *White Edition & Liquid Glass*, zero emojis, squircle tokens, typography, and responsive ergonomics. |
| [`serviceworker.js`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/serviceworker.js) | Offline caching strategy (`CACHE_NAME`). Network-first navigation with `cache: 'reload'` precaching. |
| [`manifest.json`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/manifest.json) | PWA installation parameters, theme color, icons. |
| [`supabase-js.min.js`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/supabase-js.min.js) | Local vendor bundle for Supabase JavaScript client. |
| [`scripts/`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/scripts/) | Validation suites (`validate-syntax.js`, `_load_app.js`), mathematical audits (`audit-finance-core.js`), backend tests. |
| [`supabase/`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/supabase/) | SQL migrations, PostgreSQL schema, RLS policies, and Edge Functions. |

---

## 3. Mandatory Protocol for Every Chat & Task

Whenever working on fintrack, you must follow this sequence:

1. **Read & Cross-Reference Context:**
   - Inspect [`PROJECT_CONTEXT.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/PROJECT_CONTEXT.md) to verify current versioning, known issues, discarded decisions (§12), and recent changes.
   - Inspect [`DESIGN_SYSTEM.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/DESIGN_SYSTEM.md) before altering any visual element.
2. **Never Break Modular Integrity:**
   - All modules in `js/` run in `'use strict'` and share top-level scope in load order. Always validate syntax and static bindings with `node scripts/validate-syntax.js`.
3. **Respect Hard Rules:**
   - **CERO EMOJIS:** Absolute ban on emojis across the entire app. Use monochromatic inline SVGs (`stroke="currentColor"`).
   - **Brand casing:** Always write `fintrack` in all-lowercase (never `FinTrack`).
   - **Privacy modes:** Balance (`isPrivacyMode()`) and Inversión (`portfolioValueHidden()`) have separate states; when Inversión is hidden, investment accounts are excluded from `Patrimonio total` in Cuentas.
   - **No user tags UI:** User-facing transaction tags are removed; only internal system tags (`_no_calc`, `_no_expense`, `invest_*`) exist.
4. **Post-Change Release Protocol:**
   - Any modification requires bumping `APP_VERSION` and `APP_PUBLISHED_AT` in `js/core.js`, bumping `CACHE_NAME` in `serviceworker.js`, running tests, and updating `PROJECT_CONTEXT.md`.
