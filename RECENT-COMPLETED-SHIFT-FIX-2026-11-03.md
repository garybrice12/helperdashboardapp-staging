# Helper Dashboard v6.0.3.1 — recent completed shift staff filtering

## Defect
The Shifts tab showed a globally selected recent helper shift (1 November) instead of the signed-in staff member's latest completed shift. The selector only considered Earnings Log rows with `With helper = true` and did not scope them to the authenticated staff profile.

## Fix
- Read the `Staff Profile` relation IDs from each Earnings Log record.
- Pass the authenticated Notion Staff Profile page ID from `requireStaffSession` into the dashboard data builder.
- Select the latest dated Earnings Log row attributed to that exact profile, regardless of whether it is a solo or helper shift.
- Keep helper-only payout and boost values null for solo shifts; do not expose another helper's shift as the signed-in user's recent shift.
- Rename the card metric label from `Helper time` to `Shift duration` in both dashboard entry points.

## Acceptance record checked
Gary's 2 November solo Earnings Log row is dated `2026-11-02`, has 16 trips, £92.53 gross, 67.4 miles, shift time `09:57–16:14`, and Staff Profile relation `3faf475c-d2eb-81c2-ad62-df8d82f0a1b7`. The matching Completed Helper Shifts row is marked Completed and Crew = Solo, with Crew members linked to the same profile.

The 1 November helper Earnings Log row is linked to a different Staff Profile and must not be selected for Gary's login.

## Verification
- Automated tests: 11 passed, 0 failed.
- Netlify function syntax checks: passed.
- Both dashboard HTML inline-script syntax checks: passed.
- ZIP integrity: to be recorded after packaging.

## Limitations
Local source and regression tests only. Live Netlify API response and mobile visual rendering have not been verified. Not deployed. Preserve the currently deployed package as rollback.
