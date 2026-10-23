# Consolidated Helper Dashboard deployment

Included in this build:
- Current GQS icon assets and manifest branding.
- Live shift graphic keeps its full content visible, with a blurred fill backdrop so the surrounding box is filled without cropping the shift details.
- Bottom navigation label changed from More to Tools.
- Tools includes Delivery Counter, Restaurant Timer link, and Ask AI. The Restaurant Timer link opens the existing Notion timer test page; this is a link, not a full native integration.
- Completed helper pay is calculated before the signed Helper adjustment, while payment/outstanding figures continue using the actual payout and payment records.
- Weekly helper hours derive from recorded decimal hours or the logged 24-hour shift-time range.
- AI now reads the live `/api/dashboard-data` endpoint, prioritises response-deadline questions before generic shift questions, and avoids stale hard-coded fallback dates/pay. Missing response deadlines or pay estimates are reported as unavailable rather than invented.

## Before deploying
- Keep existing Netlify environment variables.
- Ensure the NOTION_TOKEN integration can access Work Planner, Earnings Log, Graphic Control, and Helper Pay Summary.
- The AI pay estimate will not invent a planned amount if Work Planner lacks enough confirmed data.
- The Restaurant Timer link currently opens the existing Notion test page. Full integration of its standalone HTML into the dashboard is not included because its source package was not present in the recovered dashboard folder.


## Login and support additions
- Added server-side PIN validation against the Staff Profiles data source and an HttpOnly signed session cookie function.
- Added a staff profile card in Home after sign-in.
- Added WhatsApp support and a feedback form that writes to the Notion feedback inbox.
- See CONNECTIONS-TO-CHECK.txt for the exact Notion pages and Netlify environment settings to verify.
- Per-helper shift-request filtering remains unimplemented and is called out explicitly in the connection notes.

- Added a signed-in “Your shift requests” panel and server endpoint that returns only exact normalized-name matches for the authenticated staff profile. The Notion request database lacks a Staff Profile relation, so this is not equivalent to relation-based identity isolation.


## Weekly progress and pay clarity update
- Added a Monday–Sunday week selector to Current-week progress, defaulting to the current UK week. Selecting a prior week updates the main weekly totals and breakdown from the Earnings Log rows returned by the live dashboard function.
- Added a collapsed-by-default Weekly breakdown with average gross per shift, average gross per hour, trips, trips per hour, gross generated, estimated fuel at £0.30/mile, recorded trip boosts, and unpaid helper shifts.
- The dashboard data function now returns the helper Earnings Log rows needed for historical week selection; live Notion remains the source of truth.
- Removed the duplicate Currently Owed card from Pay; latest payment history and the Helper Day Pay Agreement remain.
- Reduced the shift graphic height while keeping the image fully visible with `object-fit: contain`.
- No production deploy or Notion record changes were made.

## 23 October 2026 — weekly selector and duplicate-summary patch
- Rebuilt the week selector options from all dated helper Earnings Log records returned by the paginated dashboard endpoint; week labels now include the year on both dates.
- Added Notion page IDs to weekly rows and suppresses repeated IDs in the browser before totals are calculated, preventing duplicate copies of the same Notion record from inflating totals.
- Removed the repeated weekly totals sentence from the graphic footer; the stat tiles remain the single display of weekly totals, and the footer now describes the data source or reports an empty week.
- Local validation: `node --check netlify/functions/dashboard-data.mjs` passed; inline scripts in both HTML entry files parsed successfully.
- Limitation: built from the recovered ZIP, not a fresh checkout of GitHub. Live Notion data and Netlify deployment have not been verified in this session.
\n\n## 2026-10-23 — Earnings sync repair\n- A failure to read Earnings Log no longer causes the entire dashboard API to return the generic unavailable payload.\n- The API now marks `earningsSyncError` and returns a specific, safe message directing the operator to verify that the Notion integration behind `NOTION_TOKEN` has been granted access to the Earnings log data source.\n- Existing weekly rows still come only from live Notion data; no sample or fabricated earnings are inserted.\n

## 2026-10-23 — Graphic Control image source fix
- The current-shift graphic is now selected by the exact `Shift graphic` toggle in Notion Graphic Control, rather than selecting the second image on the page (which was the demand-chart reference).
- Header icon, browser icon, and shift graphic now use the Graphic Control image endpoint.
- The dashboard header displays `Sync issue` when the API reports a partial Notion sync failure.


## Main logo correction — 23 October 2026
- Restored the dedicated Gary’s Quick Delivery Service logo assets for the header, browser icon, and phone shortcut.
- Kept `/api/dashboard-image` exclusively for the current shift graphic, so the shift graphic can no longer replace the main logo.
- Added cache-busting query versions to the logo references.

Weekly selector regression correction (23 Oct 2026):
- Weekly rows are filtered to valid ISO dates before week options are built.
- Duplicate prevention uses Notion page IDs when available and a stable row fingerprint when IDs are missing, avoiding accidental collapse of multiple records with missing IDs.
- Historical week options remain derived from all dated earnings rows returned by the data endpoint.


## Header icon removal
- Removed the separate logo tile from the dashboard header; the title and live-data status remain.
- Browser and installed-app icon references now use the Graphic Control `shift` asset rather than the misaligned logo asset.
- The live shift graphic section remains the dashboard's visual graphic.


## Graphic Control icon cleanup — 23 October 2026
- Browser favicon, Apple touch icon, and installed-app manifest all reference `/api/dashboard-image?asset=shift&v=graphic-control`, which resolves the Shift graphic from Notion Graphic Control.
- Removed unused static PNG icon assets and the obsolete `.brand-icon` styling.
- Removed the hard-coded PNG type/size assumption from the browser favicon link.
- No deployment was performed.
