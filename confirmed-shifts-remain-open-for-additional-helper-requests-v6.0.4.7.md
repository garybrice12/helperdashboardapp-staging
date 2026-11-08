# Confirmed shifts remain open for additional helper requests — v6.0.4.7

## Behaviour
- New request form now lists shifts with status Available, Confirmed, or Live.
- Confirmed shifts remain requestable so additional staff can request to join an already scheduled shift.
- POST validation accepts Confirmed shifts for new requests as well as Available and Live shifts.
- Change/cancellation request eligibility remains Available, Confirmed, and Live.
- Form copy explains that Confirmed means scheduled, not closed to additional crew requests.
- Both dashboard entry points are updated.
- Existing authenticated staff session and server-side request validation remain in place.

## Important workflow
- Available: open for requests.
- Confirmed: scheduled/at least one allocation may exist, but further crew requests remain open.
- Live: shift underway; request eligibility remains as existing behaviour.
- Completed: shift finished; not requestable.

## Verification
- Automated regression tests cover form filtering and server-side POST acceptance for Confirmed shifts.
- Netlify function syntax checks and both dashboard inline JavaScript syntax checks passed.
- ZIP integrity passed.
- Not deployed; live request submission/approval workflow remains to be verified after deployment.
