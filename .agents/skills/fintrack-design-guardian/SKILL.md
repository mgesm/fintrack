---
name: fintrack-design-guardian
description: >-
  Enforces the 'White Edition & Liquid Glass' design system, zero-emoji policy, and visual
  ergonomics across fintrack. Use whenever reviewing, creating, or modifying UI components,
  CSS rules, layouts, icons, or verifying compliance with DESIGN_SYSTEM.md in index.html.
---

# fintrack — Design Guardian & Visual System Audit

This skill enforces strict adherence to [`DESIGN_SYSTEM.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/DESIGN_SYSTEM.md) (*White Edition & Liquid Glass*) across all desktop and mobile views.

## 1. Non-Negotiable Core Rules

### Rule 1: CERO EMOJIS (Absolute Ban)
- **Zero tolerance:** No unicode emojis in headers, buttons, cards, selects, modals, tooltips, toasts, or exports.
- **Replacement:** Use clean, monochromatic inline SVG icons (`fill="none" stroke="currentColor" stroke-width="2"` or `2.2` with `stroke-linecap="round" stroke-linejoin="round"`).
- **Inspection regex:**
  ```bash
  # Check for unicode emoji occurrences in index.html
  grep -P "[\x{1F300}-\x{1FAD6}\x{1F600}-\x{1F64F}\x{2700}-\x{27BF}]" index.html
  ```

### Rule 2: Brand Identity
- **Name:** Always in lowercase: `fintrack` (never `FinTrack` or `FINTRACK`).
- **Logomark:** `Outfit` font, font-weight `800`, tracking `-1.2px` to `-1.5px` with accent dot (`ft.` or `appname.`).

### Rule 3: Privacy Mode (`privacy-hidden`)
- Obfuscate numeric values (`.privacy-blur` with `filter: blur(8px)`).
- **Never blur data visualization structures:** Donut charts, bar charts, and category pills must remain visible; only the center total or specific monetary amounts get blurred.

---

## 2. Token & Material Standards

### 2.1 CSS Variables over Hardcoded Values
Never introduce raw hex or rgb colors for surfaces or text. Always use defined CSS custom properties:

```css
/* Surfaces */
var(--bg)            /* Base canvas background (#EEF0F3 light, #06060A dark) */
var(--bg2)           /* Primary Liquid Glass surface with backdrop blur */
var(--bg3)           /* Secondary grouped surface */
var(--bg4)           /* Interactive / hover surface */
var(--bg-grouped)    /* Solid grouped container (#FFFFFF light, #1C1C1E dark) */
var(--card-border)   /* Hairline specular perimeter */
var(--separator)     /* Structured divider */
var(--separator2)    /* Ultra-subtle 0.5px hairline */

/* Typography */
var(--text-primary)   /* Primary contrast */
var(--text-secondary) /* Secondary label/description */
var(--text-tertiary)  /* Placeholder or subtle caption */
```

### 2.2 Squircle Radii Tokens
All corners must use smooth squircle radii via tokens:
- `--radius-sm`: `8px` (badges, small tags, sub-pills)
- `--radius-md`: `12px` (input fields, segmented switches, regular buttons)
- `--radius-card`: `16px` (main cards, balance cards, metric containers)
- `--radius-sheet`: `24px` (bottom sheets, modals, elevated surfaces)

Avoid arbitrary inline `border-radius: 5px`, `10px`, or `20px`.

---

## 3. Ergonomics & Responsive Layout

1. **Touch Targets (Mobile):**
   - Every interactive element (buttons, tab icons, switches, close buttons) must have a minimum clickable/tappable area of **44×44 px** (using padding or `min-height: 44px; min-width: 44px;`).
2. **Thumb Zone:**
   - Critical mobile controls (FABs, primary actions, bottom navigation) must be positioned in the lower third of the viewport.
3. **Desktop Dual-Pane Layout:**
   - On screens with `width >= 768px`, preserve the structured sidebar and `dtLayout`/`dtRender` architecture.
   - Do not let mobile full-screen overlays overtake the desktop multi-column workspace.

---

## 4. Verification Checklist

Before accepting any visual change:
- [ ] No emoji exists in the added/modified HTML or JS strings.
- [ ] Surface colors use `var(--bg*)` and borders use `var(--card-border)` or `var(--separator*)`.
- [ ] Modals and sheets include backdrop blur (`backdrop-filter: blur(20px)`).
- [ ] Interactive buttons meet the 44px minimum touch target.
- [ ] Responsive behavior tested on both mobile view (`< 768px`) and desktop view (`>= 768px`).
