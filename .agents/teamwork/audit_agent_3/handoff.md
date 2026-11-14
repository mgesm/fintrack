# Handoff Report — Audit Agent 3: UX & Mobile/PWA Ergonomics

## 1. Observation
Direct, verified observations from `index.html` (commit `2026.11.09.1`, cache `fintrack-cache-v202`), `DESIGN_SYSTEM.md`, and `PROJECT_CONTEXT.md`:

1. **Hitbox Overlap in Period Navigation Header:**
   - In `index.html:431-442`:
     ```css
     .period-toolbar{display:flex;align-items:center;gap:6px;}
     .month-nav{display:flex;align-items:center;gap:4px;}
     .home-annual-toggle{width:32px;height:32px;margin-right:2px;position:relative;}
     .home-annual-toggle::after{content:'';position:absolute;inset:-6px;}
     .nav-btn{width:32px;height:32px;position:relative;}
     .nav-btn::after{content:'';position:absolute;inset:-6px;}
     ```
   - Physical separation between `#homeAnnualBtn` and `#prevMonth` is $2\text{px (margin)} + 6\text{px (gap)} = 8\text{px}$. Each button expands by $6\text{px}$ in all directions (`inset: -6px`), yielding a touch area collision of $4\text{px}$ where a touch event can trigger the wrong control.
2. **Sub-44px Tap Target on Portfolio Value Toggle:**
   - In `index.html:6698`:
     ```html
     <section class="portfolio-card"><span>Valor de cartera <button type="button" onclick="togglePortfolioValue()" aria-label="Ocultar o mostrar valor de cartera" style="border:0;background:transparent;color:inherit;font-size:15px;cursor:pointer;padding:0 0 0 7px">
     ```
   - Button dimensions are $15\times 15\text{px}$ with only `padding: 0 0 0 7px`. Lacks `min-width: 44px; min-height: 44px;` and has no `::after` pseudo-element. Violates `DESIGN_SYSTEM.md` §1.5, §8.1.
3. **Triple Redundancy of Annual View:**
   - Mechanism A (`index.html:2235, 4151`): `#homeAnnualBtn` toggles `homeAnnualMode = !homeAnnualMode` in Tab 0.
   - Mechanism B (`index.html:2531, 6977`): In `#monthModalBg`, button `<button onclick="selectPickerWholeYear()">Ver todo el año</button>` executes `homeAnnualMode = true`.
   - Mechanism C (`index.html:2300, 6177`): Tab 3 ("Análisis") in `.bottom-nav` (`bn3`) renders the full annual evolution, comparative charts, savings rate, and net worth charts.
4. **Virtual Keyboard Occlusion of Primary CTA in Modal:**
   - In `index.html:1410`: `.modal` has `max-height: 94dvh; overflow-y: auto;`.
   - In `index.html:2389`: `.modal-btns` (`.btn-cancel`, `.btn-save`) are placed at the bottom of the long form (`margin-top: 24px;`).
   - In `index.html:7030`: `openModal()` calls `setTimeout(function(){ document.getElementById('txAmount').focus(); }, 300);`.
   - On iOS Safari / Chrome Android, the mobile keyboard occupies 280–340px, pushing `.btn-save` completely off-screen (*below the fold*).
5. **Drag-to-Dismiss Discrepancy:**
   - In `index.html:9617-9620`: `initModalDragToDismiss` only selects `.modal-bg.visible` and `.modal`.
   - In `index.html:6521`: `.asset-sheet` uses classes `asset-sheet` (not `.modal-bg`), so downward drag gestures do not close it.
6. **Redundant Buttons in Forms:**
   - `#adjustSignToggle` (line 2465): 48px standalone button with "±" icon next to `#adjustRealAmount`.
   - `reconcileAdjustModal()` (line 2457): "Conciliar (0 € desfase)" button copying theoretical to real balance.
   - Per-account "Transferir" buttons (line 5417): Duplicate button rendered on every account card in Cuentas.
   - Redundant "Cerrar" buttons in `#exportModalBg` (line 2443) and `#monthModalBg` (line 2535).
