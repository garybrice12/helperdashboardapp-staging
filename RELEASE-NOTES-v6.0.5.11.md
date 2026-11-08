# Helper Dashboard v6.0.5.11 — combined shift, earnings and crew-management fixes

**Status:** Candidate package; not deployed.

## Included fixes

1. **Shift request status:** Request cards resolve the linked Work Planner status, so a completed shift shows Completed rather than the original Available request value. Existing Approved/Declined decision and submission date remain visible. Admin completion refreshes request and dashboard data.
2. **Personal shift attribution:** Pay history, recent shift, weekly Home summary and payment balances now include only Earnings Log entries matched to a Completed Helper Shifts record whose actual `Crew members` relation contains the authenticated Staff Profile. Planned `Staff Profile` assignment is not treated as proof that somebody worked.
3. **Correct personal payout:** On helper shifts, the assigned helper sees their calculated helper entitlement; a driver/owner who is also in the actual crew sees `Your payout (£)` (retained earnings). Helper payments due remain a separate amount.
4. **Recent earnings history:** The Pay tab shows up to 12 recent shifts from the authenticated user's actual completed-shift history, rather than the latest row attributed to a different profile.
5. **Home weekly summary:** Worked shifts, hours, earned amount, helper payments and outstanding are scoped to actual crew membership. Helper hours use the helper's recorded hours; the driver/owner uses the full shift duration. Admin status does not broaden personal totals to the whole business ledger.
6. **Upcoming crew visibility:** The Home Next Helper Shift card and Available Work cards show names allocated through the Work Planner `Staff Profile` relation.
7. **Admin crew controls in Available Work:** Admins get an Assign Crew editor on eligible shift cards. It supports multiple active Staff Profiles and unassigning all crew. Changes are written server-side to Work Planner `Staff Profile`; the endpoint checks the signed-in current admin session and validates active, non-suspended profiles. Removing the final helper from a Confirmed upcoming shift returns it to Available. Completed and Cancelled shifts cannot be edited.
8. **Actual attendance remains separate:** Completed-shift `Crew members` remains the authoritative actual attendance relation. In Admin shift management, selecting Completed requires an explicit multi-select of the people who actually worked; the endpoint validates those Staff Profiles, writes `Crew members` to the Work Planner record and copies it into the Completed Helper Shifts archive. Editing planned `Staff Profile` assignments does not alter completed attendance or historical earnings.

## Data integrity behaviour

- Earnings Log rows are joined to completed shifts by date and overlapping actual/planned shift times. Duplicate identical completed-shift archive records are collapsed.
- If the date/time match is ambiguous, no crew is attributed. This fails closed rather than assigning earnings to the wrong person.
- Earnings Log rows without an actual `Crew members` match are excluded from personal earnings and surfaced as an admin attribution warning.
- A known legacy record needs review: the 1 November 2026 helper shift currently has an empty `Crew members` relation. It will not be attributed to Gary or Jay until the actual crew is recorded. The 2 November solo and 3 November helper shifts have actual crew relations and are included for the profiles recorded there.

## Files changed

- `netlify/functions/dashboard-data.mjs`
- `netlify/functions/admin-shift-management.mjs`
- `index.html`
- `helper-dashboard-final.html` (kept byte-identical to `index.html`)
- `test/release-regressions.test.mjs`
- `package.json`
- This release note and deployment instructions

## Verification performed

- Automated regression suite: **41 passed, 0 failed**.
- All Netlify function `.mjs` files: syntax checks passed.
- Both HTML entry points: all inline JavaScript syntax checks passed.
- `index.html` and `helper-dashboard-final.html`: byte-identical.
- ZIP integrity and SHA-256 recorded at packaging.

## Not verified

- Live Netlify/Notion API behaviour for the new staff-directory and completed-shift queries.
- Live admin assignment writes against the production Notion database.
- Android/mobile visual rendering and end-to-end helper/admin sessions.

## Deployment

Candidate only. Preserve current production deployment as rollback. Deploy to a Netlify preview first, then test as Gary (admin) and Jay (non-admin). Do not publish to production without Gary's explicit approval.
