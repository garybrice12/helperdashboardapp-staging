# Priority fixes: Next Shift and Current Week

## Changes in this package
- Work Planner Status properties now support Notion's `status` property type as well as `select`. This addresses shifts being skipped when Status is configured as a Notion Status property.
- Shift selection and weekly date boundaries now use the `Europe/London` calendar date rather than UTC, avoiding date-boundary errors for UK shifts.
- Existing dashboard layout and unrelated features were not changed for this patch.

## Test performed
- `node --check` passed for `netlify/functions/dashboard-data.mjs`.
- A local mocked-Notion test passed: a `Live` helper shift on 16 October 2026 was selected; one helper earnings row for the week populated shift count, hours, earned, paid, and outstanding.

## Not yet verified
- This was a local mock test, not a live Notion API test.
- Nothing has been deployed to Netlify. Production is unchanged.
- The live screenshot's September 16 fallback suggests the deployed site may still be serving older function code; a staging deploy is required to verify the fix against real Notion records.
