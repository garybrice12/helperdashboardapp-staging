# Release notes — audited weekly progress, trip boost and Graphic Control icon

- Weekly progress backend returns dated helper rows and week rollups from the Earnings Log.
- Weekly helper hours use the recorded numeric Helper hours value when present and derive hours from Shift time only when numeric hours are missing.
- Trip boost reads the canonical `Helper boost (£)` field and known label aliases; absent values stay unknown, while an explicit zero remains zero.
- Latest completed shift selection uses the latest date and then latest start time for same-day shifts.
- Dashboard graphic, browser favicon, Apple touch icon and installed-app manifest use the named Shift graphic from Notion Graphic Control.
- Old static icon PNG assets are not included.
- See `quality-audit.md` for tests and limitations.

## 23 October 2026 — Historical week selector fix
- Return all dated Earnings Log rows to the client so historical weeks are discoverable.
- Derive week options from helper markers or helper-specific financial/time fields, including older rows with a blank `With helper` checkbox.
- Keep weekly totals restricted to helper-relevant records so solo-only rows are not counted as helper work.
- Verified backend syntax and six regression tests. No deployment performed.
