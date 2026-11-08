# Combined next-deployment candidate — 3 November 2026

- Candidate version: 6.0.2
- Source image-fix package: `helperdashboardapp-news-preparation-reminder-2026-11-01.zip` (v6.0.1)
- Production baseline: user-confirmed last deployed package `helperdashboardapp-dark-mode-request-card-fix-2026-11-01.zip` (v6.0.0 package metadata; Netlify production deploy 6ae76e722b56fde45e6e644f, 1 Nov 2026 16:53 UTC).
- Baseline SHA-256: `995fff8056e52d4d8f1df0db84508f4bcf21708b417396b72c42c314a85a5386`

## Included changes

1. Restore the Helper Preparation Shift Reminder image as a separate named slot, resolved by exact Notion image block ID `407f475c-d2eb-805b-99cc-fc17a4e77c7a` inside Graphic Control → Home announcement image. It is shown as a separate card on the login screen and News tab; it does not replace the existing News image or Home announcement chart. Missing source returns 404; there is no positional fallback.
2. Preserve the deployed dark-mode submitted-request card correction in both dashboard entry points, using theme-aware `--border` and `--surface` tokens.

## Changed files

- `netlify/functions/dashboard-image.mjs` (reminder named slot restored from v6.0.1 candidate)
- `index.html` (reminder cards restored; dark-mode tokens retained)
- `helper-dashboard-final.html` (same)
- `test/release-regressions.test.mjs` (combined reminder and dark-mode regression coverage)
- `package.json` (version 6.0.2)
- `next-deployment-notes-2026-11-03.md` (this file)

## Staff-specific data isolation — blocking issue

This package does not yet include verified staff-specific filtering for Work Planner shifts, Earnings Log/payments, or Crew members attribution. The currently available source package does not contain the claimed v6.0.4 implementation. The 27 October identity review also records that Work Planner and Earnings Log lacked Staff Profile relations and that the dashboard endpoint returned a general payload. Do not deploy this package to helpers until staff-level isolation and attribution are implemented against the current Notion schema and tested for helper/admin sessions.

## Verification

Local tests, function syntax checks, source assertions, baseline diff, and ZIP integrity are recorded separately after execution. Live Notion API image retrieval, live helper/admin session isolation, and mobile visual rendering remain unverified until staging checks are performed.

## Deployment

Candidate only — not deployed. Gary retains manual deployment approval. Keep the exact baseline ZIP untouched.


## v6.0.3 — Owner earnings in Pay tab — 3 November 2026

- Added a separate **Your earnings** section at the top of the Pay tab.
- Reads the authoritative `Your payout (£)` formula from the Earnings Log. It does not estimate your retained amount from gross or reuse helper payout.
- Shows this-week earnings, calendar-month-to-date earnings, and the 12 most recent shift entries with shift type, gross and your payout.
- Keeps helper payment due, previous/latest payment references and shift-level helper allocations separate.
- Updated both `index.html` and `helper-dashboard-final.html`; updated `dashboard-data.mjs`; added regression coverage.
- Verification: 9 automated tests passed; all Netlify function syntax checks passed.
- Not verified: live Netlify/Notion API response, visual rendering on a physical mobile device, and staff-specific isolation.
- Not deployed.
