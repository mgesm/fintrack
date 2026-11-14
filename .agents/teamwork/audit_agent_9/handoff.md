# Handoff Report: Privacy, Data Security & Privacy Mode Auditor (Agent 9)

## 1. Observation
- **CSS Privacy Mode Rule (`index.html:1516-1526`)**:
  ```css
  html.privacy-mode #lineChartCanvas,
  html.privacy-mode #barChartCanvas,
  html.privacy-mode .heatmap-grid,
  html.privacy-mode .dc-amount,
  html.privacy-mode .dt-dc-amount,
  html.privacy-mode .heatmap-tot,
  html.privacy-mode .heatmap-detail {
    filter: blur(6px);
    transition: filter 0.25s ease;
    pointer-events: none;
  }
  ```
  Laptops and mobile screens running `privacy-mode` blur the entire canvas element `#lineChartCanvas` and `#barChartCanvas`, disabling user interaction (`pointer-events: none;`) and hiding visual graphs, while no other numeric elements are targeted by CSS blur.
- **Plaintext Leaks in Tab 0 (Dashboard)**:
  `index.html:4229`: `el.textContent = Math.abs(net)>0.005 ? 'Actualización de gastos: ' + (net<0?'−':'+') + fmt(Math.abs(net)) : '';`
  `index.html:4240`: `el.textContent = uncomputed>0.005 ? 'Gastos no computados: ' + fmt(uncomputed) : '';`
  Both render numeric values in plaintext without checking `isPrivacyMode()`.
- **Plaintext Leaks in Tab 1 (Categorías)**:
  `index.html:5180`: `statusText = 'Excedido en ' + fmt(diff) + ' (' + used + '% usado)';`
  `index.html:5184`: `statusText = 'Quedan ' + fmt(budget-amt) + ' (' + used + '% usado)';`
  `index.html:5206`: `sa > 0 ? fmt(sa) : '—'`
  `index.html:5267`: `.cat-amount-text` renders `amt > 0 ? fmt(amt) : '0 €'`
  `index.html:5277`: `.budget-badge` renders `fmt(budget)`
  All category expenses, subcategories, and budgets are rendered without checking `isPrivacyMode()`.
- **Plaintext Leaks in Tab 2 (Cuentas)**:
  `index.html:5426`: `totalPat` renders `(totalPat<0?'−':'') + fmtHtml(Math.abs(totalPat))` without checking `isPrivacyMode()`.
  `index.html:5374`: `calcText = isPrivateInvestmentBalance ? '••••••' : fmtHtml(calc);` where `isPrivateInvestmentBalance = !!a.is_investment && portfolioValueHidden();` (checks `portfolioValueHidden()`, completely ignores `isPrivacyMode()`).
  `index.html:5376`: `resetHtml` renders `fmt(reset.amount)` for ordinary accounts.
  `index.html:5388-5395`: `realAmt = fmt(p.amount)`, `theorAmt = fmt(th)`, `desfaseStr = fmt(d)`.
- **Plaintext Leaks in Tab 3 (Análisis)**:
  `index.html:6304-6305`: `.compare-val` and `.compare-diff` render `fmt(curExp)`, `fmt(curInc)`, `fmt(Math.abs(expDiff))`.
  `index.html:6263-6288`: All 9 annual statistics cards render `fmt(...)` in plaintext.
- **Disconnected Privacy Mode and Portfolio Masking**:
  `index.html:2614-2616`: `isPrivacyMode()` reads `localStorage.getItem('ft_privacy_mode')`.
  `index.html:6443`: `portfolioValueHidden()` reads `localStorage.getItem('ft_invest_portfolio_hidden_' + uid)`.
  Neither function triggers or checks the other.
- **Web Crypto Implementation (`index.html:3698-3726`)**:
  Uses `crypto.subtle.generateKey({name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])` with `extractable: false`, stores `CryptoKey` in IndexedDB store `'keys'` under fixed key `'device-key'`.
- **Memory & Storage Leaks in `signOut()` (`index.html:6814-6834`)**:
  Does not remove `ft_invest_recent_assets_<uid>`, `ft_invest_portfolio_hidden_<uid>`, `ft_default_account_<uid>`, `ft_last_sync_<uid>`, `ft_cat_exclusions_<uid>`, `ft_cat_icons_<uid>`. Does not reset global variables `searchQuery`, `filterAccount`, `filterCat`, `assetDetailState`, `_historyCache`.
