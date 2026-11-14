---
name: fintrack-deploy-checklist
description: >-
  Executes the mandatory validation, testing, version bumping, and release checklist for fintrack.
  Use before committing code, pushing to GitHub Pages, tagging releases, or finalizing any functional,
  technical, or visual change in the fintrack repository.
---

# fintrack — Deploy & Release Checklist

This skill formalizes the mandatory, non-negotiable release pipeline for **fintrack**. Because fintrack is a zero-build monolithic PWA deployed on GitHub Pages, every release must be validated, versioned atomically, and documented to avoid serving stale service-worker caches or breaking production.

## 1. Step-by-Step Release Pipeline

### Step 1: Syntax & Core Validation
Before touching versions or committing, verify that `index.html` has no JavaScript syntax or structural errors:

```bash
# In the repository root:
node scripts/validate-syntax.js
```

If any errors or missing closures are reported, fix them immediately.

### Step 2: Execute Regression Test Suites
Run the critical mathematical and functional tests:

```powershell
node scripts/test-math-eval.js
node scripts/test-category-icon-persistence.js
node scripts/audit-finance-core.js
```

Ensure all assertions pass with 0 exit codes.

### Step 3: Atomic Version Bumping
You must update both files simultaneously:

1. **[`index.html`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/index.html):**
   - Locate `const APP_VERSION`: increment the build number (e.g., `'2026.10.26.4'` -> `'2026.11.02.1'`). Format is `YYYY.MM.DD.REVISION`.
   - Locate `const APP_PUBLISHED_AT`: update to the current local timestamp in Spain format (e.g., `'02/11/2026, 12:45'`).
2. **[`serviceworker.js`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/serviceworker.js):**
   - Locate `const CACHE_NAME`: increment the cache counter (e.g., `'fintrack-cache-v201'` -> `'fintrack-cache-v202'`).
   > [!IMPORTANT]
   > If `CACHE_NAME` is not incremented, client browsers will serve the old cached version indefinitely, ignoring your changes.

### Step 4: Update `PROJECT_CONTEXT.md`
Edit [`PROJECT_CONTEXT.md`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/PROJECT_CONTEXT.md):
1. **Header:**
   - Update `Versión del documento` (e.g., `2.62`).
   - Update `Última actualización` to today's date (`YYYY-MM-DD`).
2. **Changelog:**
   - Add a new entry detailing:
     - Date and version.
     - Summary of changes (design, accounting, performance, backend).
     - Validation results (`validate-syntax.js` passed, tests passed).
     - Mention updated `APP_VERSION` and `CACHE_NAME`.

### Step 5: Git Commit & Push
Stage and commit all synchronized files:

```bash
git add index.html serviceworker.js PROJECT_CONTEXT.md
git commit -m "release: v<APP_VERSION> - <concise summary>"
git push origin main
```

---

## 2. Post-Deployment Verification
- Open `https://mgesm.github.io/fintrack/` in private/incognito mode or force-refresh (`Ctrl+F5` / `Cmd+Shift+R`).
- Navigate to **Ajustes** -> **Versión** to verify that `APP_VERSION` and `APP_PUBLISHED_AT` match the newly deployed release.
