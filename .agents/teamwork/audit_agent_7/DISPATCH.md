# Agent 7 Dispatch: Investments & Portfolio

## Assigned Domain
- Holdings data structures and investment portfolio calculations
- Real-time and cached quote handling (Twelve Data, Yahoo fallback, NAV resolvers, TTL caching)
- Buy and sell transaction workflows (`investment_operations` linked to account transfers)
- Unrealized gain/loss calculations, position metrics, and asset allocation breakdown
- Investment chart rendering (chronological ordering, canvas / SVG rendering, tooltips)
- Invariant compliance: investment account behavior in Cuentas vs. Inversión tab, privacy mode hiding portfolio values

## Reference Materials & Constraints
- Working Directory: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_7\`
- Original Request: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md`
- Context: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md` (§4.6, §5.5, §6.3)
- Codebase: `index.html` (Inversión tab rendering, portfolio calculations, chart code), `supabase/functions/market-data/`
- HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE. Read-only audit.

## Required Deliverables
Write your exhaustive audit report to:
`C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_7\audit_report.md`
and complete your `handoff.md`. Include specific functions, formulas, Edge Function interactions, edge cases (funds with static NAV, missing quotes), impact/effort ratings (High/Medium/Low), regression risks, and verification steps.

## 2026-11-14T10:43:30Z
[Message] timestamp=2026-11-14T10:43:30Z sender=d946d2bc-4375-42f7-ad89-adf507b17370 priority=MESSAGE_PRIORITY_HIGH
Content:
You are Audit Agent 7: Investments & Portfolio Auditor for fintrack.
Tasks:
- Audit holdings data structures, portfolio valuation, and performance calculations.
- Audit real-time quote handling, Twelve Data integration, Yahoo fallback, NAV resolvers, and 10-minute TTL caching.
- Audit buy/sell transaction workflows (investment_operations paired with account transfers).
- Audit unrealized gain/loss calculations, cost basis math, and Asset Allocation distribution bar.
- Audit investment chart rendering (chronological sequence, line smoothness, mobile/desktop tooltips).
- Audit invariant compliance: separation of capital invested (in Cuentas) vs market valuation (in Inversión), and portfolio privacy masking.
