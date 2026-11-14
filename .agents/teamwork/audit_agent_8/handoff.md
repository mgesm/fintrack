# Handoff Report: Audit Agent 8 (Budgets, Recurring Schedules & Planning)

**Agent:** Audit Agent 8  
**Domain:** Recurring transactions engine, exclusion/void mechanics, monthly budget aggregations, invariant enforcement ("previsión completa" vs "gasto real"), and cash flow / patrimony projections.  
**Working Directory:** `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_8\`  
**Target Report:** `audit_report.md`  

---

### 1. Observation
1. **Recurring Transactions Resurrecting on Edit:**
   - In `index.html:7254-7257`:
     ```javascript
     if(!payload.recurring){payload.recur_series_id=null;seriesFields.recur_series_id=null;}
     try{await syncRecurSeries(seriesIdForSync,editingTxId,payload.date,seriesFields);}catch(ex){}
     ```
   - In `index.html:7180`:
     ```javascript
     var siblings=transactions.filter(function(t){return t.recur_series_id===seriesId&&t.id!==editedId&&t.date>=fromDate;});
     ```
   - Notice that past occurrences (`t.date < fromDate`) are untouched. They retain `recurring: true`, `recur_series_id: seriesIdForSync`, and `recur_end_date: null`.
   - In `index.html:3949` (`processRecurring`):
     ```javascript
     var recurring=transactions.filter(function(t){return t.recurring&&typeof t.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.date);});
     ```
     The engine finds the past occurrences, determines `latest` as the newest past occurrence, and computes `next = addInterval(lastDate, interval, anchorDay)`. Because `next <= today` is satisfied, it regenerates all future occurrences up to `today`.

2. **Recurrence Anchor Day Immutability on Future Edit:**
   - In `index.html:7253-7254`:
     ```javascript
     var preservedAnchor=(oldTx&&oldTx.recur_anchor_date)||payload.date;
     payload.recur_anchor_date=payload.recurring?preservedAnchor:null;
     ```
   - When editing a recurring transaction and moving its date (e.g. from the 5th to the 20th of the month) under `future` mode, `preservedAnchor` takes `oldTx.recur_anchor_date` (the 5th). `payload.date` is ignored. On subsequent months, `processRecurring` uses `anchorDay = 5` and shifts the generated transaction back to the 5th.

3. **Advance Transactions Skip Intermediate Months:**
   - In `index.html:3988-3989`:
     ```javascript
     var lastDate=new Date(root.date+'T12:00:00');
     related.forEach(function(tx){var d=new Date(tx.date+'T12:00:00');if(d>lastDate)lastDate=d;});
     var next=addInterval(lastDate,interval,anchorDay);
     ```
   - If a future transaction is entered manually (e.g. June payment registered on April 1st), `lastDate` becomes June. `addInterval` advances to July. The while loop `next <= today` never executes for May, causing May to be permanently skipped.

4. **Category Threshold Alert Inconsistency (80%):**
   - In `index.html:5178, 5183`:
     ```javascript
     var used=Math.round(amt/budget*100);
     ...
     } else if(used>=80){
       statusText='Quedan '+fmt(budget-amt)+' ('+used+'% usado)';
       alertClass+=' budget-alert-warn';
       amtColor='var(--amber)';
     ```
   - In `index.html:5257`:
     ```javascript
     var barColor = isExcluded ? 'var(--separator2)' : (budget>0 ? (amt>budget ? 'var(--red)' : (amt>=budget*0.8 ? 'var(--amber)' : c.color)) : c.color);
     ```
   - For `amt = 79.99 €` and `budget = 100.00 €`: `used` is 80 (amber warning text), but `amt >= budget * 0.8` is false (normal category bar color).

5. **Edge Function `monthly-report` Discrepancy:**
   - In `supabase/functions/monthly-report/index.ts:372, 394`:
     ```typescript
     db.from("budgets").select("category_id,amount").eq("user_id", targetUserId).eq("month_year", key)
     ```
   - The backend Edge Function only queries the `budgets` table. It does not implement `autoRecurBudgetBreakdown`. If a user relies on automatic subscription budgeting in the frontend, the monthly report evaluates the budget as 0 €, falsely reporting a budget overrun and sending an inaccurate PDF/email.

6. **Missing `transaction_voids` in `deleteOnlyRecurringOccurrence` Offline / Catch:**
   - In `index.html:7352-7354`:
     ```javascript
     recurrenceExclusions.push(exclusion);
     queueOp({type:'insert',table:'recurrence_exclusions',data:exclusion});
     queueOp({type:'delete',table:'transactions',id:tx.id});
     ```
     `transaction_voids` insert is never queued to `offlineQueue` during offline or network failure scenarios.

---

### 2. Logic Chain
1. *From Observation 1:* When recurrence is disabled in `saveTx` with "future" scope, only transactions with `date >= fromDate` have `recurring: false`. Past transactions retain `recurring: true` and `recur_series_id`. Because `processRecurring` filters all transactions with `recurring: true` and uses `max(tx.date)` to advance towards `today`, it sees past recurring transactions as an active series with no end date. Therefore, it automatically regenerates all future occurrences, violating the user's intent to stop the series.
2. *From Observation 2:* `preservedAnchor` unconditionally defaults to `oldTx.recur_anchor_date` before falling back to `payload.date`. When a user attempts to change the recurrence day (e.g. moving rent payment from the 1st to the 10th) using "future", the anchor remains the 1st. In subsequent months, `addInterval` clamps the date back to the 1st, rendering anchor updates impossible via the edit dialog.
3. *From Observation 3:* `processRecurring` assumes that `lastDate` represents the latest *consecutive* generated occurrence. By calculating `lastDate = max(tx.date)` across all existing transactions, any premature or manually advanced occurrence pulls `lastDate` forward beyond unmaterialized months, permanently skipping intermediate occurrences.
4. *From Observation 4:* `Math.round(amt / budget * 100) >= 80` rounds floating point percentages, whereas `amt >= budget * 0.8` performs strict numeric comparison. Amounts between 79.5% and 79.99% trigger amber text while rendering a non-amber bar.
5. *From Observation 5:* The "previsión completa" invariant is computed in-memory in the client PWA (`autoRecurBudgetBreakdown`) without creating rows in `budgets`. The remote Edge Function `monthly-report` relies exclusively on database rows in `budgets`. Consequently, automated subscription budgets are invisible to the monthly report, causing false over-budget warnings in monthly reports.

---

### 3. Caveats
- **Read-Only Scope:** No source code was modified during this audit. All findings are documented with line numbers and recommended diff logic for implementation planning.
- **Cash Flow Projections:** While the prompt requested auditing cash flow and patrimony projections, Project Context §12 (items 668 and 691) explicitly records that linear cash flow runways and forecast widgets were formally rejected and discarded by the project owner. The current flatline balance for future months in `#lineChartCanvas` reflects the lack of unmaterialized recurrence injection rather than a broken widget.

---

### 4. Conclusion
The recurring transactions and budgeting subsystems in `fintrack` possess solid foundations (safe month arithmetic in `addInterval`, atomic database RPCs for exclusions, and clean tri-state calc mode integration). However, critical state-synchronization flaws exist in the edit workflows:
1. Recurrence series resurrection on edit when attempting to stop recurring schedules.
2. Inability to update the recurrence anchor day via the UI.
3. Skip-ahead vulnerability when transactions are logged in advance.
4. Edge function divergence where automatic subscription budgets are not computed in `monthly-report`.
5. Visual threshold rounding inconsistency at the 80% boundary.

All 8 identified findings are prioritized in the impact-versus-effort matrix within `audit_report.md` with explicit remediation plans and regression tests.

---

### 5. Verification Method
1. **Syntax & Static Verification:**
   - Run `node scripts/validate-syntax.js` to verify integrity of all 4 embedded script blocks in `index.html`.
2. **Resurrection Reproduction Test:**
   - Create a monthly recurrence series starting Jan 15. Verify occurrences exist for Jan, Feb, Mar.
   - Edit March 15: uncheck "Gasto recurrente", select "Esta y todas las futuras".
   - Simulate system date advancing to April 15. Call `processRecurring()`. Verify if April 15 transaction is created (failure: series resurrected).
3. **Anchor Update Reproduction Test:**
   - Create a monthly recurrence on the 5th.
   - Edit the occurrence to the 20th, select "Esta y todas las futuras".
   - Advance date to next month and call `processRecurring()`. Verify whether new date is the 20th (success) or the 5th (failure: anchor day immutable).
4. **Edge Function Budget Parity Test:**
   - Query `supabase/functions/monthly-report/index.ts` with a mock user having recurring subscriptions and no manual budget. Verify whether `categories` contains the subscription budget or 0 € (failure: 0 €).
