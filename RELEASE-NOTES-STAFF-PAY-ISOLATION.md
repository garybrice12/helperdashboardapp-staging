# Helper Dashboard v6.0.4.1 — staff-specific progress and pay

Date: 3 November 2026
Status: Prepared candidate; not deployed.

## Baseline

Built from the supplied user-confirmed deployed baseline package:
`helperdashboardapp-recent-completed-shift-staff-filter-v6.0.3.1-2026-11-03.zip`.
The baseline package remains unchanged.

## Changes

- Staff sessions are scoped to Earnings Log rows whose `Staff Profile` relation contains the authenticated Staff Profile page ID.
- Helper `Current-week progress` is calculated only from that helper's linked shifts.
- Helper `Latest payment`, previous payment, payment breakdown, payment due list, outstanding total and next payment reference use only that helper's linked Earnings Log rows.
- Helper sessions do not fall back to the global Helper Pay Summary rollup, preventing another helper's outstanding amount from appearing.
- The `Your earnings` section is scoped to the signed-in profile's own `Your payout (£)` entries.
- Admin sessions are detected from the authenticated Staff Profile's `Admin Access` checkbox and retain the full helper ledger/current-week overview.
- The Recent Completed Shift remains scoped to the signed-in profile, including solo shifts.

## Files changed

- `netlify/functions/dashboard-data.mjs`
- `test/release-regressions.test.mjs`
- `package.json`
- This release note.

No dashboard HTML or CSS was changed.

## Verification

- Automated regression tests: 13 passed, 0 failed.
- All Netlify function `.mjs` syntax checks passed.
- Both dashboard HTML files' inline scripts parsed successfully (2 each).
- ZIP integrity check passed.
- Notion live API response and helper/admin device acceptance tests remain unverified.

## Acceptance test after deployment

1. Sign in as Helper A: Current-week progress, latest/previous payments, outstanding amount and payment breakdown show only Helper A's linked Earnings Log rows.
2. Sign in as Helper B: same screens show only Helper B's linked rows, with no Helper A records.
3. Sign in as an Admin Access profile: full helper ledger and overall helper current-week view remain available.
4. Confirm the 2 November solo shift remains visible to Gary's own profile in Recent Completed Shift and in Your earnings, without being counted as a helper shift.

## Deployment

Not deployed. Gary will deploy manually. Preserve the current production deployment as rollback.
