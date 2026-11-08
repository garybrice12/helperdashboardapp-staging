# Account login lockout escalation — v6.0.4.5

## Required per-account sequence
- 1st and 2nd incorrect attempts: no lockout; display remaining attempts.
- 3rd incorrect attempt: 15-minute lockout.
- After the 15-minute lockout expires, the next three incorrect attempts trigger a 1-hour lockout.
- After the 1-hour lockout expires, the next three incorrect attempts trigger a 24-hour lockout.
- After the 24-hour lockout expires, the next three incorrect attempts trigger a permanent account lockout.
- Permanent account lockout can only be cleared by an administrator using the manual account override / Restore access + clear lockout action.
- Any successful login resets the per-account failed-attempt sequence to zero and clears temporary/permanent account lockout state.
- Attempts made while an account is locked do not increment the next stage; the sequence resumes only after expiry.
- The existing network/IP-wide protection remains a separate additional safeguard and does not replace the per-account sequence.

## Implementation
- Extracted deterministic `nextAccountLockout` helper to make escalation stages explicit.
- Preserved successful-login reset before session creation.
- Preserved administrator manual reset path in staff-session-admin.
- User requested this exact sequence before deploying the combined vehicle-cost and staff-access fixes.

## Verification
- 18 automated regression tests passed, including the four 3-attempt stages and successful-login reset.
- Netlify function syntax checks and both dashboard inline-script syntax checks passed.
- ZIP integrity passed.
- Not deployed; live API/device behavior remains unverified.
