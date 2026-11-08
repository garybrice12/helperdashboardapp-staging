# Shift payment status ordering fix — 31 October 2026

The weekly Pay-tab shift breakdown is now sorted by shift date ascending, then actual shift start time ascending. This prevents shifts on the same date from being ordered by the upstream Earnings Log view's secondary outstanding-balance sort. Payment amounts, allocation references, status calculations, totals, labels, and all other dashboard behaviour are unchanged.

Rows with an unparseable or missing shift start time follow timed rows for the same date; rows without times retain their relative source order.

Source-package change only. Not deployed.
