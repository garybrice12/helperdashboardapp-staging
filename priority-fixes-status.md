# Priority fixes: historical week selector and duplicate display

## Changes in this package
- Week selector options are built from all dated helper Earnings Log rows returned by the paginated API, with year shown on both ends of each week label.
- Notion Earnings Log page IDs are included in the weekly payload; repeated page IDs are filtered before weekly totals are calculated.
- Removed the duplicate summary of shift count/earned/paid/outstanding from the graphic footer. The stat tiles are the single presentation of those figures.
- Kept the existing weekly breakdown and current-week default.

## Local checks performed
- `node --check netlify/functions/dashboard-data.mjs` passed.
- Inline JavaScript in `index.html` and `helper-dashboard-final.html` parsed successfully.

## Verification limits
- This patch is based on the recovered `helperdashboardapp-latest.zip`, not a fresh GitHub checkout; the connected GitHub repository was not accessible through the current integration.
- No live Notion API test or Netlify deployment was performed. Historical weeks will appear only where dated helper earnings records are returned by the connected data source.
