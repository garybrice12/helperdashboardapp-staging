# Staff login lockout and admin access controls — v6.0.4.4

## Findings
- Account lockout is not triggered by one failed PIN attempt. The account thresholds are 3 failures (15 minutes), 6 (1 hour), 9 (24 hours), and 12 (permanent until administrator reset). Failure counts persist until successful sign-in or administrator reset; a failed attempt can therefore trigger a lock if earlier failures are already stored.
- A separate network/IP lockout applies after 20 failed attempts from that network for 15 minutes.
- The Restore access action previously only cleared the Access Suspended property and revoked sessions; it did not clear the account lockout. The UI presented lockout override as a separate action, making this confusing.
## Changes
- Restore access now also clears the selected staff member's account-level login lockout and revokes old sessions.
- Restore action is available even if access is already marked allowed, so an administrator can clear the selected account lockout and confirm access.
- Admin staff selector now shows account lockout state and expiry alongside login status.
- Button label changes to make the action explicit: Restore access + clear lockout / Clear lockout + confirm access.
- Separate account-lockout-only control is labelled clearly.
- Incorrect PIN response now reports attempts remaining before the next lockout threshold.
## Limitations
- Network/IP-wide lockout is separate and is not cleared by restoring one staff account. The global override remains a separate administrator action.
- Live Netlify/API and device tests have not been performed. Not deployed.
## Verification
- 17 automated tests passed.
- All Netlify function syntax checks passed.
- Inline scripts in both dashboard entry points passed syntax checks.
- ZIP integrity passed.
