# BRIEFING — 2026-11-14T10:52:30Z

## Mission
Perform an exhaustive, read-only audit of fintrack's investments and portfolio subsystem, covering holdings data structures, portfolio valuation, quote handling/caching, Edge Function integrations, buy/sell workflows, unrealized gains/losses, asset allocation, chart rendering, and architectural invariants.

## 🔒 My Identity
- Archetype: explorer
- Roles: Investments & Portfolio Auditor (Agent 7)
- Working directory: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_7\
- Original parent: d946d2bc-4375-42f7-ad89-adf507b17370
- Milestone: Multi-Agent Audit across 10 Domains (R1 - Agent 7)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement / modify source code
- Zero build tools, zero bundlers, zero client-side frameworks
- Zero emojis across the entire UI (monochromatic inline SVGs only)
- Strict brand casing: always 'fintrack' in all-lowercase
- Privacy mode compliance: numeric amounts blurred, visual graphs/rings intact
- Core accounting tenets: Expense/Income vs. Transfers distinction, Desfase calculation, Tri-State accounting
- Investments invariant: separation of capital invested (in Cuentas) vs market valuation (in Inversión)

## Current Parent
- Conversation ID: d946d2bc-4375-42f7-ad89-adf507b17370
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `supabase/functions/market-data/index.ts`
  - `supabase/migrations/` (`20260901113000_investment_operations.sql`, `20260901123000_delete_investment_operations.sql`, `20260905140000_fix_replace_fintrack_data_investment_columns.sql`, `20260923140000_security_and_integrity_fixes.sql`, `20261026130000_investment_tags_and_safety.sql`)
  - `index.html` (lines 144, 184, 1885-2070, 2647-2663, 2925-2953, 3865-3915, 5013-5039, 5355-5420, 5493-5534, 5975, 6205-6225, 6310-6375, 6396-6702, 7036, 7209, 7398-7419, 8939-8956)
  - `scripts/test-investment-sim.js`
- **Key findings**:
  1. Non-atomic edit in `openInvestmentOperationEdit` (`index.html:6689`): calls delete RPC then record RPC, risking irreversible data loss. RPC `update_fintrack_investment_operation` exists in DB but is ignored.
  2. Capital Gains / Transfer Accounting Flaw: sells are recorded as transfers from investment account to cash account for total proceeds, resulting in negative balance in the investment account and zero recognized income for capital gains.
  3. Precision Truncation Bug (`index.html:2952, 6487, 6493`): `parseCurrencyInput` forces 2-decimal rounding on share units and fund NAVs (truncating 4-6 decimal places).
  4. Asset Allocation Misclassification Bug (`index.html:6593-6594`): Twelve Data's "Exchange Traded Fund" does not match "etf" and matches "fund", miscategorizing all ETFs as "Fondos".
  5. Privacy Leak in Trade Modal (`index.html:6487`): In "units" mode, total amount is printed via `fmt(total)` without masking even when `portfolioValueHidden()` is active.
  6. Safety Tag Eradication (`index.html:7036, 7209`): If portfolio privacy is off, `editTx` allows editing investment transfers and `saveTx` strips `tags: []`, removing protection against deletion and desynchronizing `investment_operations`.
  7. Typo in `deleteAccount` (`index.html:5975`): checks `op.account_id` instead of `op.investment_account_id`.
  8. Static NAV fallback disclosure missing (`market-data/index.ts:86`, `index.html:2652`): `is_backup_nav` and `nav_date` are ignored by frontend; backup NAV presented as live quote.
  9. In-memory only quote caching (`_quoteCache`) with 5-minute TTL, zero persistence to Storage/IndexedDB, exposing user to Twelve Data 8 call/min rate limit on 8+ holdings.
  10. Dead code `bindAssetGraph` (`index.html:6407-6414`) and two unbounded `MutationObserver` instances on `document.body`.
- **Unexplored areas**: None. Domain audit is complete.

## Key Decisions Made
- Proceed to write exhaustive `audit_report.md` with detailed code references, formulas, impact-effort matrix, and verification steps.
- Write self-contained 5-component `handoff.md` and notify orchestrator.

## Artifact Index
- audit_report.md — Comprehensive audit report for Agent 7
- handoff.md — Handoff report following the 5-component protocol
- progress.md — Liveness heartbeat and progress tracking
- DISPATCH.md — Agent dispatch log and prompt instructions
