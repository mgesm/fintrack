# Audit Report: Accounting Engine & Financial Math Auditor (Agent 1)

> **Auditor:** Audit Agent 1 — Accounting Engine & Financial Math  
> **Target Repository:** `fintrack` (`mgesm/fintrack`)  
> **Scope:** `index.html`, `supabase/migrations/`, `scripts/`, `PROJECT_CONTEXT.md`, `fintrack-accounting-auditor`  
> **Date:** 2026-11-14  
> **Audit Status:** Complete — Read-Only Investigation  

---

## 1. Executive Summary

A comprehensive, read-only architectural audit of **fintrack's Accounting Engine & Financial Math** was conducted across its core subsystems: transaction classification and lifecycle, tri-state accounting (`computa_todo`), real vs. theoretical balance reconciliation (*Desfase*), internal transfers, balance adjustment snapshot mechanics, and floating-point precision (IEEE-754) arithmetic.

### Key Architectural Findings:
1. **Strengths:**
   - **Sound Transfer Separation:** The separation of internal transfers from income and expenses is rigorously implemented in both `txExpenseImpact(t)` and `txIncomeImpact(t)`, guaranteeing zero leakage into monthly or annual P&L summaries.
   - **Non-Polluting Balance Adjustments:** The reconciliation mechanism correctly excludes balance adjustment transactions (`is_balance_adjustment = true`) from the theoretical balance calculation (`accountTxDelta` returns 0). This prevents circular feedback loops and preserves the historical discrepancy (*Desfase*).
   - **Snapshots as Baselines:** Successive patrimony adjustments cleanly serve as new baselines (`reset.amount`), preventing the propagation of past reconciliation errors into subsequent periods.

2. **Critical Vulnerabilities & Bugs Identified:**
   - **CRITICAL BUG (Tri-State Account Balance Leakage):** While `isTxExcludedFromBalance(t)` is correctly defined (returning `true` for Mode 2 / `_no_calc`), it is **never invoked** inside `accountTxDelta(t, accountId)` (`index.html:5475-5486`) or `accountTouchesAccount(t, accountId)` (`index.html:5487`). Informational notes and pending checks (`computa_todo = 2`) are erroneously deducted/added to account balances and net worth calculations.
   - **HIGH RISK (Input Parsing & Arithmetic Truncation):** `parseCurrencyInput` (`index.html:2930-2953`) utilizes `parseFloat(s)` without an arithmetic expression parser. If a user enters expressions like `15+5` or `30*1.21`, the input is silently truncated to the first operand (`15` or `30`), losing money without warning. Additionally, European thousands separators with single dots (e.g. `1.250` for 1,250 €) are parsed as `1.25 €` (a 1,000x under-recording).
   - **HIGH RISK (IEEE-754 Precision Drift & Ineffective `Number.EPSILON`):** `roundMoney(n)` uses `Math.round((n + Number.EPSILON) * 100) / 100`. Because `Number.EPSILON` (~`2.22e-16`) is unscaled, it fails to correct representation errors in numbers greater than 1 (e.g. `roundMoney(35.855)` produces `35.85` instead of `35.86`). In addition, raw `Math.round(x * 100) / 100` is used haphazardly across 15+ locations instead of a single financial rounding helper.
   - **HIGH RISK (Non-Atomic Balance Adjustment Persistence):** In `applyBalanceAdjustment` (`index.html:5614-5628`), the client performs two independent queries (`sb.from('patrimony').insert(...)` and `sb.from('transactions').insert(...)`) despite the existence of the atomic RPC `save_fintrack_balance_adjustment` created in migration `20260727090000_balance_adjustment_transactions.sql`. Network interruptions during the window between inserts create orphan patrimony snapshots.
   - **MEDIUM RISK (Same-Day Post-Adjustment Transaction Blind Spot):** Because transactions lack time components and `accountCalcBalance` uses `t.date > baseDate`, transactions added on the same date as a balance adjustment *after* the adjustment was logged are completely omitted from the live balance.
   - **MEDIUM RISK (Annual Mode Category Exclusion Mismatch):** In `renderCatTab` (`index.html:5129-5137`), `isCategoryExcludedFromExpense(cid, curYm)` evaluates against `viewMonth` even when `homeAnnualMode` is active, causing denominator/numerator skew against `txExpenseImpact(t)` which evaluates each transaction at its own date.

