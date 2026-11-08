# Owner weekly summary includes helper-shift retained earnings — 3 November 2026

## Problem
The Home dashboard weekly summary used profile-filtered rows for all users. In the administrator view this omitted helper shifts assigned to helper profiles. Simply adding those rows would have incorrectly counted helper entitlement as owner earnings.

## Change
- Admin/owner weekly summary now reads the full Earnings Log.
- Admin/owner “Earned” uses `Your payout (£)` for every shift, i.e. the owner's retained amount.
- Helper payments and helper outstanding remain separate metrics.
- Non-admin staff continue to receive only their own profile-filtered rows; helper shifts use helper entitlement in their personal weekly summary.

## Expected figures for 2–8 November 2026
- 2 shifts: 2 November solo £71.64 + 3 November helper retained £37.24.
- Owner earned: £108.88.
- Helper payments this week: £0.00.
- Outstanding helper payment: £33.16.
- Staff-specific view remains isolated to the logged-in profile.

Candidate v6.0.5.10. Production deployment not performed.
