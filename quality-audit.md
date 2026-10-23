# Quality audit — 23 October 2026

Changes in this package:
- Week selector options are derived from every dated Earnings Log row, not only rows passing helper-pay eligibility checks. This allows historical weeks to be selected even when legacy records have incomplete helper flags.
- Replaced the native HTML select with an in-page anchored listbox. On Android, the native select previously opened as a centered system overlay; the custom list stays attached to the Select week control.
- Weekly breakdown now uses the actual recent completed shift as a fallback when the current-week API rows are empty, avoiding contradictory £0/0 trips while the shift card has real values.
- Existing backend property mapping and regression tests retained.

Validation performed locally:
- ZIP integrity check.
- `node --check` on dashboard-data.mjs.
- `node --check` on the inline dashboard script.
- `node --test tests/dashboard-data.test.mjs` — 6 passed.

Limitations:
- Live Notion API could not be reached from this execution environment, so live historical-row retrieval and actual Graphic Control image rendering are not certified here.
- No deployment was triggered.
