# Next deployment candidate — 1 November 2026

- Candidate: `helperdashboardapp-news-preparation-reminder-2026-11-01.zip`
- Source baseline: `helperdashboardapp-combined-fixes-actual-recorded-times-2026-10-31.zip`
- Baseline SHA-256: `85c7d3ea28284c9ab00f5e6871beddf36eea06b719229b0d1b8603734a2db89b`
- Package version: `6.0.1`
- Status: candidate only; not deployed.

## Change

Expose the existing Helper Preparation Shift Reminder image from the exact image block `407f475c-d2eb-805b-99cc-fc17a4e77c7a` inside Graphic Control → Home announcement image. Add a separate reminder image card to both the login screen and News tab. Preserve the existing News image, Home announcement image, and live Shift graphic slots.

The image is resolved by its exact Notion block ID inside the named toggle. It is not selected by array position and does not fall back to the order chart if the reminder image is missing.

## Changed files

- `netlify/functions/dashboard-image.mjs`
- `index.html`
- `helper-dashboard-final.html`
- `test/release-regressions.test.mjs`
- `package.json` (version 6.0.0 → 6.0.1)
- `next-deployment-notes-2026-11-01.md` (this file)

## Local verification

- `npm test`: 7 passed, 0 failed.
- `node --check` on every Netlify `.mjs` function: passed.
- Regression coverage: exact image-block resolution and missing-image 404/no-fallback behaviour.
- Both dashboard entry points include the reminder image on login and News, with image-error handling to hide only the unavailable reminder card.
- ZIP integrity and baseline-diff checks are required at packaging.

## Not verified / release gates

- Not deployed to Netlify; no live Notion API image fetch or mobile browser rendering test.
- Existing high-priority staff-level data isolation gap remains unresolved in the source baseline. Do not promote this package to production until that security issue is fixed and verified.
- Notion `Known Fixes` page was not found during preflight.