---

## 2. Detailed Technical Domain Analysis

### 2.1 Transaction Classification & Ingestion Engine (`saveTx`, `editTx`, `deleteTx`, `restoreTx`)

The ingestion engine is centered on `saveTx()` (`index.html:7195-7287`). It branches into two main flows:
1. **Transfers (`txType === 'transfer'`):**
   - Validates that `fromAcc !== toAcc` and that both accounts exist in memory (`index.html:7206-7208`).
   - Generates `payload` with `type: 'transfer'`, `category: 'transfer'`, `subcategory: null`, `account_id: fromAcc`, `to_account_id: toAcc`, `exclude_from_calc: false`.
2. **Income & Expense (`txType === 'income' | 'expense'`):**
   - Parses amount via `parseCurrencyInput(document.getElementById('txAmount').value)`.
   - Resolves category, subcategory, recurrence parameters, and account assignment.
   - Resolves tri-state calculation tags (`_no_expense`, `_no_calc`) and sets `exclude_from_calc: (txCalcMode === 2)`.

#### Transaction Editing & Recurrence Synchronization
- In `editTx(id)` (`index.html:7032-7060`), editing a balance adjustment is correctly blocked (`tx.is_balance_adjustment` displays toast redirecting to Cuentas).
- Private investment operations are guarded against accidental edits during Privacy Mode (`index.html:7036-7039`).
- However, when updating an expense to a transfer or changing accounts in `saveTx()`, cache invalidation is triggered (`txVersion++; invalidateTxIndices(); clearBalanceCache();`), but past balance adjustment differences are not dynamically reconciled (see §2.4).

#### Transaction Deletion & Voids
- `deleteTx(id, undoExclusion)` (`index.html:7398-7419`) registers an entry in `transaction_voids` with the full snapshot of `transaction_data` and removes the transaction from memory and Supabase.
- This design satisfies the core requirement in `PROJECT_CONTEXT.md` §4.2: deleted occurrences of recurring series do not re-spawn upon recalculation.

---

### 2.2 Tri-State Accounting (`computa_todo`) & Mathematical Rigor

FinTrack's accounting rules mandate three distinct computation modes:

| Mode Value | UI Label | Account Balance Impact | Global P&L / Expense Impact | Use Case |
|---|---|---|---|---|
| **`0`** | *Computar todo* | **Yes** ($\Delta \text{Balance} = \pm \text{Amount}$) | **Yes** ($\Delta \text{P\&L} = \pm \text{Amount}$) | Standard expenses/incomes (salary, food, bills). |
| **`1`** | *Solo balance* | **Yes** ($\Delta \text{Balance} = \pm \text{Amount}$) | **No** ($\Delta \text{P\&L} = 0$) | Internal capital transfers, loans, non-P&L cash movements. |
| **`2`** | *No computa* | **No** ($\Delta \text{Balance} = 0$) | **No** ($\Delta \text{P\&L} = 0$) | Informational annotations, tracked estimates, pending checks. |

#### Implementation Review in `index.html`:
```javascript
// index.html:2893-2902
function getTxCalcMode(t){
  if(!t)return 0;
  if(Array.isArray(t.tags)){
    if(t.tags.includes('_no_calc'))return 2;
    if(t.tags.includes('_no_expense'))return 1;
  }
  if(t.exclude_from_calc===2||t.exclude_from_calc==='2'||t.exclude_from_calc==='all'||t.exclude_from_calc===true)return 2;
  if(t.exclude_from_calc===1||t.exclude_from_calc==='1'||t.exclude_from_calc==='expense'||t.exclude_from_calc==='balance')return 1;
  return 0;
}
```

