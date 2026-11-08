# AI fallback and WhatsApp support handoff

- Preserve unanswered question logging to the existing Notion Feedback data source.
- When the assistant cannot answer, return the generic private-support fallback and include a direct WhatsApp link.
- The support link opens the approved Helper Support WhatsApp group invite.
- The app button label is `❗ Contact Helper Support on WhatsApp`.
- This is a private one-to-one click-to-chat link, not a Community/group link. WhatsApp requires the helper to press Send.
- `WHATSAPP_SUPPORT_URL` may override the default only with an approved WhatsApp group invite URL.
- Notion writes and real device behavior still require post-deploy testing.
