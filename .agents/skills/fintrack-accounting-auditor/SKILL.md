---
name: fintrack-accounting-auditor
description: >-
  Audits financial formulas, accounting logic, and calculation engines in fintrack.
  Use whenever modifying transaction calculations, account balances, transfers, budgets,
  recurring schedules, patrimony aggregations, or rounding and precision routines.
---

# fintrack — Accounting Engine & Financial Integrity Auditor

This skill guarantees that financial math, transaction classification, and accounting integrity remain strictly uncorrupted in **fintrack**.

## 1. Fundamental Accounting Rules

### 1.1 Tri-State Accounting (`computa_todo`)
Every transaction in fintrack carries a computational flag:

| `computa_todo` Value | Bank Account Balance (`accountTxDelta`) | Monthly Balance KPI (`balInc`/`balExp`) | Global Income/Expense/Budget Stats | Use Case |
|---|---|---|---|---|
| **`0` (Computa todo)** | **Yes** (adds/subtracts) | **Yes** (adds/subtracts) | **Yes** (computes in P&L / charts / budgets) | Regular salary, groceries, bills, normal expenses. |
| **`1` (Solo balance)** | **Yes** (adds/subtracts) | **Yes** (adds/subtracts) | **No** (excluded from P&L & budgets) | Non-budgeted movements that should still reflect in monthly cashflow balance KPI. |
| **`2` (No computa)**   | **Yes** (adds/subtracts physical account money) | **No** (excluded via `isTxExcludedFromBalance`) | **No** (excluded from P&L & budgets) | Tracked outlays/reimbursements or off-KPI movements that still physically entered/left the bank account. |

> [!CAUTION]
> When computing monthly dashboard summaries, donut charts, budgets, or category breakdowns, filter out transactions where `computa_todo !== 0` (`isTxExcludedFromExpense`).
> When computing monthly dashboard Balance KPI (`balInc`/`balExp`), include transactions where `computa_todo === 0 || computa_todo === 1` (exclude `2` via `isTxExcludedFromBalance`).
> When computing physical bank account balances (`accountTxDelta`) and Patrimony Liquidity, ALL real non-adjustment movements (`0`, `1`, and `2`) credit/debit their assigned bank account so the bank ledger stays reconciled with real bank funds.

### 1.2 Internal Transfers (`is_transfer` / `traspaso`)
- A transfer moves money from `cuenta_origen` to `cuenta_destino`.
- **Golden Rule:** A transfer adjusts the balances of both involved accounts, but **MUST NEVER** count as a global income or a global expense in monthly or annual P&L summaries.
- A transfer must never be double-counted or registered as an external cash outflow.

### 1.3 Real vs. Theoretical Balance Reconciliation
- **Saldo Teórico:** The mathematical sum of all computed movements (`computa_todo IN (0, 1)`) assigned to that account from its inception or last balance cut.
- **Saldo Real:** The user's physical bank balance as verified on a specific date.
- **Desfase (Discrepancy):**
  $$\text{Desfase} = \text{Saldo Real} - \text{Saldo Teórico}$$
- Adjusting a balance must register an adjustment record or update the audited timestamp, clearly indicating whether the adjustment is an actual transaction or a benchmark checkpoint.

---

## 2. Floating-Point Precision (IEEE-754)

JavaScript represents all numbers as IEEE-754 double-precision floats. Operations like `0.1 + 0.2` yield `0.30000000000000004`.
To prevent accumulator drift:

1. Always round monetary amounts to 2 decimal places after compound operations:
   ```javascript
   function roundMoney(val) {
     return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
   }
   ```
2. When parsing user inputs from numeric keyboards, sanitize comma/dot separators:
   ```javascript
   function parseAmount(str) {
     if (typeof str === 'number') return str;
     const clean = String(str).replace(/\s/g, '').replace(',', '.');
     const num = parseFloat(clean);
     return isNaN(num) ? 0 : roundMoney(num);
   }
   ```
3. Never use raw `==` or `===` comparisons for floating-point balance equality; check with `Math.abs(a - b) < 0.005`.

---

## 3. Recurring Transactions & Void Overrides

- Recurring rules (daily, weekly, monthly, annual) generate virtual projections.
- When a user modifies or deletes a single occurrence of a recurring series:
  - Do **not** mutate the base recurring pattern.
  - Store a void or override entry (`recurrence_exceptions` or `anulaciones`) referencing the specific period/date.

---

## 4. Automated Testing Scripts

Run the dedicated finance auditing scripts to verify that your changes did not cause regressions:

```powershell
# In fintrack repository root:
node scripts/audit-finance-core.js
node scripts/test-math-eval.js
node scripts/simulate-dashboard-stats.js
```
