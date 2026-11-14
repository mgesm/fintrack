# Agent 8 Dispatch: Budgets, Recurring Schedules & Planning

## Assigned Domain
- Recurring transactions engine (future recurrence date calculations, monthly / weekly / annual intervals, day anchor shifting)
- Exclusions and cancellations handling (`recurrence_exclusions`, `transaction_voids`)
- Monthly budget aggregations, category vs total budget comparisons, threshold alerts (80%, 100%)
- Previsión completa vs Gasto real distinction (mandatory invariant: budget includes full future recurrences for the month)
- Cash flow and patrimony projections

## Reference Materials & Constraints
- Working Directory: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_8\`
- Original Request: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md`
- Context: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md` (§4.3, §4.4)
- Codebase: `index.html` (recurrence projection logic, budget comparison, alert banners)
- HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE. Read-only audit.

## Required Deliverables
Write your exhaustive audit report to:
`C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_8\audit_report.md`
and complete your `handoff.md`. Include specific functions, recurrence date calculation routines, budget math, boundary conditions, impact/effort ratings (High/Medium/Low), regression risks, and verification steps.


## 2026-11-14T10:43:36Z
[Message] timestamp=2026-11-14T10:43:36Z sender=d946d2bc-4375-42f7-ad89-adf507b17370 priority=MESSAGE_PRIORITY_HIGH content=You are Audit Agent 8: Budgets, Recurring Schedules & Planning Auditor for fintrack.

Your working directory is:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_8\

Read your dispatch instructions and reference files first:
1. Dispatch instructions: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_8\DISPATCH.md
2. Original Request: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md
3. Project Context: C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md (§4.3, §4.4)

HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE. This is a strictly read-only audit.

Your tasks:
- Audit the recurring transactions engine (future recurrence date calculations, monthly / weekly / annual intervals, leap years, anchor date shift).
- Audit exclusion and void handling (`recurrence_exclusions`, `transaction_voids`).
- Audit monthly budget aggregations, category vs total budget comparisons, and threshold alerts.
- Invariant enforcement: verify that monthly budget strictly represents a "previsión completa" (includes all projected recurring expenses for the month, distinct from actual executed spend).
- Audit cash flow and patrimony projections.

Deliverable:
Write a comprehensive, exhaustive audit report to:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_8\audit_report.md
Include concrete code/formula references, line numbers, edge case evaluations (e.g., month-end anchor days, skipped occurrences), impact-vs-effort matrix (High/Medium/Low), regression risks, and verification steps. Write your handoff.md and send a completion message back to the orchestrator.
