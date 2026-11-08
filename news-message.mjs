const GRAPHIC_CONTROL_PAGE_ID = process.env.NOTION_GRAPHIC_CONTROL_PAGE_ID || '3eef475c-d2eb-812d-ace1-c978b4ec3b73';
const ANNOUNCEMENTS_SOURCE_ID = process.env.NOTION_HOME_ANNOUNCEMENTS_DATA_SOURCE_ID || '8f63d634-9e96-4bb6-a981-10bb7c793de2';
const ANNOUNCEMENTS_DATABASE_ID = process.env.NOTION_HOME_ANNOUNCEMENTS_DATABASE_ID || 'b546d364-7d77-4dd6-a639-284a1f24e89a';
const TOKEN = process.env.NOTION_TOKEN;
const NV = '2022-06-28';

async function children(id) {
  const all = []; let cursor = '';
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${id}/children`);
    url.searchParams.set('page_size', '100'); if (cursor) url.searchParams.set('start_cursor', cursor);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NV } });
    if (!r.ok) throw new Error(`Notion API ${r.status}`);
    const d = await r.json(); all.push(...(d.results || [])); cursor = d.has_more ? d.next_cursor : '';
  } while (cursor);
  return all;
}
function text(block) {
  const data = block?.[block?.type] || {};
  const chunks = Array.isArray(data.rich_text) ? data.rich_text : Array.isArray(data.title) ? data.title : [];
  if (chunks.length) return chunks.map(x => x?.plain_text || x?.text?.content || '').join('').trim();
  if (typeof data.title === 'string') return data.title.trim();
  if (typeof data.rich_text === 'string') return data.rich_text.trim();
  return typeof data.caption === 'string' ? data.caption.trim() : '';
}
function cleanLine(value) { return value.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim(); }
function keyValue(lines, key) {
  const line = lines.find(x => new RegExp('^' + key + '\\s*:', 'i').test(cleanLine(x)));
  return line ? cleanLine(line).replace(new RegExp('^' + key + '\\s*:\\s*', 'i'), '').trim() : '';
}
function dateValue(value) {
  if (!value || /^(optional|none|n\/?a|not set)$/i.test(value)) return null;
  const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d;
}
export default async () => {
  const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  try {
    if (!TOKEN) return Response.json({ message: '', reason: 'not_configured' }, { status: 503, headers });
    // Preferred source: the dedicated Home Announcements database. Keep the old
    // Graphic Control format as a fallback during migration.
    const prop = (row, name) => { const p = row.properties?.[name]; if (!p) return ''; if (p.type === 'title') return (p.title || []).map(x => x.plain_text || x.text?.content || '').join('').trim(); if (p.type === 'rich_text') return (p.rich_text || []).map(x => x.plain_text || x.text?.content || '').join('').trim(); if (p.type === 'select' || p.type === 'status') return p[p.type]?.name || ''; if (p.type === 'url') return p.url || ''; if (p.type === 'date') return p.date?.start || ''; return ''; };
    const queryTargets = [
      { label: 'Home Announcements data source', url: `https://api.notion.com/v1/data_sources/${ANNOUNCEMENTS_SOURCE_ID}/query`, version: '2025-09-03' },
      { label: 'Home Announcements database compatibility query', url: `https://api.notion.com/v1/databases/${ANNOUNCEMENTS_DATABASE_ID}/query`, version: '2022-06-28' }
    ];
    let announcementRows = null;
    for (const target of queryTargets) {
      try {
        const rows = []; let cursor = '';
        do {
          const r = await fetch(target.url, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': target.version, 'Content-Type': 'application/json' }, body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) });
          if (!r.ok) {
            const detail = await r.text().catch(() => '');
            throw new Error(`HTTP ${r.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
          }
          const d = await r.json(); rows.push(...(d.results || [])); cursor = d.has_more ? d.next_cursor : '';
        } while (cursor);
        announcementRows = rows;
        break;
      } catch (error) { console.warn(`${target.label} failed; trying next source/fallback:`, error?.message || error); }
    }
    if (announcementRows) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const eligible = announcementRows.filter(row => {
        const status = prop(row, 'Status').toLowerCase(); const publish = prop(row, 'Publish date'); const expiry = prop(row, 'Expiry date');
        return status === 'published' && (!publish || publish.slice(0, 10) <= today) && (!expiry || expiry.slice(0, 10) >= today);
      }).sort((a,b) => String(prop(b,'Publish date') || b.last_edited_time || '').localeCompare(String(prop(a,'Publish date') || a.last_edited_time || '')));
      const chosen = eligible.find(row => prop(row, 'Message'));
      if (chosen) return Response.json({ heading: prop(chosen, 'Heading') || 'Latest Announcement', message: prop(chosen, 'Message').slice(0, 2000), link: /^https:\/\//i.test(prop(chosen, 'Optional link')) ? prop(chosen, 'Optional link') : '', updated: chosen.last_edited_time || new Date().toISOString(), source: 'Home Announcements' }, { headers });
      // Do not let an empty or draft-only dedicated source mask a legacy published message.
    }
    const blocks = await children(GRAPHIC_CONTROL_PAGE_ID);

    // Backwards compatibility: a dedicated "News message" toggle remains supported.
    const toggle = blocks.find(b => b.type === 'toggle' && text(b).toLowerCase() === 'news message');
    if (toggle) {
      const inner = await children(toggle.id);
      const lines = inner.map(text).filter(Boolean).map(cleanLine);
      const structured = lines.some(x => /^(status|heading|message|link|publish date|expiry date)\s*:/i.test(x));
      if (!structured) return Response.json({ message: inner.map(text).filter(Boolean).join('\n').slice(0, 2000) }, { headers });
      return makeAnnouncement(lines, headers);
    }

    // Graphic Control stores this as a heading followed by sibling bullet blocks,
    // not as a container block with children.
    const headingIndex = blocks.findIndex(b => /^(?:home graphic control\s*[—-]\s*announcement panel)$/i.test(text(b)));
    if (headingIndex < 0) return Response.json({ message: '', reason: 'announcement_panel_not_found' }, { headers });
    const lines = [];
    for (let i = headingIndex + 1; i < blocks.length; i++) {
      const b = blocks[i];
      if (/^heading_[1-3]$/.test(b.type) || b.type === 'divider' || b.type === 'toggle') break;
      const value = text(b);
      if (value) lines.push(cleanLine(value));
    }
    return makeAnnouncement(lines, headers);
  } catch (error) {
    console.error('News message read failed:', error?.message || error);
    return Response.json({ message: '', reason: 'notion_read_failed' }, { status: 503, headers });
  }
};
function makeAnnouncement(lines, headers) {
  const status = keyValue(lines, 'Status');
  if (status.toLowerCase() !== 'published') return Response.json({ message: '', reason: 'not_published' }, { headers });
  const heading = keyValue(lines, 'Heading');
  const message = keyValue(lines, 'Message');
  const link = keyValue(lines, 'Optional link') || keyValue(lines, 'Link');
  const publishDate = dateValue(keyValue(lines, 'Publish date'));
  const expiryDate = dateValue(keyValue(lines, 'Expiry date'));
  const now = new Date();
  if (publishDate && publishDate > now) return Response.json({ message: '', reason: 'not_yet_published' }, { headers });
  if (expiryDate && expiryDate < now) return Response.json({ message: '', reason: 'expired' }, { headers });
  if (!message || /^enter the update/i.test(message)) return Response.json({ message: '', reason: 'message_missing' }, { headers });
  return Response.json({ heading: heading && !/^enter the short/i.test(heading) ? heading : 'Latest Announcement', message: message.slice(0, 2000), link: /^https:\/\//i.test(link) ? link : '', updated: new Date().toISOString() }, { headers });
}
export const config = { path: '/.netlify/functions/news-message', method: ['GET'] };
