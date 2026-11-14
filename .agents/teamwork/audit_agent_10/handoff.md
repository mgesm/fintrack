# Handoff Report — Audit Agent 10 (Code Quality, Technical Debt & Modularity)

## 1. Observation

1. **Monolithic Architecture**:
   - `index.html` comprises **9,879 lines** and 602.65 KB.
   - The primary application logic resides entirely within a single inline `<script>` tag starting at line 2590 (`<script>`) and ending at line 9877 (`</script>`) — spanning **7,287 lines** and **442,393 characters**.
   - Verified by PowerShell command:
     `$lines = [System.IO.File]::ReadAllLines("index.html"); Write-Output "$($lines.Count) lines, script: 2590 to 9877"`
2. **Global Namespace Inventory**:
   - **125 unindented `var` declarations** at column 0 in the root script scope (e.g. `currentUser`, `transactions`, `_quoteCache`, `_rbCache`, `isSaving`, `txCalcMode`, etc.).
   - **387 top-level function declarations** at column 0 (e.g. `isPrivacyMode`, `render`, `dtRender`, `applyBalanceAdjustment`, etc.).
   - Total of **>512 identifiers exposed directly onto `window`**.
   - Direct `window.*` assignments at lines 3558, 6375, 6380, 6501, 6505, 6529, 6536, 7704, 8177, 8343, 9843.
   - Zero usage of `"use strict"` across all embedded scripts.
3. **Dead and Deprecated Code**:
   - **16 functions with 0 invocations** across all HTML and JS:
     - `toggleGlobalPrivateMode` (line 2645)
     - `localIsoDate` (line 2675)
     - `isCategoryExcludedFromBalance` (line 2842)
     - `startSetPin` (line 3505)
     - `enableBio` (line 3510)
     - `toggleAutoBackup` (line 4053)
     - `isTxExcludedExpense` (line 4316)
     - `accountVoidDelta` (line 5488)
     - `accountRealBalance` (line 5558)
     - `reconcileAccountToTheoretical` (line 5638)
     - `ensureBalanceAdjustmentCategory` (line 5947)
     - `saveBalanceAdjustmentFallback` (line 5961)
     - `bindAssetGraph` (line 6407)
     - `setExcludeFromCalc` (line 6917)
     - `daysBetween` (line 7632)
     - `exportDailyBalanceRange` (line 7633)
   - **7 dead global variables**:
     - `ACCENT_COLORS` (line 2599, 16 hex colors, never referenced)
     - `donutChart` (line 2604, never referenced)
     - `barChart` (line 2605, never referenced)
     - `lineChart` (line 2605, never referenced)
     - `dtDonutChart` (line 9333, never referenced)
     - `isExcludeFromCalc` (line 6916, never read or written elsewhere)
     - `_centerValues` (line 4364, written in line 4382, never read anywhere)
4. **Discarded Decision Violations**:
   - `index.html` lines 9597–9605 captures desktop keyboard shortcuts ('n', 'p', '/').
   - `PROJECT_CONTEXT.md` §12 explicitly states: *"2026-09-08: Atajos de teclado globales en versión Desktop (N para nuevo movimiento, 1-5 para tabs, F para filtros). Descartado por el usuario: navegación estándar con ratón/trackpad sin captura de teclas alfanuméricas globales"*.
5. **State Management & Cache Invalidation Inconsistencies**:
   - Neither `signOut()` (line 6814) nor `onAuthStateChange` (line 9860) purges `_catIconsCache` (line 2773), `_rbCache` (line 5564), `_historyCache` (line 5436), `_lastDonutEntries` (line 4315), `_lastHmByDay` (line 4512), or `assetDetailState` (line 2603), causing cross-user cache leakage.
   - `deleteTx()` (line 7398) and `restoreTx()` (line 7439) delete/restore transactions without calling `invalidateTxIndices()` or `clearBalanceCache()`.
   - Strict reference comparison `if (items === _lastDonutExps)` (line 4321) and `if (exps === _lastHmExps)` (line 4542) fails to detect in-place transaction mutations.
6. **Code Duplication**:
   - `trapFocus` defined identically at line 6471 and line 7061, plus a third implementation at line 9579.
   - `renderDonut` (lines 4337–4400) vs `dtRenderDonut` (lines 9490–9550): ~120 lines duplicated between mobile and desktop with behavioral divergence (desktop lacks `_chartWasDragged` guard).
   - Date formatting duplicated across `localIsoDate` (2675), `lastDayOfMonthStr` (5434), and `todayStr` (7624).
7. **Syntax Validation & Tooling**:
   - `scripts/validate-syntax.js` confirms 4 valid script blocks via `new vm.Script()`.
   - Running `node` in the user's PowerShell environment fails with command not found (`node : El término 'node' no se reconoce...`). Node is only available via embedded runtime at `C:\Program Files\Adobe\Adobe Photoshop 2025\node.exe`.

