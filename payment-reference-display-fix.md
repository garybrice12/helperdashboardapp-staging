# Pay screen — next payment reference display

- Outstanding shifts now show the next sequential payment reference that will include the remaining balance.
- The next reference is derived from the highest numeric reference already allocated in the Earnings Log; it is not hard-coded.
- Paid shifts continue to show the reference and amount already allocated.
- Partially paid shifts retain their latest paid allocation and also show the next reference for the remaining balance.
- Applied consistently to both HTML entry points and the live dashboard-data response.

This is a source-package change only. It has not been deployed to Netlify.
