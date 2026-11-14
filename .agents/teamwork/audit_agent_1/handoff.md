# Handoff Report: Accounting Engine & Financial Math Auditor (Agent 1)

## 1. Observation
1. **Tri-State Accounting Exclusion in `accountTxDelta`**:
   - In `index.html:2917-2921`, `isTxExcludedFromBalance(t)` is defined:
     ```javascript
     function isTxExcludedFromBalance(t){
       if(!t)return false;
       var m=getEffectiveTxCalcMode(t);
       return m===2;
     }
     ```
   - In `index.html:5475-5486`, `accountTxDelta(t, accountId)` is defined:
     ```javascript
     function accountTxDelta(t,accountId){
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
   - Observation: `isTxExcludedFromBalance(t)` is never called in `accountTxDelta(t, accountId)` or in `accountTouchesAccount(t, accountId)` (`index.html:5487`). When `t` has `computa_todo === 2` (`exclude_from_calc: 2` or `_no_calc`), `accountTxDelta` still computes `-Number(t.amount)` or `+Number(t.amount)`.

2. **IEEE-754 Precision Rounding**:
   - In `index.html:2925-2929`:
     ```javascript
     function roundMoney(n){
       n=Number(n);
       if(!Number.isFinite(n))return 0;
       return Math.round((n+Number.EPSILON)*100)/100;
     }
     ```
   - Observation: Executing `roundMoney(35.855)` produces `35.85` instead of `35.86`. At magnitude 35.855, the double-precision error is $\approx 5 \times 10^{-13}$, while `Number.EPSILON` is $\approx 2.22 \times 10^{-16}$, rendering the epsilon adjustment ineffective.
   - Observation: Across lines 5451, 5543, 5553, 5596, 5605, 5726, 9173-9177, and 9232-9236, raw `Math.round(x * 100) / 100` is used without calling `roundMoney`.

3. **Currency Parsing and Input Truncation**:
   - In `index.html:2930-2953`, `parseCurrencyInput(val)` relies on `parseFloat(s)`.
   - Observation: Testing `parseCurrencyInput('15+5')` produces `15` instead of `20` because `parseFloat` terminates parsing at the `+` character.
   - Observation: Testing `parseCurrencyInput('1.250')` produces `1.25` instead of `1250` because `lastComma === -1`, `lastDot === 1`, and `parts.length === 2`, causing it to be treated as a decimal fraction rather than a thousands separator.

4. **Non-Atomic Dual Mutation in Balance Adjustment**:
   - In `index.html:5614-5622`:
     ```javascript
     var savedReal=await withLoadTimeout(sb.from('patrimony').insert(item).select(),8000,...);
     ...
     var savedAdjustment=await withLoadTimeout(sb.from('transactions').insert(adjustment).select(),8000,...);
     ```
   - In `supabase/migrations/20260727090000_balance_adjustment_transactions.sql:11-30`, an atomic function exists:
     `public.save_fintrack_balance_adjustment(snapshot jsonb, adjustment jsonb)`
   - Observation: The frontend bypasses the atomic RPC and makes two separate table inserts over HTTP.

5. **Same-Day Post-Adjustment Temporal Blind Spot**:
   - In `index.html:5542`:
     `var live=pool.filter(function(t){return accountTouchesAccount(t,accountId)&&t.date>baseDate&&t.date<cutoff;}).reduce(...)`
   - Observation: For any transaction recorded on the exact date of a snapshot with `t.date === baseDate`, `t.date > baseDate` evaluates to `false`. Transactions entered after the adjustment on that day are omitted from the live balance.

6. **Annual Category Exclusion Scope**:
   - In `index.html:5129-5137`:
     `var curYm=monthKey(viewYear,viewMonth);`
     `var totalExp=Object.keys(bycat).reduce(function(sum,cid){return sum+(isCategoryExcludedFromExpense(cid,curYm)?0:bycat[cid]);},0)||1;`
   - Observation: In annual mode, `bycat[cid]` accumulates 12 months, but line 5137 filters `bycat[cid]` against `curYm` (only 1 month), creating a mismatch with `txExpenseImpact(t)`.

---

## 2. Logic Chain
1. From Observation 1, because `accountTxDelta` does not filter out `isTxExcludedFromBalance(t)`, any transaction with `computa_todo: 2` modifies the return value of `accountTxDelta` by `±amount`. Because `accountCalcBalance` and `accountCalcTheoreticalAsOf` sum `accountTxDelta` over the transaction pool, informational annotations alter the calculated account balances and total net worth. This directly breaks Rule 1.1 of the Tri-State accounting specification.
2. From Observation 2, because `Number.EPSILON` is unscaled, floating point boundary values like 35.855 are truncated to 35.85 instead of rounding to 35.86. Replacing this with exponential notation `Number(Math.round(Number(val + 'e+2')) + 'e-2')` mathematically eliminates representation bias.
3. From Observation 3, users typing simple arithmetic or Spanish notation with a single thousands dot suffer data truncation or a 1,000x error. Integrating the existing tested Shunting-Yard parser from `scripts/test-math-eval.js` ensures expressions are evaluated before parsing.
4. From Observation 4, executing two separate HTTP calls to insert `patrimony` and `transactions` allows a partial failure state where a real snapshot is persisted without its linked adjustment transaction, desynchronizing the ledger and requiring the startup recovery routine.
5. From Observation 5, because dates lack time stamps and `accountCalcBalance` uses strict inequality `t.date > baseDate`, the system treats adjustments as the final event of the day, dropping same-day post-adjustment transactions.

---

## 3. Caveats
- No changes to application source code (`index.html`, `serviceworker.js`, etc.) were made during this audit; all findings are documented for the consolidated master plan.
- The exact time of day for balance adjustments vs. transactions cannot be retroactively added without altering the database schema (`date` column is `date` in PostgreSQL).
- Did not investigate investment market quote fetching APIs (reserved for Agent 7).
- Did not investigate service worker cache eviction mechanisms (reserved for Agent 5).

---

## 4. Conclusion
fintrack's accounting architecture contains excellent fundamentals (transfers are cleanly isolated from P&L, balance adjustments do not pollute theoretical sums, and snapshots act as solid baselines). However, **Defect 1 (Tri-state Mode 2 balance leak)** is an active bug that corrupts account balances when informational annotations are used. Defect 2 and Defect 3 present high risks of silent user input corruption. Defect 4 introduces avoidable network desynchronization. All items have been cataloged in `audit_report.md` with concrete line numbers, formulas, and prioritized recommendations.

---

## 5. Verification Method
1. **Tri-State Accounting Bug Verification:**
   Run:
   ```powershell
   & "C:\Users\migue\AppData\Local\OpenAI\Codex\runtimes\cua_node\6ef99b3d04073aa7\bin\node.exe" C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_1\test_computa_todo_bug.js
   ```
   *Expected Output:*
   `accountTxDelta in index.html: -500`
   `Expected delta according to SKILL.md Section 1.1: 0`
   `BUG CONFIRMED: accountTxDelta does NOT respect exclude_from_calc === 2 / computa_todo === 2!`

2. **Precision Rounding Verification:**
   Run:
   ```powershell
   & "C:\Users\migue\AppData\Local\OpenAI\Codex\runtimes\cua_node\6ef99b3d04073aa7\bin\node.exe" -e "function roundMoney(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;} console.log(roundMoney(35.855));"
   ```
   *Expected Output:* `35.85` (failing to round to `35.86`).

3. **Input Currency & Spanish Thousands Verification:**
   Run:
   ```powershell
   & "C:\Users\migue\AppData\Local\OpenAI\Codex\runtimes\cua_node\6ef99b3d04073aa7\bin\node.exe" C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_1\test_parse_currency.js
   ```

4. **Finance Test Suites Verification:**
   Run:
   ```powershell
   & "C:\Users\migue\AppData\Local\OpenAI\Codex\runtimes\cua_node\6ef99b3d04073aa7\bin\node.exe" C:\Users\migue\.gemini\antigravity\scratch\fintrack\scripts\audit-agent1-tx-core.js
   & "C:\Users\migue\AppData\Local\OpenAI\Codex\runtimes\cua_node\6ef99b3d04073aa7\bin\node.exe" C:\Users\migue\.gemini\antigravity\scratch\fintrack\scripts\audit-finance-core.js
   & "C:\Users\migue\AppData\Local\OpenAI\Codex\runtimes\cua_node\6ef99b3d04073aa7\bin\node.exe" C:\Users\migue\.gemini\antigravity\scratch\fintrack\scripts\test-math-eval.js
   & "C:\Users\migue\AppData\Local\OpenAI\Codex\runtimes\cua_node\6ef99b3d04073aa7\bin\node.exe" C:\Users\migue\.gemini\antigravity\scratch\fintrack\scripts\simulate-dashboard-stats.js
   ```