- In `calcPeriodTotals(txs)` (`index.html:2954-2979`):
  - Mode 0 correctly increments both `exp` and `balExp`.
  - Mode 1 correctly increments `uncompExp` and `balExp` (leaving `exp` untouched).
  - Mode 2 increments `exclExp` only (leaving both `exp` and `balExp` untouched).
- In `txExpenseImpact(t)` (`index.html:2993-2999`):
  - Evaluates `isTxExcludedFromExpense(t)` which returns `true` for Mode 1 and Mode 2. Correctly returns 0.
- In `txBalanceExpenseImpact(t)` (`index.html:3000-3006`):
  - Evaluates `isTxExcludedFromBalance(t)` which returns `true` for Mode 2. Correctly returns 0.

#### The Tri-State Balance Failure:
```javascript
// index.html:5475-5486
function accountTxDelta(t, accountId){
  if(t.is_balance_adjustment)return 0;
  if(t.type==='transfer'){
    var d=0;
    if(t.account_id===accountId)d-=Number(t.amount);
    if(t.to_account_id===accountId)d+=Number(t.amount);
    return d;
  }
  if(!(t.account_id===accountId||(!t.account_id&&accounts.length===1)))return 0;
  return t.type==='expense'?-Number(t.amount):Number(t.amount);
}
```
**CRITICAL DEFECT:**
`accountTxDelta` does **NOT** check `isTxExcludedFromBalance(t)`.
When a transaction is assigned `exclude_from_calc: 2` (or tag `_no_calc`), `accountTxDelta` evaluates:
$$\text{accountTxDelta} = -500.00 \neq 0$$
This corrupts:
1. `accountCalcBalance(accountId, yr, mo)` (`index.html:5535`)
2. `accountCalcBalanceAsOf(accountId, dateStr)` (`index.html:5545`)
3. `accountCalcTheoreticalAsOf(accountId, dateStr)` (`index.html:5555`)
4. `totalPat` (Total Net Worth in Cuentas tab) (`index.html:5370`)

---

### 2.3 Internal Transfers (`type === 'transfer'`) vs. Expense/Income Separation

FinTrack enforces the golden accounting rule that moving money between internal accounts must never alter the profit/loss statement.

#### Verification in Code:
1. **P&L Impact:**
   - `txExpenseImpact(t)`: `if(t.type!=='expense') return 0;` $\implies \text{Impact} = 0$.
   - `txIncomeImpact(t)`: `if(t.type!=='income') return 0;` $\implies \text{Impact} = 0$.
   - `calcPeriodTotals`: Only iterates over `t.type === 'expense'` and `t.type === 'income'`. Transfers are ignored.
2. **Account Balances:**
   - In `accountTxDelta(t, accountId)`:
     ```javascript
     if(t.type==='transfer'){
       var d=0;
       if(t.account_id===accountId)d-=Number(t.amount);
       if(t.to_account_id===accountId)d+=Number(t.amount);
       return d;
     }
     ```
     - For origin account: $\Delta = -\text{amount}$.
     - For destination account: $\Delta = +\text{amount}$.
     - Net sum: $\Delta_{\text{origin}} + \Delta_{\text{destination}} = 0$.
3. **Indexation:**
   - In `ensureTxIndices()` (`index.html:68-76`), transfer transactions are pushed to **both** `_txByAccount[a1]` and `_txByAccount[a2]`. This guarantees $O(1)$ lookups without scanning the entire transaction table.
4. **Account Deletion Guard:**
   - In `deleteAccount(id)` (`index.html:5974-5976`):
     ```javascript
     var inUse=transactions.some(function(t){return t.account_id===id||t.to_account_id===id;});
     if(inUse){ alert('No se puede eliminar: hay transacciones asociadas...'); return; }
     ```
     Guarantees that deleting an account cannot leave half of a transfer orphaned.

