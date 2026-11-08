# GQDS Helper Dashboard v6.0.5.0 — Shift Management Candidate
Date: 3 November 2026
Base: supplied v6.0.4.7 package. Candidate only; not deployed.

## Included
- Available Work lists upcoming Work Planner shifts across Available, Confirmed, Live and Cancelled statuses; Completed shifts are excluded.
- Home Next Helper Shift is selected chronologically regardless of status and displays the actual Work Planner status.
- New shift requests are restricted to Available shifts in the client form and server-side POST validation.
- Admin-only tab provides a submitted-request inbox with links that open the original Notion request, plus Work Planner status controls.
- Admin endpoint checks authenticated session, active/non-suspended staff profile, Admin Access, and same-origin POST requests.
- Changing a shift to Completed creates a record in Completed Helper Shifts with schedule, targets, actuals, crew, payment status, and a reference to the source page, then archives (does not delete) the original Work Planner page. Existing relation references therefore remain resolvable.
- Completion archiving is retry-safe by checking the archive Reference for the source page URL before creating a duplicate.
- Existing change and cancellation request types remain available for confirmed/live shifts. They do not change the shift until admin review in Notion.

## Verification
- Automated regression suite: 24/24 passing.
- Netlify function syntax: 11/11 passing.
- Inline JavaScript syntax: both dashboard entry points checked.
- Both dashboard HTML entry points are synchronized.
- Not verified: live Netlify/Notion API execution, actual admin/helper sign-in behaviour, live archive transaction, and mobile visual rendering. Requires staging deployment and live integration test.
- Not deployed. Production site remains unchanged.

## Follow-up correction from staging screenshots
- Admin request inbox now filters to requests submitted in the last 7 days.
- Admin Shift Management now shows Work Planner shifts dated today through the next 7 days and excludes Completed records. Cancelled remains visible with its status.

## v6.0.5.1 — Refresh on tab selection
- Selecting Home, Available Work, Shifts or Pay refreshes dashboard data from the live endpoint.
- Selecting Admin refreshes the recent request inbox and seven-day Work Planner list.
- Selecting Shifts also refreshes available request options and the signed-in helper's submitted requests.
- Selecting News refreshes the latest news message.
- Refresh uses fetch requests without a full page reload; session and current view are preserved.

## v6.0.5.7 — Staff request history date window

- Staff-facing **Your shift requests** now returns only requests containing at least one selected Work Planner shift dated from 3 days before the current UK date through 7 days after it (inclusive).
- For multi-shift submissions, only in-window shifts are included in the visible request card; an older/future-outside-window shift in the same submission is not exposed in the list.
- Results remain scoped to the authenticated staff identity and are capped at the 10 most recently submitted matching requests.
- Server-side filtering is applied before returning the data; this is not merely a client-side display limit.
- Notion request records are not deleted or modified. Older requests remain in Notion for admin records/audit.
- Verification: automated tests 33/33; helper-requests function syntax and all Netlify function syntax checks; ZIP integrity; both dashboard HTML entry points unchanged from baseline.
- Not deployed. Live Notion API and mobile rendering remain unverified.
