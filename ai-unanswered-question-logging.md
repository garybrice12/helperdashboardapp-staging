# AI unanswered-question logging and private support handoff

- If the approved fallback can answer, it continues to answer directly.
- If no approved answer exists, or the AI explicitly returns `UNANSWERED`, the backend attempts to create an item in the existing Notion Feedback inbox data source `34e1bc20-8f43-4b45-84a1-0cf9de860264`.
- The item is titled `Unanswered AI question — [local timestamp]`, has Feedback type `Other`, App area `Ask AI`, Review status `New`, and includes the question, supplied staff name, timestamp, and failure/unanswered reason.
- The user sees a short fallback telling them the question was logged for review and to contact Helper Support WhatsApp group if they need immediate help. The response does not claim logging succeeded unless the write returned success.
- Optional: set Netlify environment variable `WHATSAPP_SUPPORT_URL` to the approved HTTPS WhatsApp group invite or direct-chat URL. If unset, the approved Helper Support group invite is used. The approved group invite is used by default; an old business-number URL is ignored.
- New endpoint `/.netlify/functions/support-config` returns only the configured support URL and uses `Cache-Control: no-store`.
- Live Notion writes and real WhatsApp configuration have not been tested by this local build check.


WhatsApp support link update (25 October 2026): support link defaults to the approved Helper Support WhatsApp group invite. WHATSAPP_SUPPORT_URL may override it with an approved HTTPS WhatsApp group or direct-chat link.