## 2. Logic Chain

1. From Observation 1, because 7,287 lines of application logic are concatenated in a single inline script tag, any syntax error halts parser execution immediately, preventing `#loadingOverlay` from hiding and rendering the app completely dead. The presence of the 5-second watchdog timer (line 9866) confirms this is a recurring production hazard.
2. From Observation 2, because browser `<script>` tags without `type="module"` run in the global scope, the 125 `var` and 387 `function` declarations automatically attach to `window`. Because `"use strict"` is absent, accidental typo assignments silently create global variables rather than throwing errors.
3. From Observation 3 and Observation 4, matching features against `PROJECT_CONTEXT.md` §12 reveals that when the user rejected features (biometrics WebAuthn on 2026-09-04, accent colors and backup toggles on 2026-09-02, daily balance graphs on 2026-09-10), the code was only partially hidden from the UI while the underlying implementation, variables, and listeners remained as dead code and technical debt. Lines 9597–9605 even actively re-introduced keyboard shortcuts that were explicitly rejected.
4. From Observation 5, because `signOut()` and `onAuthStateChange` clear different subsets of state and neither purges account patrimony history (`_historyCache`) or date balances (`_rbCache`), switching users in the same browser session without hard reload exposes previous user balance data. Furthermore, omitting `clearBalanceCache()` in `deleteTx()` leaves theoretical balance caches stale until page reload.
5. From Observation 6, the bifurcation of desktop and mobile renderers (`renderDonut` vs `dtRenderDonut`) led to code drift where bugfixes applied to mobile were not backported to desktop.
6. From Observation 7, developers and CI environments lacking Node.js in their system PATH cannot run the existing syntax validation script.

## 3. Caveats

- **External Integrations**: Service worker lifecycle and Supabase Edge Function logic were reviewed only in their interaction points with `index.html`. Dedicated offline and backend audits belong to Agents 5 and 6.
- **CSS Stylesheet Size**: `index.html` also contains ~2,000 lines of inline `<style>` CSS; this audit focused strictly on JavaScript code quality, architecture, state, and technical debt.
- **Refactoring Strategy**: Zero code modifications were made during this audit in compliance with the read-only directive.

## 4. Conclusion

`fintrack`'s frontend architecture is functionally capable but technically brittle. The zero-bundler constraint is being conflated with single-file monolithic inline coding. The application requires:
1. **Immediate State Sanitization (Phase 1)**: Unified `resetAppState()` called symmetrically in `signOut()` and auth change, and proper cache invalidation in `deleteTx()` and `restoreTx()`.
2. **Dead Code Eradication & Compliance (Phase 2)**: Removal of the 16 dead functions, 7 dead variables, and the rejected desktop keyboard shortcuts ('n', 'p', '/').
3. **Component Deduplication & Performance (Phase 3)**: Unification of mobile and desktop donut renderers, scoped observers instead of document-level `MutationObserver` instances, and addition of `"use strict"`.
4. **Architectural Modularization (Phase 4)**: Splitting the 7,287-line inline script into clean domain-specific native scripts (`core.js`, `accounting.js`, `charts.js`, `ui.js`) without bundlers or build steps.

## 5. Verification Method

To independently verify the audit findings:
1. **Script Dimensions & Global Inventory**:
   ```powershell
   $lines = [System.IO.File]::ReadAllLines("C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html")
   Write-Output "Total: $($lines.Length) lines. Main script: line 2590 to 9877"
   ```
2. **Dead Functions Verification (0 calls)**:
   ```powershell
   $html = [System.IO.File]::ReadAllText("C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html")
   @('toggleGlobalPrivateMode', 'localIsoDate', 'isCategoryExcludedFromBalance', 'startSetPin', 
     'enableBio', 'toggleAutoBackup', 'isTxExcludedExpense', 'accountVoidDelta', 
     'accountRealBalance', 'reconcileAccountToTheoretical', 'ensureBalanceAdjustmentCategory', 
     'saveBalanceAdjustmentFallback', 'bindAssetGraph', 'setExcludeFromCalc', 
     'daysBetween', 'exportDailyBalanceRange') | ForEach-Object {
       $matches = [regex]::Matches($html, "\b$_\b")
       Write-Output "$_: $($matches.Count) match (declaration only)"
   }
   ```
3. **Keyboard Shortcut Violation**:
   Inspect lines 9597–9605 of `index.html` to verify capturing of `'n'`, `'p'`, and `'/'` in desktop mode.
4. **Syntax Validation**:
   ```powershell
   & "C:\Program Files\Adobe\Adobe Photoshop 2025\node.exe" "C:\Users\migue\.gemini\antigravity\scratch\fintrack\scripts\validate-syntax.js"
   ```
   Expected output: 4 valid script blocks, 0 syntax errors.