---

### 2.4 Real vs. Theoretical Balance Reconciliation & Desfase Engine

FinTrack calculates account balances using a hybrid baseline-plus-delta model:
$$\text{Saldo Teórico}(t) = \text{Saldo Base}_{\text{reset}} + \sum_{i \in \text{txs}(t_{\text{reset}} < t_i \le t)} \text{accountTxDelta}(t_i)$$
$$\text{Desfase} = \text{Saldo Real} - \text{Saldo Teórico}$$

```
                ┌────────────────────────────────────────────────────────┐
                │             Physical Bank Account Checked              │
                │                 Saldo Real = 1,250.00 €                │
                └───────────────────────────┬────────────────────────────┘
                                            │
                                            ▼
┌───────────────────────────┐      Reconciliation      ┌───────────────────────────┐
│     Historical Ledger     │─────────────────────────▶│    Desfase (Discrepancy)  │
│ Saldo Teórico = 1,200.00 €│                          │     Diff = +50.00 €       │
└───────────────────────────┘                          └─────────────┬─────────────┘
                                                                     │
                         ┌───────────────────────────────────────────┴───────────────────────────┐
                         ▼                                                                       ▼
      ┌─────────────────────────────────────┐                                 ┌─────────────────────────────────────┐
      │          Patrimony Snapshot         │                                 │      Adjustment Transaction         │
      │   amount = 1,250.00 €               │                                 │   type: 'income', amount: 50.00 €   │
      │   theoretical_amount = 1,200.00 €   │                                 │   is_balance_adjustment: true       │
      │   reset_date: '2026-11-14'          │                                 │   balance_adjustment_patrimony_id   │
      └─────────────────────────────────────┘                                 └─────────────────────────────────────┘
                         │                                                                       │
                         │                                                                       ▼
                         │                                                    ┌─────────────────────────────────────┐
                         │                                                    │   accountTxDelta returns 0          │
                         │                                                    │   (Does NOT pollute Saldo Teórico)  │
                         │                                                    └─────────────────────────────────────┘
                         ▼
      ┌─────────────────────────────────────┐
      │   Future Periods Baseline           │
      │   Next base = 1,250.00 €            │
      └─────────────────────────────────────┘
```

#### Code Inspection (`index.html:5595-5606`):
```javascript
var theoretical = accountCalcTheoreticalAsOf(accountId, date);
var diff = Math.round((real - theoretical) * 100) / 100;
var item = {
  id: 'p' + accountId + Date.now() + Math.random().toString(36).slice(2, 6),
  account_id: accountId,
  year: yr, month: mo,
  amount: real,
  theoretical_amount: theoretical,
  reset_date: date,
  user_id: currentUser.id
};
var adjustment = null;
if(Math.abs(diff) > 0.005){
  var adjustmentType = diff < 0 ? 'expense' : 'income';
  adjustment = {
    id: 'txbal_' + item.id,
    type: adjustmentType,
    amount: Math.round(Math.abs(diff) * 100) / 100,
    category: balanceAdjustmentCategorySpec(adjustmentType).id,
    subcategory: null,
    note: 'Actualización de saldo',
    date: date,
    is_balance_adjustment: true,
    balance_adjustment_patrimony_id: item.id,
    user_id: currentUser.id
  };
}
```

#### Mathematical Integrity of Desfase:
1. When $\text{diff} < 0$ ($\text{Real} < \text{Teórico}$, cash deficit):
   $\text{adjustmentType} = \text{'expense'}$, $\text{amount} = |\text{diff}|$.
2. When $\text{diff} > 0$ ($\text{Real} > \text{Teórico}$, cash surplus):
   $\text{adjustmentType} = \text{'income'}$, $\text{amount} = \text{diff}$.
3. In `accountTxDelta(t, accountId)`:
   `if(t.is_balance_adjustment) return 0;`
   Because `accountTxDelta` returns 0 for adjustment transactions, the adjustment transaction **never alters the theoretical balance calculation**.
