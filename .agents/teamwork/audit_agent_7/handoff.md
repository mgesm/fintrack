# Handoff Report — Agent 7: Investments & Portfolio Auditor

**Date:** 2026-11-14T10:55:00Z  
**From:** Audit Agent 7 (Investments & Portfolio Auditor)  
**To:** Orchestrator (`d946d2bc-4375-42f7-ad89-adf507b17370`)  
**Working Directory:** `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_7\`  
**Report File:** `audit_report.md`  
**Handoff Type:** Hard (Task complete)

---

## 1. Observation

Direct observations from the audited codebase:

1. **Non-atomic investment operation edit in `index.html:6689`:**
   ```javascript
   submit.disabled=true;
   var del=await sb.rpc('delete_investment_operation',{p_operation_id:o.id});
   if(del.error){alert(del.error.message);submit.disabled=false;return;}
   var r=await sb.rpc('record_investment_operation',{p_side:o.side,p_symbol:o.symbol,...});
   if(r.error){alert('No se pudo guardar: '+r.error.message);submit.disabled=false;return;}
   ```
   In contrast, Postgres migration `20260923140000_security_and_integrity_fixes.sql:70-125` defines the atomic RPC `update_fintrack_investment_operation`.

2. **Capital gains accounting & transfer mechanics (`20261026130000_investment_tags_and_safety.sql:46-60`, `index.html:5370, 5542`):**
   When selling shares, `record_investment_operation` inserts a transfer from `investment_account_id` to `cash_account_id` for `p_amount` (sale proceeds).
   In `fintrack` tri-state accounting, transfers are excluded from income. When an asset is sold with gain, sale proceeds exceed initial investment, driving the investment account balance negative (`initial - proceeds = -gain`) while no income is recorded.

3. **Decimal truncation in `index.html:2951-2953, 6487, 6493`:**
   `parseCurrencyInput(val)` executes `Math.round((n + Number.EPSILON) * 100) / 100`.
   In `openInvestmentTradeModal` (`index.html:6487, 6493`), both `amount` (which holds unit shares in "units" mode) and `price` (which holds fund NAV) pass through `parseCurrencyInput()`, forcibly truncating share units and prices to 2 decimal places.

4. **Asset allocation classification failure (`index.html:6590-6599`):**
   ```javascript
   function normalizeAssetType(raw){
     if(!raw)return 'Otros';
     var t=String(raw).toLowerCase().trim();
     if(t.indexOf('etf')!==-1)return 'ETFs';
     if(t.indexOf('fondo')!==-1||t.indexOf('fund')!==-1)return 'Fondos';
     ...
   ```
   Twelve Data returns `instrument_type: "Exchange Traded Fund"`. Because `'etf'` is not a substring of `"exchange traded fund"`, it matches `'fund'` on line 6594, misclassifying all ETFs as `"Fondos"`.

5. **Privacy leak in trade modal (`index.html:6487`):**
   ```javascript
   if(v>0&&p>0&&units>0)summary.textContent=(mode==='money'?(portfolioValueHidden()?'••••••':units.toLocaleString('es-ES',{maximumFractionDigits:6}))+' participaciones':fmt(total))+(side==='sell'?' · disponibles: '+dispStr:'');
   ```
   When `mode === 'units'`, `fmt(total)` is printed in plain text without checking `portfolioValueHidden()`, leaking total monetary amounts when portfolio privacy is enabled.

6. **Safety tag stripping in `saveTx` (`index.html:7036, 7209`):**
   `editTx(id)` allows opening investment transfer transactions if `portfolioValueHidden()` is false. In `saveTx()` line 7209, saving the transfer sets `tags: []`, stripping `invest_operation`, `invest_buy`, and `invest_sell`, thereby bypassing the deletion guard in `deleteTx` line 7401.

7. **Typo in account deletion pre-check (`index.html:5975`):**
   `var inOps=(investmentOperations||[]).some(function(op){return op.cash_account_id===id||op.account_id===id;});`
   The column is `investment_account_id`, not `account_id`.

8. **Undisclosed static NAV fallback (`supabase/functions/market-data/index.ts:86`, `index.html:2652`):**
   When Yahoo quote fails, `market-data` falls back to `knownFunds` returning `{ is_backup_nav: true, nav_date: known.navDate }`. Client `index.html` ignores these flags and presents the backup price as a live quote.

9. **Dead code and global MutationObservers (`index.html:6407-6414, 6426, 6439`):**
   `bindAssetGraph` is never called. `assetPeriodObserver` and `investmentLogoObserver` observe `document.body` globally across all tabs on every DOM mutation.

---

## 2. Logic Chain

1. **Premise 1 (Data Safety):** From Observation 1, calling `delete_investment_operation` before `record_investment_operation` is inherently non-atomic. If the second network call fails, the record is gone. Therefore, replacing this with `update_fintrack_investment_operation` is mandatory to eliminate data loss risk.
2. **Premise 2 (Integrity Protection):** From Observation 6, allowing standard edit on investment transfers strips tags and desynchronizes `investment_operations`. Therefore, `editTx` must unconditionally block editing investment-linked transfers, redirecting users to the Inversión tab.
3. **Premise 3 (Financial Precision):** From Observation 3, rounding share units and fund NAVs to 2 decimals breaks support for fractional shares and mutual funds. Therefore, a specialized parser preserving up to 6 decimals for units and 4 decimals for price must replace `parseCurrencyInput` in investment modals.
4. **Premise 4 (Tax & Accounting Tenets):** From Observation 2, treating asset sales as simple transfers leads to phantom negative balances in Cuentas and ignores capital gains. Either realized gain/loss must be split into a capital return transfer + income transaction, or the investment account in Cuentas must be clearly bounded as a cash flow ledger rather than net worth.
5. **Premise 5 (Categorization & Privacy Fidelity):** From Observations 4 and 5, simple substring checks in `normalizeAssetType` and unmasked `fmt(total)` in modal summaries create visible defects for ETFs and privacy leaks, requiring localized regex matching and masking guards.

---

## 3. Caveats

- **External API Rate Limits:** Twelve Data free tier limits (8 requests/minute) cannot be solved entirely on the client without server-side request batching or a dedicated NAV API service. Persisting `_quoteCache` mitigates repeat calls but does not eliminate initial bursts for large portfolios (>8 holdings).
- **Historic NAV Coverage:** Yahoo Finance endpoints are subject to IP blocking from cloud environments. Long-term reliability for European mutual funds requires an official, licensed fund market data feed.
- **Scope Limit:** All observations are based on a read-only audit; no application source code was modified during this task.

---

## 4. Conclusion

The investments subsystem in `fintrack` has solid foundations (dual-entity pairing, weighted average cost basis math, responsive SVG charting, and portfolio privacy toggling), but suffers from critical integration oversights (non-atomic edit flow risking data loss, precision truncation in units/NAVs, misclassified ETFs, and negative balance accumulation on profitable sales).

All 12 findings have been cataloged with concrete file paths, line numbers, formulas, impact-effort ratings (High/Medium/Low), and sequential implementation phases in `audit_report.md`.

---

## 5. Verification Method

1. **Verify Non-Atomic Edit Risk:** Inspect `index.html:6689` and `supabase/migrations/20260923140000_security_and_integrity_fixes.sql:70-125`.
2. **Verify Decimal Truncation:** Evaluate `parseCurrencyInput('10,123456')` in browser DevTools; confirm it returns `10.12`.
3. **Verify ETF Classification:** Evaluate `normalizeAssetType('Exchange Traded Fund')`; confirm it returns `'Fondos'` instead of `'ETFs'`.
4. **Verify Tag Eradication:** Trace `saveTx` in `index.html:7209`; confirm `tags: []` is assigned when saving a transfer.
5. **Verify Account Deletion Typo:** Inspect `index.html:5975`; confirm `op.account_id` is queried instead of `op.investment_account_id`.
