# Light-mode earnings contrast and staff-specific weekly solo shift progress — v6.0.4.6

## Changes
- Light-mode Pay tab earnings totals now use the theme's foreground and muted text colours, so values remain visible on the light card. Dark-mode styling remains unchanged.
- Current-week progress now includes all Earnings Log shifts attributed to the authenticated Staff Profile, both solo and with-helper.
- Solo shift earnings use that row's `Your payout (£)` (the recorded personal payout); helper shift earnings use the helper entitlement.
- Weekly progress now reports total shifts, solo shift count, helper shift count, total duration, earned amount, helper payments received/paid in the week, and outstanding helper amounts.
- Solo duration uses the recorded `Shift duration`; where unavailable, duration is derived from actual shift time. Helper shifts use recorded Helper hours where present, with time fallback.
- The current-week panel uses the authenticated profile's own rows for admins as well as helpers; admin-wide helper payment ledger remains unchanged.
- Staff isolation remains based on the Earnings Log `Staff Profile` relation.

## Verification
- 19 automated regression tests passed.
- All Netlify function syntax checks passed.
- Both dashboard entry points' inline JavaScript syntax checks passed.
- ZIP integrity passed.
- No live Netlify deployment or device visual test performed. Not deployed.