4. In `accountCalcBalance(accountId, yr, mo)` (`index.html:5537-5542`):
   When querying a period after `date`, `accountLatestReset` selects `item` as the new baseline ($1,250.00\text{ \euro}$). Thus, the historical discrepancy is not dragged into subsequent months.

---

### 2.5 Balance Adjustment Snapshots & Non-Atomic Persistence

In `applyBalanceAdjustment` (`index.html:5614-5628`), the application executes:
```javascript
var savedReal = await withLoadTimeout(sb.from('patrimony').insert(item).select(), 8000, ...);
...
if (adjustment) {
  var savedAdjustment = await withLoadTimeout(sb.from('transactions').insert(adjustment).select(), 8000, ...);
}
```

#### Flaw Analysis:
- In migration `20260727090000_balance_adjustment_transactions.sql:11-30`, the backend provides:
  `public.save_fintrack_balance_adjustment(snapshot jsonb, adjustment jsonb)`
  which wraps both table insertions within a single ACID transaction.
- The frontend code bypassed this RPC and executed two independent sequential HTTP requests.
- If the first insert succeeds and the network fails or the user closes the PWA before the second insert finishes, `patrimony` contains a snapshot with no corresponding adjustment transaction in `transactions`.
- While `repair_fintrack_balance_adjustments()` (`index.html:3899`) attempts reconciliation upon startup, this is a reactive patch over an avoidable client-side concurrency defect.

---

### 2.6 Floating-Point Arithmetic, Accumulator Drift & Rounding Precision (IEEE-754)

JavaScript utilizes IEEE-754 double-precision 64-bit floating point numbers.
In binary floating point:
$$0.1_{10} = 0.0001100110011..._2 \implies 0.1 + 0.2 = 0.3000000000000000444...$$
$$35.855 \times 100 = 3585.499999999999545...$$

#### Current Implementation in `index.html`:
```javascript
// index.html:2925-2929
function roundMoney(n){
  n=Number(n);
  if(!Number.isFinite(n))return 0;
  return Math.round((n+Number.EPSILON)*100)/100;
}
```

#### Mathematical Failure of `n + Number.EPSILON`:
- `Number.EPSILON` is $2^{-52} \approx 2.220446049250313 \times 10^{-16}$.
- It is the difference between 1 and the next representable double.
- When $n = 35.855$, the representation error is:
  $$\Delta = 3585.5 - 3585.4999999999995 = 5.0 \times 10^{-13}$$
- Adding $2.22 \times 10^{-16}$ to $35.855$ yields $35.855000000000004$.
- Multiplying by 100 still yields $3585.4999999999995$.
- `Math.round(3585.4999999999995)` truncates down to `3585`, returning `35.85` instead of the mathematically correct `35.86`!
- **Empirical Test:**
  `roundMoney(35.855)` produces `35.85` in node.js / V8.

#### Proper Financial Rounding Algorithm:
Using exponential notation prevents binary floating-point representation artifacts during scale conversion:
```javascript
function roundMoney(val) {
  var n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Number(Math.round(Number(n + 'e+2')) + 'e-2');
}
```
**Verification:**
`roundMoney(35.855)` $\implies$ `Number(Math.round('3585.5') + 'e-2')` $\implies 35.86$.

---

## 3. Catalog of Identified Defects & Edge Cases

### Defect 1: Tri-State Mode 2 Transaction Leakage into Account Balances
- **Location:** `index.html:5475-5487` (`accountTxDelta`, `accountTouchesAccount`)
- **Severity:** High / Critical Accounting Violation
- **Description:** Transactions flagged with `computa_todo = 2` (`exclude_from_calc: 2` or tag `_no_calc`) are intended as purely informational annotations (e.g. pending estimates) and must have 0 impact on account balances and net worth. Currently, `accountTxDelta` does not filter them out, directly debiting/crediting bank balances.
- **Evidence:** Running test script `test_computa_todo_bug.js` proved that a 500 € informational note reduced the account balance from 1,000 € to 500 €.

