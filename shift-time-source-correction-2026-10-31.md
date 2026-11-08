# Actual shift-time source correction — 31 October 2026

**Change:** Payment breakdown time labels now use only the Earnings Log `Shift time` property. This field is explicitly defined in the Notion schema as the actual shift start and finish time (example: `17:04–21:00`). The code no longer extracts a time range from free-text Notes as a fallback. If `Shift time` is blank, no time is displayed; planned Work Planner windows are never substituted.

**Verified source records:**
- 29 October helper shift: `17:04–20:16` (3h 12m)
- 30 October helper lunch: `10:57–14:17` (3h 20m)
- 30 October helper evening: `17:01–20:37` (3h 36m)

**Files changed in this correction:** `netlify/functions/dashboard-data.mjs`, `test/release-regressions.test.mjs`; this note added. Existing shift payments, amounts, references and statuses are not modified.

**Checks:** `npm test`; Node syntax check for all Netlify functions; inline script syntax checks for both HTML entry points; ZIP integrity. Not deployed. Live mobile rendering remains unverified.
