# Helper Dashboard v6.0.5.14 — completed request history and clearer admin controls

**Status:** Prepared preview candidate; not deployed.

## Fix 1 — completed shift requests
- Active, pending, change-requested and upcoming/in-progress requests remain in the main request list.
- Requests whose linked shift(s) are all Completed and dated within the last three UK-local calendar days are moved into a collapsed **Completed requests — last 3 days** section.
- Applied to both the signed-in helper's **Your shift requests** list and the Admin **Submitted requests** list.
- Each request expands inline to show its full summary. Admin request summaries now include submitted pickup details, pickup time, drink/food preferences, preferred times, other information, selected shifts and current linked Work Planner status. The existing Open in Notion link remains available to admins.
- Multi-shift requests remain in the active list until every selected shift is Completed; older completed requests are not shown in the recent-completed section.

## Fix 2 — admin access controls
- Grouped individual account actions with plain-language explanations and explicit selected-staff scope.
- Moved all-staff sign-out and global lockout clearing into a collapsed Advanced section, clearly identifying their wider impact.
- Preserved existing action IDs, server endpoints, confirmation prompts, reason requirements, access rules and audit behaviour.

## Files changed
- `index.html` and `helper-dashboard-final.html` (kept byte-identical)
- `netlify/functions/admin-shift-management.mjs` (complete request-summary construction)
- `package.json` (version 6.0.5.14)
- `test/request-summary-regression.test.mjs` (new regression checks)
- This release note

## Verification
- Full automated regression suite: **46 passed, 0 failed**.
- All Netlify function `.mjs` syntax checks: passed.
- Both dashboard HTML files: two inline scripts each parsed successfully; entry points byte-identical.
- ZIP integrity and SHA-256: recorded at packaging.
- Mobile visual test and live Notion/Netlify preview test: not performed.

## Deployment
Candidate only. The current production deploy was confirmed as `6aeb41c9a704977da2099762` (ready, published 4 November 2026 14:31:55 UTC). No deployment action is exposed by the connected Netlify tools in this session, so this candidate has not been uploaded to a Netlify preview or production. Deploy to a Netlify preview first; verify completed request history and summary details as both helper and admin, then test all individual and global access controls. Do not promote to production without explicit approval after preview acceptance.
