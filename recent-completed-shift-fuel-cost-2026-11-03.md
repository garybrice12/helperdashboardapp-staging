# Helper Dashboard v6.0.4.2 — Recent completed shift fuel cost

Date: 3 November 2026
Status: Prepared candidate; not deployed.

## Change
- The Recent Completed Shift card now includes a **Fuel cost** metric.
- Fuel cost is derived from the shift's actual logged `Miles` value at the saved operating rate of £0.30 per mile.
- If mileage is absent, fuel cost remains unavailable (`—`); it is not shown as £0.00.
- Both dashboard entry points display the metric consistently.
- Existing shift attribution, staff-specific filtering, helper pay, trip boost and payment isolation are unchanged.

## Example acceptance calculation
- 2 November solo shift: 67.4 miles × £0.30 = **£20.22 fuel cost**.

## Files changed
- `netlify/functions/dashboard-data.mjs`
- `index.html`
- `helper-dashboard-final.html`
- `test/release-regressions.test.mjs`
- `package.json`
- This release note.

## Verification
- Automated regression tests: 14 passed, 0 failed.
- All Netlify function `.mjs` syntax checks passed.
- Inline JavaScript syntax checks passed for both dashboard entry points (2 scripts each).
- ZIP integrity and baseline comparison recorded separately.

## Not verified
- Live Netlify/Notion API response and physical-device rendering.
- Not deployed. Preserve the existing live deployment as rollback.