### Defect 2: Arithmetic Expression Silently Truncated in Amount Input
- **Location:** `index.html:2951`, `index.html:7197`
- **Severity:** High (User Data Corruption)
- **Description:** Users entering math expressions in the amount input (e.g., adding receipts: `15.50+4.50`) have their input passed to `parseFloat(s)`, which silently parses `15.50` and discards `+4.50`. The transaction saves as 15.50 € instead of 20.00 €, creating an immediate accounting discrepancy without error feedback.

### Defect 3: European Thousands Dot Notation Under-Recording
- **Location:** `index.html:2945-2950`
- **Severity:** High (Severe Discrepancy)
- **Description:** In Spain, numbers are frequently written with a dot for thousands and comma for decimals (`1.250,00`). If a user inputs `1.250` without decimals, `lastComma === -1`, `lastDot === 1`, and `parts.length === 2`. The function treats `.250` as decimals, resulting in `1.25 €` instead of `1,250.00 €`.

### Defect 4: Client-Side Non-Atomic Dual Mutation on Balance Adjustments
- **Location:** `index.html:5614-5628`
- **Severity:** High (Integrity & Data Desynchronization)
- **Description:** `applyBalanceAdjustment` executes two separate asynchronous calls instead of calling `sb.rpc('save_fintrack_balance_adjustment')`. A network error between calls leaves orphan patrimony snapshots and corrupts subsequent theoretical balance calculations.

### Defect 5: Same-Day Post-Adjustment Transaction Temporal Blind Spot
- **Location:** `index.html:5542`, `index.html:5449`
- **Severity:** Medium (Reporting Discrepancy)
- **Description:** `accountCalcBalance` filters live transactions with `t.date > baseDate`. When a user adjusts their account on date $D$ and subsequently enters a transaction also dated $D$, the condition $D > D$ evaluates to `false`. The transaction is omitted from the live balance until a new adjustment is performed.

### Defect 6: Annual Mode Category Exclusion Scope Mismatch
- **Location:** `index.html:5129-5137`
- **Severity:** Medium (Visual/Calculation Distortion)
- **Description:** In `renderCatTab`, `curYm` is derived from `viewYear` and `viewMonth`. When `homeAnnualMode` is active, the numerator sums 12 months of transactions, but the denominator in line 5137 filters `bycat[cid]` based on whether the category is excluded in the single currently selected month `viewMonth`. This skews percentage distribution bars.

### Defect 7: Unvalidated Subcategory on Category Reassignment in `saveTx`
- **Location:** `index.html:7213`
- **Severity:** Low/Medium (Relational Integrity)
- **Description:** `saveTx` reads `txSubcat` directly from DOM without asserting that `subcategory` is an element of `cat.subcats`. If categories are switched via keyboard or scripted calls, orphan subcategories persist in the database.

### Defect 8: Dead Code Stub `accountVoidDelta`
- **Location:** `index.html:5488-5492`
- **Severity:** Low (Codebase Cleanliness)
- **Description:** `accountVoidDelta` is a 4-line function returning `0` that is never called by any function in `index.html`.

---

## 4. Impact vs. Effort Prioritization Matrix

