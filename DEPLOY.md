# Deploy the Helper Dashboard fix

This replaces the Netlify function at `netlify/functions/dashboard-data.mjs`.
It does not change the page, the Ask AI function, or any Notion record.

## Before you deploy

Keep these Netlify environment variables (Functions scope). Do not put them in the repo:

- `NOTION_TOKEN` (required)
- `NOTION_EARNINGS_DATA_SOURCE_ID` (optional; a default is in the function)
- `NOTION_SHIFTS_DATA_SOURCE_ID` or `NOTION_WORK_PLANNER_DATA_SOURCE_ID` (optional)
- `NOTION_HELPER_PAY_SUMMARY_PAGE_ID` (optional)
- `NOTION_OUTSTANDING_DATA_SOURCE_ID` (optional)
- `NOTION_DASHBOARD_PAGE_ID` (optional)

`@netlify/blobs` is already listed in `package.json`. Netlify installs it on deploy. The function only writes the blob after a successful earnings read. It never serves the old blob as current pay.

## Deploy

1. In `garybrice12/helperdashboardapp-staging`, replace `netlify/functions/dashboard-data.mjs` with the file in this zip. The root `dashboard-data.mjs` is the same file, so the two cannot drift again.
2. Commit and push to the branch Netlify publishes for https://helperdashboardapp.netlify.app/.
3. Wait until that production deploy is published. A branch deploy or an old deploy will keep serving the broken function.
4. Open https://helperdashboardapp.netlify.app/api/dashboard-data with the cache bypassed.

## What a good response looks like

- `currentlyOwed` is a number, including `0` when the Helper Pay Summary rollup really is £0.00.
- If the rollup cannot be read, `currentlyOwed` is `null` and `outstandingSyncError` is `true`. It must not be `0` in that case.
- `latestPayment.reference` and `latestPayment.breakdown` match the newest paid helper rows, not reference 40 / 13 September, when a newer payment exists.
- `recentShift.date` is the newest Earnings Log row with With helper checked.
- `recentShift.helperBoost` is the `Helper boost (£)` value and is not added into `helperPay`.
- `currentWeek` includes `weekStart`, `weekEnd`, `shiftCount`, `hours`, `earned`, `paid`, `outstanding` and a calculated `caption`.
- `nextShift.date` is not `2026-09-16`. If nothing upcoming is Confirmed or Live, `nextShift.date` is `""` and `nextShift.day` is `No upcoming helper shift`.
- A failed Earnings Log read returns `dataUnavailable: true` and does not include the September fallback figures.

Live Notion was not called from this repair, so publish and then check the endpoint before trusting the figures.
