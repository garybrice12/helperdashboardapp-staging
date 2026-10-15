# Helper Dashboard — live-data update

## Changes in this build
- Replaced the fixed September shift and weekly images with data-driven shift and Monday–Sunday weekly graphics.
- Reads upcoming confirmed/live helper shifts from Work Planner — Shifts (`5f05970c-fcc0-497b-aa62-3e8edefbbb2b`). Available shifts are not presented as confirmed.
- Reads helper earnings, paid amounts, payment dates and outstanding amounts from Earnings Log (new) (`46678020-e282-4699-96bc-c4db27d3af56`).
- Calculates the all-time outstanding balance and current-week helper summary from the existing records.
- Uses the latest recorded shift time and payment data, rather than September placeholder details.
- Replaced the emoji brand mark and PWA icon with the Gary’s Quick Delivery Service emblem.
- If the Notion data connection fails, the page shows a sync-unavailable state instead of displaying stale example figures as live.
- Kept the existing navigation tabs and the Delivery Counter / AI entry points unchanged.

## Netlify environment variables
Required for live Notion data:
- `NOTION_TOKEN` — a private Notion integration token with access to both data sources above.

Required for the in-dashboard AI assistant:
- `OPENAI_API_KEY`

Optional:
- `NOTION_EARNINGS_DATA_SOURCE_ID` (defaults to the Earnings Log ID above)
- `NOTION_SHIFTS_DATA_SOURCE_ID` (defaults to the Work Planner ID above)
- `NOTION_DASHBOARD_PAGE_ID` (defaults to the Helper Dashboard page)
- `DASHBOARD_UPDATE_TOKEN` only if using the separate protected dashboard update endpoint.

Do not put tokens in HTML or commit them to Git. Preserve existing Netlify environment variables when deploying.

## Validation performed
- `node --check` passed for `netlify/functions/dashboard-data.mjs`.
- Inline JavaScript syntax check passed for `index.html`.
- A mocked Notion API smoke test passed for next-shift mapping, upcoming-shift filtering, weekly totals, latest payment and all-time outstanding calculations.
- Static September graphic references were removed from the active `index.html`.

## Not yet verified
- The deployed Netlify environment’s actual `NOTION_TOKEN` and `OPENAI_API_KEY` values and permissions were not accessible from this build workspace.
- No production deployment was performed. Test the staging deploy against the live Notion records before promoting it to production.


## Helper Pay Summary outstanding source
- The all-time dashboard outstanding figure now reads the `Total outstanding (£)` rollup from the `Current helper outstanding` page in the Helper Pay Summary database (page ID `3f9f475c-d2eb-81ae-812f-e65f142fc1c1`).
- The earnings log remains the source for shift detail, payment breakdowns, and current-week statistics.
- If the summary rollup cannot be retrieved or is not numeric, the API reports live data unavailable rather than silently reverting to the old recalculated historical shortfall.
- Optional environment variable: `NOTION_HELPER_PAY_SUMMARY_PAGE_ID`; defaults to the page ID above.
