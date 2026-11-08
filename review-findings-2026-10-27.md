# Helper Dashboard candidate v3 — review findings (27 Oct 2026)

This is a review build derived from helper-dashboard-release-candidate-2026-10-26-v2.zip. It has NOT been deployed.

## Changes in v3
- Login now requires Staff Status to equal `Active`; missing status no longer passes.
- Shift request endpoint also rejects staff profiles whose Staff Status is missing or not exactly `Active`.
- News retrieval supports the documented Graphic Control announcement panel (`Home graphic control — announcement panel`) as well as the legacy `News message` toggle. The documented panel only displays content when Status is `Published`, and it returns a blank message when unpublished or missing.
- A Notion read failure returns HTTP 503 with a reason instead of silently disguising an integration failure as a successful empty response.

## Verified locally
- ZIP archive integrity.
- JavaScript syntax checks for Netlify function files.
- Static inspection of individual and bulk sign-out controls and the revocation store checks.

## Not verified
- Live Notion retrieval and exact block structure.
- Netlify Blobs persistence/configuration in the target site.
- Browser end-to-end session revocation with multiple staff sessions.
- Actual live-site regression behavior.

Do not deploy to production until these external integration checks are performed.