- **Infinite Loop Vulnerability in `hlText` (`index.html:2678-2696`)**:
  If search query consists solely of combining diacritics stripped by `normStr`, `makeDiacriticRegex` produces `new RegExp("", "gi")`. In `hlText`, `regex.exec(s)` matches empty string and `lastIndex` never advances, causing an infinite while loop that freezes the browser thread.
- **Unescaped Attribute Concatenation (`index.html:5021, 5042, 4576`)**:
  `editTx(' + t.id + ')` and `hmEditTx(' + t.id + ')` concatenate `t.id` directly into inline `onclick` attributes without `htmlEscape`.
- **Supabase Key Safety (`index.html:2593-2595`)**:
  Verified `SB_KEY` is a public/publishable key (`sb_publishable_...`). No `service_role` keys or third-party secrets found in client code.

## 2. Logic Chain
1. From Observation 1, `html.privacy-mode` blurs `#lineChartCanvas` and `#barChartCanvas` with `pointer-events: none;`, directly violating the core project invariant: *"Privacy mode compliance: numeric amounts blurred, visual graphs/rings intact."*
2. From Observations 2, 3, 4, 5, and 6, when a user activates global Privacy Mode, the UI only masks mobile dashboard KPIs and transaction rows. Every other numeric amount across Categorías, Cuentas, and Análisis remains visible in plaintext because the template functions invoke `fmt()` without checking `isPrivacyMode()`, and CSS has no selectors targeting `.cat-amount-text`, `.pat-total-value`, `.compare-val`, or `.stat-val`.
3. From Observation 6, because `isPrivacyMode()` and `portfolioValueHidden()` are stored and evaluated completely independently, enabling global Privacy Mode fails to mask investment values in the Inversión tab, fails to exclude investment accounts in Cuentas, and exposes trade modals upon clicking operations.
4. From Observation 7, the AES-GCM 256-bit non-extractable key design is cryptographically sound, but storing it under a single device-wide key name (`'device-key'`) means multi-tenant devices share encryption keys across profiles.
5. From Observation 8, `signOut()` leaves sensitive metadata (recent investment assets, default account, search query) in `localStorage` and memory, allowing subsequent users on the same device/browser to inspect previous user activity.
6. From Observation 9, `hlText` fails to handle zero-length regex matches produced by `makeDiacriticRegex`, resulting in an unmitigated denial of service (browser freeze) on specific inputs.
7. From Observation 10 and 11, lack of HTML escaping on `t.id` in inline handlers and absence of a CSP `<meta>` tag create unnecessary attack surface, though the client-side Supabase credentials adhere strictly to the public anon-key model.

## 3. Caveats
- Production database RLS policies and live edge cron execution schedules were audited based on local migration files and edge function sources in `supabase/`, as live cloud inspection requires remote credentials not configured in this offline sandbox.
- Hardware-backed WebCrypto keystore isolation depends on the underlying browser's IndexedDB encryption at rest.
- No code modifications were made during this audit in compliance with the strict read-only directive.

## 4. Conclusion
The Privacy Mode implementation in `fintrack` is currently suffering from a severe architectural inversion: it blurs the visual canvases that should remain visible while leaking sensitive financial amounts in plaintext across 4 out of 5 application tabs. Furthermore, an infinite-loop bug in `hlText` threatens client availability, and `signOut()` leaves residual user data. Addressing these issues via a universal semantic CSS blur rule, coordinating `isPrivacyMode()` with portfolio masking, patching `hlText`, and extending logout purge will achieve 100% compliance with `fintrack` privacy invariants with minimal effort and zero disruption to financial math.

## 5. Verification Method
1. **Audit Report Inspection**: Inspect `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_9\audit_report.md` for complete line-by-line findings, selectors, and remediation recipes.
2. **Syntax Validation**: Run `node scripts/validate-syntax.js` to ensure the codebase remains syntactically valid (0 errors).
3. **Privacy Mode Reproduction**:
   - In `index.html`, open browser, activate Privacy Mode via Balance card or 'P' key.
   - Inspect `#lineChartCanvas`: observe that the canvas is blurred and non-interactive (invalidation condition).
   - Navigate to Tab 1 (Categorías): observe that `.cat-amount-text` and `.budget-badge` display unblurred numbers (invalidation condition).
   - Navigate to Tab 2 (Cuentas): observe that `.pat-total-value` displays total net worth in plaintext (invalidation condition).
4. **ReDoS Test**: Call `hlText('test note', '\u0301')` in browser console: observe infinite while loop lockup (invalidation condition).
5. **Logout Storage Check**: Call `signOut()` in console and execute `Object.keys(localStorage).filter(k => k.includes(currentUser.id))`: verify residual keys remain.
