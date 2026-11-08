# Priority fix status — candidate v2

- Session revocation/suspension enforcement: server-side guards added to dashboard data, AI, feedback, and shift-request reads/writes. Static syntax checked; live Netlify/Notion runtime validation pending.
- Announcement: dedicated data-source query plus legacy Graphic Control fallback retained/improved. Live Notion token access still needs preview verification.
- Staff Profiles property audit: only `Admin Access` and `Access Suspended` were added for this work. The existing `Card ...`, `Wrap ...`, and section formula fields appear to support the staff-card layout and should not be removed without reviewing the formulas/views.
- Production: unchanged. This is a release candidate only.
