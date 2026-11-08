# Combined Helper Dashboard fixes — 31 October 2026

**Status:** Candidate prepared; local checks passed; not deployed.

**Baseline:** User-supplied `helperdashboardapp-restaurant-timer-direct-link-fix.zip`, carried forward through the already-prepared next-payment-reference and chronological payment-order candidate. The supplied baseline and prior candidate remain unchanged.

## Included fixes

1. **HC-16 shift priority:** Live helper shifts now rank ahead of Confirmed shifts regardless of date. Within each status, earliest date wins, then earliest parsed start time, then title for deterministic ordering.
2. **HC-08 next-shift helper pay:** Both HTML entry points now display the backend `estimatedHelperPay` value sourced from the Work Planner `Helper Pay` property. They no longer approximate helper pay as 40% of projected gross, which omitted fuel and the post-split trip boost. Missing source values remain unavailable rather than being represented as a fabricated amount.
3. **Authenticated staff identity:** AI unanswered-question and feedback records now take the staff name from the authenticated Staff Profile (`Name` title property), not the browser-submitted `body.name`. The Staff Profiles schema was checked and confirms `Name` is the title property.
4. **Retained prior payment fixes:** Outstanding shifts continue to display the next payment reference, and the payment breakdown retains chronological ordering from the preceding candidate.

## Files changed in this combined candidate

- `netlify/functions/dashboard-data.mjs`
- `index.html`
- `helper-dashboard-final.html`
- `netlify/functions/ask-ai.mjs`
- `netlify/functions/submit-feedback.mjs`
- `package.json`
- `test/release-regressions.test.mjs` (new)
- `combined-fixes-2026-10-31.md` (new)

## Local verification

- `npm test`: 4/4 regression tests passed (Live-vs-Confirmed priority, date/time tie-breaks, both frontend pay-source paths, authenticated AI/feedback identity).
- `node --check` passed for all Netlify `.mjs` files and extracted inline scripts in both HTML entry points.
- ZIP integrity passed.
- Existing payment reference and chronological-order fixes retained in the candidate.

## Not verified

- No Netlify deployment or live Notion integration test was performed.
- No browser/mobile visual test was performed.
- Staff data isolation and duplicate-name request filtering remain separate security work; they are intentionally not represented as fixed here.
- `helper-dashboard-final.html` remains a divergent alternate entry point; only the targeted helper-pay correction was applied there, not a broad sync with `index.html`.

**Deployment:** Not deployed. Gary deploys manually.
