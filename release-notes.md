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
