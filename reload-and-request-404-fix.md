# Full reload and shift request 404 diagnostics — 25 October 2026

- Header refresh now performs a cache-busting full document navigation to the current URL, preserving the current hash/screen.
- Sign-out clears the login box state and then navigates to a cache-busting URL with `#login-view`, so the sign-in form is restored even without a manual refresh.
- Shift request creation tries configured source/database IDs first and then canonical IDs verified from the Helper Shift Requests data source, helping recover from stale Netlify environment variables.
- If all creation parents return 404, the API error now includes the last Notion status/code/message/request ID detail (bounded length) to help identify inaccessible or incorrect destination IDs.
- Not deployed. Notion's live write permission still must be tested after deployment; a 404 caused by missing integration access cannot be fixed by front-end code alone.
