# Helper Dashboard v6.0.5.9 — request status and owner earnings — 3 November 2026

## Changes

- Shift request cards now show the current linked Work Planner status in the status line. A completed linked shift displays `Completed` instead of the requester's original availability response (`Available`). Mixed multi-shift requests show a per-status count. The request decision (`Approved`, etc.) and submitted date remain visible.
- After an administrator marks a shift `Completed`, the app refreshes the helper's request cards and dashboard data so the status and earnings views update without requiring a manual page reload.
- The administrator/owner `Your earnings` summary now aggregates the full Earnings Log's `Your payout (£)` values, including helper shifts where the Staff Profile relation is assigned to the helper. Non-admin staff remain restricted to rows attributed to their own Staff Profile. Helper payment due remains a separate ledger calculation.

## Acceptance example — 3 November 2026

- 2 Nov solo retained payout: £71.64.
- 3 Nov helper-shift retained payout: £37.24.
- This-week owner earnings: £108.88 across 2 shifts.
- 1 Nov helper-shift retained payout: £22.03.
- November-to-date owner earnings: £130.91 across 3 shifts.
- Helper payment due for the 3 Nov shift remains £33.16; it is not added to or subtracted from the owner's payout twice.

## Files changed

- `netlify/functions/dashboard-data.mjs`
- `index.html`
- `helper-dashboard-final.html`
- `test/release-regressions.test.mjs`
- `package.json`
- This release note

## Verification

Pending local regression tests, function syntax checks, inline script syntax checks, diff review and ZIP integrity. Live Netlify/Notion and Android rendering require manual deployment and device verification.

## Deployment

Candidate only. Not deployed. The production deployment remains unchanged until Gary explicitly approves deployment.
