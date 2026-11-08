HELPER DASHBOARD v6.0.5.12 — MOBILE BOTTOM CLEARANCE FIX

Based on the deployed v6.0.5.11 package.

Change:
- Increased body bottom scroll clearance from 88px to 160px, while retaining env(safe-area-inset-bottom), in both dashboard entry points.
- This reserves enough scroll space for the two-row fixed navigation (News, Admin, Home, Available Work, Shifts, Pay and Tools), so the final Home/Available Work card content can scroll fully above the fixed navigation on mobile.
- No navigation dimensions, card layout, data logic, Notion properties, or other UI styling changed.

Verification:
- Both HTML entry points remain byte-identical.
- Regression test asserts the 160px clearance in both entry points.
- Full automated test suite and JavaScript syntax checks are run for this package.
- Android visual verification remains pending until deployed.

Deployment: deploy as a full Netlify package including Functions. Keep current production deploy available for rollback.
