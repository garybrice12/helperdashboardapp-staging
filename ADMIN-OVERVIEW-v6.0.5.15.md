# GQDS Helper Dashboard v6.0.5.15 — clearer admin overview

**Status:** Prepared preview candidate; not deployed. The working source was the available v6.0.5.14 package; its identity against the currently published production bundle has not been independently verified. Treat this as a preview candidate only until the production baseline is confirmed.

## Requested layout
The Home/Overview screen keeps the existing Staff Profile and Next Helper Shift sections first. The admin-only combined overview is positioned immediately below both, with three clearly separated areas:

1. **My Activity** — the signed-in owner's weekly and monthly retained earnings, shift count and hours.
2. **Helper Activity** — helper shift count, helper payments made this week and helper pay outstanding on shifts involving the owner.
3. **Combined View** — a compact weekly snapshot of the owner's recorded shifts, hours, retained earnings and related helper payment position.

The admin-only layout replaces the generic weekly summary for administrators. Non-admin staff continue to see the existing weekly summary unchanged. Colour accents distinguish owner activity (blue), helper activity (green) and the combined snapshot (purple). The layout is responsive and uses existing dashboard data fields.

## Scope and preservation
- Presentation-only change in `index.html` and `helper-dashboard-final.html`. The overview appears after Staff Profile and Next Helper Shift; neither section is moved or altered.
- Both dashboard entry points remain byte-identical.
- No Netlify functions, API endpoints, Notion sources, staff permissions, pay formulas, earnings calculations, payment allocation logic or helper-facing content changed.
- The helper metrics are explicitly limited to helper shifts involving the owner; they are not represented as a full all-staff payroll report. A full all-helper business payroll summary would require additional data aggregation and is deliberately outside this presentation-only change.
- Existing admin request management, shift management and session controls are unchanged.

## Verification
- Automated regression suite: 49 passed, 0 failed.
- Added 3 targeted admin-overview tests covering section separation, admin-only visibility, use of existing data fields, unchanged calculation functions and entry-point parity.
- Both HTML entry points contain identical source.
- Inline JavaScript syntax and mobile/desktop visual rendering still require preview validation.

## Deployment
Candidate only. Not deployed. Preserve the current production deployment as rollback. Upload this full package to a Netlify Deploy Preview, test as Gary (admin) and a non-admin helper, inspect mobile and desktop layout, and confirm that the helper-facing dashboard is unchanged. Production deployment requires Gary's explicit approval.


## Placement correction — 5 November 2026
The user clarified that the admin overview must sit below both **Your staff profile** and **Next helper shift**. The preview HTML was reordered accordingly. No other content, calculations, data sources, or behaviour was changed. A targeted regression assertion now checks the section order.