| ID | Issue Description | Impact | Effort | Priority | Implementation Phase |
|---|---|---|---|---|---|
| **AC-01** | Enforce `isTxExcludedFromBalance(t)` in `accountTxDelta` & `accountTouchesAccount` | **High** | **Low** | P0 (Critical) | Phase 1: Core Integrity |
| **AC-02** | Implement exponential notation `roundMoney` and eliminate ad-hoc `Math.round` | **High** | **Low** | P0 (Critical) | Phase 1: Core Integrity |
| **AC-03** | Use atomic RPC `save_fintrack_balance_adjustment` in `applyBalanceAdjustment` | **High** | **Low** | P1 (High) | Phase 1: Core Integrity |
| **AC-04** | Integrate arithmetic expression evaluator (`evaluateExpression`) in currency parsing | **High** | **Medium** | P1 (High) | Phase 2: Input Hardening |
| **AC-05** | Harden Spanish thousands separator detection in `parseCurrencyInput` | **Medium** | **Low** | P2 (Medium) | Phase 2: Input Hardening |
| **AC-06** | Align Annual Mode category exclusion filter across full year range | **Medium** | **Low** | P2 (Medium) | Phase 3: Reporting Alignment |
| **AC-07** | Guard same-day post-adjustment transactions with timestamp/sequence disambiguation | **Medium** | **Medium** | P2 (Medium) | Phase 3: Reporting Alignment |
| **AC-08** | Validate subcategory belonging to selected category in `saveTx` | **Low** | **Low** | P3 (Low) | Phase 4: Polish & Cleanliness |
| **AC-09** | Remove or document dead stub `accountVoidDelta` | **Low** | **Low** | P3 (Low) | Phase 4: Polish & Cleanliness |

---

## 5. Architectural Recommendations & Concrete Proposals

### Proposal 1 (AC-01): Fix Tri-State Accounting in `accountTxDelta`
In `index.html:5475-5487`:
```javascript
// BEFORE
function accountTxDelta(t,accountId){
  if(t.is_balance_adjustment)return 0;
  if(t.type==='transfer'){ ... }
  if(!(t.account_id===accountId||(!t.account_id&&accounts.length===1)))return 0;
  return t.type==='expense'?-Number(t.amount):Number(t.amount);
}
function accountTouchesAccount(t,accountId){
  return !t.is_balance_adjustment&&(t.account_id===accountId||t.to_account_id===accountId||(!t.account_id&&t.type!=='transfer'&&accounts.length===1));
}

// AFTER
function accountTxDelta(t,accountId){
  if(t.is_balance_adjustment)return 0;
  if(isTxExcludedFromBalance(t))return 0; // Mode 2: No computa en saldo
  if(t.type==='transfer'){
    var d=0;
    if(t.account_id===accountId)d-=Number(t.amount);
    if(t.to_account_id===accountId)d+=Number(t.amount);
    return d;
  }
  if(!(t.account_id===accountId||(!t.account_id&&accounts.length===1)))return 0;
  return t.type==='expense'?-Number(t.amount):Number(t.amount);
}
function accountTouchesAccount(t,accountId){
  return !t.is_balance_adjustment && !isTxExcludedFromBalance(t) && (
    t.account_id===accountId ||
    t.to_account_id===accountId ||
    (!t.account_id && t.type!=='transfer' && accounts.length===1)
  );
}
```

### Proposal 2 (AC-02): Standardize on Exponential `roundMoney`
In `index.html:2925-2929`:
```javascript
// BEFORE
function roundMoney(n){
  n=Number(n);
  if(!Number.isFinite(n))return 0;
  return Math.round((n+Number.EPSILON)*100)/100;
}

// AFTER
function roundMoney(val){
  var n=Number(val);
  if(!Number.isFinite(n))return 0;
  return Number(Math.round(Number(n+'e+2'))+'e-2');
}
```
Replace raw calls like `Math.round(x*100)/100` in lines 5451, 5543, 5553, 5596, 5605, 5726 with `roundMoney(x)`.

### Proposal 3 (AC-03): Atomic Balance Adjustment Persistence
In `index.html:5612-5631`:
```javascript
// BEFORE
var savedReal=await withLoadTimeout(sb.from('patrimony').insert(item).select(),8000,...);
...
var savedAdjustment=await withLoadTimeout(sb.from('transactions').insert(adjustment).select(),8000,...);

// AFTER
var r;
try {
  var res = await withLoadTimeout(
    sb.rpc('save_fintrack_balance_adjustment', { snapshot: item, adjustment: adjustment }),
    8000,
    'Tiempo de espera al guardar el ajuste de saldo'
  );
  if(res.error) throw new Error(res.error.message);
  r = res.data;
} catch(saveError) {
  // Local fallback queue handles offline resilience
  ...
}
```

