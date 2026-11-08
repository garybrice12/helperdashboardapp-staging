# Helper Dashboard Security Login Update — Testing Build

This testing build adds searchable staff identity selection, account-specific PIN lockouts, remembered last successful identity, and one-active-session enforcement. See `SECURITY-DEPLOY-NOTES.txt` for setup prerequisites and the test checklist.

**Deploy only to `helperdashapp-testing`. Do not replace the live app until testing is complete.**


## v6.0.3 — Owner earnings in Pay tab — 3 November 2026

- Added a separate **Your earnings** section at the top of the Pay tab.
- Reads the authoritative `Your payout (£)` formula from the Earnings Log. It does not estimate your retained amount from gross or reuse helper payout.
- Shows this-week earnings, calendar-month-to-date earnings, and the 12 most recent shift entries with shift type, gross and your payout.
- Keeps helper payment due, previous/latest payment references and shift-level helper allocations separate.
- Updated both `index.html` and `helper-dashboard-final.html`; updated `dashboard-data.mjs`; added regression coverage.
- Verification: 9 automated tests passed; all Netlify function syntax checks passed.
- Not verified: live Netlify/Notion API response, visual rendering on a physical mobile device, and staff-specific isolation.
- Not deployed.