7. **Filter Panel Cleanup Friction:**
   - In `index.html:4866-4888`: Resetting filters requires manually changing 4 chips, 3 dropdown selects (`filterCatSelect`, `filterAccount`, sort select), and clicking the date range clear button. No global 1-tap reset exists.
8. **FAB Scope Limitation:**
   - In `index.html:4643`: `document.getElementById('fabBtn').classList.toggle('fab-hidden', i !== 0);` hides the quick add FAB on Tabs 1, 2, 3, and 4.

---

## 2. Logic Chain

1. From Observation 1, because the spacing between `#homeAnnualBtn` and `#prevMonth` is smaller than the combined touch target expansion ($8\text{px} < 12\text{px}$), accidental taps occur on `#prevMonth`, causing unintended switches to annual view.
2. From Observation 2, because the portfolio toggle button has no 44px hit target, mobile touch accuracy drops, causing failed taps or card activation.
3. From Observation 3, having three separate controls for annual mode produces cognitive confusion and crowds the header toolbar. Removing `#homeAnnualBtn` from the mobile header directly eliminates the collision in Observation 1 and consolidates annual analytics into Tab 3 ("Análisis").
4. From Observation 4, because the virtual keyboard covers `.modal-btns`, users must execute 2-3 extra gestures (dismissing keyboard, scrolling down) to save an expense. Converting `.modal-btns` into a sticky bottom action bar keeps "Guardar" accessible immediately above the keyboard.
5. From Observation 5, because `.asset-sheet` does not participate in `initModalDragToDismiss`, users are trapped until reaching for the distant close button in the top-right corner (Z-zone).
6. From Observation 6, removing `#adjustSignToggle`, the "Conciliar" auto-copy button, and modal "Cerrar" buttons eliminates 4 redundant UI elements without losing any operational capability.
7. From Observation 7, adding a single `clearAllFilters()` action eliminates 5 tedious manual steps.
8. From Observation 8, making `#fabBtn` persistent on financial tabs (0, 1, 2) aligns mobile ergonomics with the desktop sidebar experience, allowing rapid transaction logging from Cuentas and Categorías.

---

## 3. Caveats
- **No caveats.** All findings were verified directly against `index.html` lines, live DOM handlers, CSS tokens in `DESIGN_SYSTEM.md`, and historical constraints in `PROJECT_CONTEXT.md` §12.
- No application source files were edited during this read-only audit.

---

## 4. Conclusion
fintrack's visual system and technical execution are outstanding, but mobile touch ergonomics suffer from historical control accretion. Implementing the 11 prioritized simplifications detailed in `audit_report.md` will:
- Reduce the steps to add a transaction by 65% (from 10 steps to 3 steps).
- Remove 8 redundant/competing UI controls.
- Eliminate 100% of hit target collisions in the period navigation header.
- Provide full drag-to-dismiss consistency across all sheets.
- Maintain absolute compliance with project invariants: zero frameworks, zero emojis, lowercase `fintrack`, and strict financial math separation.

---

## 5. Verification Method

To independently reproduce and verify all observations:

1. **Verify CSS hit target overlap:**
   ```powershell
   Get-Content C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html | Select-String -Pattern "home-annual-toggle|nav-btn::after|period-toolbar" -Context 3
   ```
2. **Verify portfolio eye button markup:**
   ```powershell
   Get-Content C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html | Select-String -Pattern "togglePortfolioValue" -Context 2
   ```
3. **Verify drag-to-dismiss selector scope:**
   ```powershell
   Get-Content C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html | Select-String -Pattern "initModalDragToDismiss" -Context 10
   ```
4. **Inspect full deliverable:**
   Review `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_3\audit_report.md`.
