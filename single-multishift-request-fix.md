Single multi-shift request fix

A single form submission now creates one Helper Shift Requests record. The Requested shift window relation contains every selected Work Planner shift. The Date field retains the first selected shift date for compatibility; the relation is the authoritative list of all selected shifts. The response/UI says one request covering N selected shifts.

No live Notion submission was performed during packaging. Verify the relation property allows multiple pages (it normally does for Notion relation properties) and test one request with two selected shifts after deployment. Existing duplicate records from earlier submissions are not automatically deleted.


Form clarity update (25 October 2026): required fields use red dots, optional fields yellow dots, and conditional fields grey dots. The legend is concise. Multi-shift help text now states that one submission creates one pending request containing all selected shifts.
