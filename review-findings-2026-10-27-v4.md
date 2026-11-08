# Review v4 findings — 27 October 2026

Derived from review v3. Not deployed.

## Fix in v4
- Staff session admin now reads Notion `Staff Status` when its property is a `select` or `status` field, rather than treating it as empty.
- Missing status is displayed as `UNKNOWN`, never defaulted to `Active`. This prevents the admin list from falsely showing a missing status as active.

## Validation
- ZIP integrity checked.
- Netlify function JavaScript syntax checks performed.
- Static review only; live Notion and Netlify Blobs tests still require a safe deployed preview and configured secrets.
