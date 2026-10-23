# Selector fix audit — 23 October 2026

## Root cause addressed
The API previously returned only Earnings Log rows with `With helper` checked. That excluded historical rows where helper activity was recorded but the checkbox was blank/unchecked, preventing those weeks from appearing in the week selector.

## Changes
- `dashboard-data.mjs` now returns every dated Earnings Log row in `weeklyRows` so the client can discover historical week options.
- The selector discovers weeks from rows explicitly marked as helper or carrying helper-specific hours, payout, paid, or outstanding amounts.
- Weekly calculations filter to helper-relevant rows, preventing solo-only entries from inflating helper totals.
- Paid rows are also limited to helper-relevant records.

## Verification
- `node --check netlify/functions/dashboard-data.mjs`: passed.
- `node --test tests/dashboard-data.test.mjs`: 6 passed, 0 failed.
- This does not verify live Notion data or deployed behavior; no deployment was performed.