### Proposal 4 (AC-04 & AC-05): Safe Arithmetic Parser in `parseCurrencyInput`
Integrate the tested Shunting-Yard evaluator from `scripts/test-math-eval.js` into `parseCurrencyInput`:
```javascript
function parseCurrencyInput(val){
  if(val==null)return NaN;
  if(typeof val==='number')return Number.isFinite(val)?roundMoney(val):NaN;
  var s=String(val).trim().replace(/[\s\u00A0€$£]/g,'');
  if(!s)return NaN;
  
  // Detect Spanish thousands dot notation (e.g. 1.250 or 1.250.000 without comma)
  if(/^\d{1,3}(\.\d{3})+$/.test(s)){
    s=s.replace(/\./g,'');
  }
  
  // If input contains arithmetic operators (+, -, *, /), evaluate safely
  if(/[\+\-\*\/]/.test(s)){
    var computed = evaluateExpression(s);
    return computed !== null ? roundMoney(computed) : NaN;
  }
  
  // Standard comma-to-dot normalization
  var lastComma=s.lastIndexOf(','), lastDot=s.lastIndexOf('.');
  if(lastComma>-1 && lastDot>-1){
    if(lastComma>lastDot) s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(lastComma>-1){
    s=s.replace(/,/g,'.');
  }
  var n=parseFloat(s);
  return Number.isFinite(n)?roundMoney(n):NaN;
}
```

---

## 6. Regression Risk Assessment & Invalidation Conditions

1. **Regression Risk on Historical Balances (AC-01):**
   - *Risk:* Existing users who have transactions with `_no_calc` might see their current account balance shift if they previously relied on the broken behavior.
   - *Mitigation:* Documented in release notes. This restores compliance with the stated specification and data contract.
2. **Regression Risk on Offline Sync (AC-03):**
   - *Risk:* If `save_fintrack_balance_adjustment` fails in offline mode, fallback must continue queuing separate table inserts in `offlineQueue`.
   - *Mitigation:* The fallback offline path in lines 5607-5611 already pushes to `offlineQueue` as independent table inserts, ensuring 100% backward compatibility with offline queues.
3. **Floating Point Rounding Invalidation (AC-02):**
   - *Risk:* Negligible. Transitioning to exponential notation affects only the half-cent rounding boundaries where representation noise caused false truncations (e.g. 35.855).

---

## 7. Verification Procedures

To independently verify all findings and test proposals:

1. **Verify Test Scripts Status:**
   ```powershell
   # Run in fintrack root with node:
   node scripts/audit-agent1-tx-core.js
   node scripts/audit-finance-core.js
   node scripts/test-math-eval.js
   node scripts/simulate-dashboard-stats.js
   ```
2. **Verify Tri-State Bug Reproduction:**
   ```powershell
   node .agents/teamwork/audit_agent_1/test_computa_todo_bug.js
   ```
   *Expected Output:* Shows that `accountTxDelta` returned `-500` instead of `0` for `computa_todo: 2`.
3. **Verify Precision Rounding Reproduction:**
   ```powershell
   node -e "function r(n){return Math.round((n+Number.EPSILON)*100)/100;} console.log(r(35.855));"
   ```
   *Observed:* `35.85` (Error: should be `35.86`).
4. **Verify Spanish Thousands & Math Truncation:**
   ```powershell
   node .agents/teamwork/audit_agent_1/test_parse_currency.js
   ```
   *Observed:* `1.250` parsed as `1.25` and `15+5` parsed as `15`.
5. **Verify Same-Day Adjustment Blind Spot:**
   ```powershell
   node .agents/teamwork/audit_agent_1/test_same_day_adjust.js
   ```
   *Observed:* Shows transactions created on the exact reset date are dropped from `accountCalcBalance`.
