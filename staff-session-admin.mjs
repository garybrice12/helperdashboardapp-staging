import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STAFF_SOURCE_ID = process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID || 'f9c437cb-bf7e-430d-ba44-a16038607edb';
const TOKEN = process.env.NOTION_TOKEN;
const SESSION_SECRET = process.env.HELPER_SESSION_SECRET;
const NOTION_VERSION = '2025-09-03';
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function plain(items) { return (items || []).map(x => x.plain_text || x.text?.content || '').join('').trim(); }
function propText(properties, name) {
  const p = properties?.[name]; if (!p) return '';
  if (p.type === 'select' || p.type === 'status') return p[p.type]?.name || '';
  if (p.type === 'date') return p.date?.start || '';
  const items = p.type === 'title' ? p.title : p.type === 'rich_text' ? p.rich_text : [];
  return (items || []).map(x => x.plain_text || x.text?.content || '').join('').trim();
}
function checked(properties, name) { return properties?.[name]?.type === 'checkbox' && properties[name].checkbox === true; }
function verify(token) {
  if (!token || !SESSION_SECRET) return null;
  const [encoded, sig] = token.split('.'); if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest();
  let actual; try { actual = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try { const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()); return payload.exp > Date.now() && payload.staffId && payload.iat ? payload : null; } catch { return null; }
}
function sessionFrom(req) {
  const cookie = (req.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('helper_session='));
  return verify(cookie?.slice('helper_session='.length));
}
async function notion(url, options = {}) {
  if (!TOKEN) throw new Error('Notion connection is not configured');
  const r = await fetch(url, { ...options, headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Notion API failed (${r.status})`); return d;
}
async function accountLockStatus(staffId) {
  const store = getStore('helper-login-lockouts', { consistency: 'strong' });
  const key = `account:${crypto.createHash('sha256').update(staffId).digest('hex')}`;
  const [raw, resetRaw] = await Promise.all([store.get(key, { type: 'text' }), store.get('admin-reset-at', { type: 'text' })]);
  let state = { failures: 0, lockedUntil: 0, permanent: false, updatedAt: 0 };
  if (raw) { try { state = { ...state, ...JSON.parse(raw) }; } catch {} }
  if (Number(resetRaw || 0) >= Number(state.updatedAt || 0)) state = { failures: 0, lockedUntil: 0, permanent: false, updatedAt: Number(resetRaw || 0) };
  if (!state.permanent && Number(state.lockedUntil || 0) <= Date.now()) state.lockedUntil = 0;
  return { failures: Number(state.failures || 0), lockedUntil: Number(state.lockedUntil || 0), permanent: Boolean(state.permanent) };
}
async function clearAccountLockout(staffId) {
  const store = getStore('helper-login-lockouts', { consistency: 'strong' });
  const key = `account:${crypto.createHash('sha256').update(staffId).digest('hex')}`;
  await store.set(key, JSON.stringify({ failures: 0, lockedUntil: 0, permanent: false, updatedAt: Date.now() }));
}
async function staffList() {
  const rows = []; let cursor;
  do {
    const d = await notion(`https://api.notion.com/v1/data_sources/${STAFF_SOURCE_ID}/query`, { method: 'POST', body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) });
    rows.push(...(d.results || [])); cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return rows;
}
async function sessionRevoked(session) {
  try {
    const store = getStore('helper-session-revocations', { consistency: 'strong' });
    const [allRaw, staffRaw] = await Promise.all([store.get('all', { type: 'text' }), store.get(`staff:${session.staffId}`, { type: 'text' })]);
    return (Number(allRaw || 0) > 0 && session.iat <= Number(allRaw)) || (Number(staffRaw || 0) > 0 && session.iat <= Number(staffRaw));
  } catch (error) { console.error('Admin session revocation check failed:', error?.message || error); return true; }
}
async function sessionIsCurrent(session){try{const store=getStore('helper-active-sessions',{consistency:'strong'});return !!session?.sessionId&&(await store.get(`staff:${session.staffId}`,{type:'text'}))===session.sessionId}catch(error){console.error('Active session check failed; rejecting request',error?.message||error);return false}}
async function setSuspended(pageId, suspended) {
  await notion(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties: { 'Access Suspended': { checkbox: suspended }, 'Login Status': { select: { name: 'Offline' } }, 'Last Seen': { date: { start: new Date().toISOString() } } } }) });
}
async function setOffline(pageId) {
  await notion(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties: { 'Login Status': { select: { name: 'Offline' } }, 'Last Seen': { date: { start: new Date().toISOString() } } } }) });
}
async function revoke(store, target, all = false) {
  const at = String(Date.now());
  if (all) await store.set('all', at); else await store.set(`staff:${target}`, at);
  return at;
}
const AUDIT_PARENT_PAGE_ID = process.env.NOTION_STAFF_ACCESS_AUDIT_PARENT_PAGE_ID || 'b22ed2bc-c35c-4aeb-8972-0780ec3702fa';
async function ensureNotionAuditPage(store) {
  const saved = await store.get('notion:staff-access-audit-page-id', { type: 'text' });
  if (saved && UUID.test(saved)) return saved;
  const page = await notion('https://api.notion.com/v1/pages', { method: 'POST', body: JSON.stringify({
    parent: { type: 'page_id', page_id: AUDIT_PARENT_PAGE_ID },
    properties: { title: { title: [{ text: { content: 'Staff Access Audit Log' } }] } },
    children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Automatic audit trail for Helper Dashboard staff access changes. Each entry records date/time, administrator, affected staff member, action, result and reason. A secondary audit copy is retained in Netlify Blobs.' } }] } }]
  }) });
  if (!page.id) throw new Error('Notion did not return the Staff Access Audit Log page ID');
  await store.set('notion:staff-access-audit-page-id', page.id);
  return page.id;
}
async function audit(store, actor, action, target, reason) {
  const item = { at: new Date().toISOString(), actor, action, target, reason: String(reason || '').slice(0, 300), result: 'Success' };
  await store.set(`audit:${Date.now()}:${crypto.randomUUID()}`, JSON.stringify(item));
  try {
    const pageId = await ensureNotionAuditPage(store);
    const actionLabel = ({ suspend: 'Access suspended', restore: 'Access restored', signout: 'Forced sign-out', 'signout-all': 'Signed out all staff', 'clear-login-lockout': 'Login lockout cleared' })[action] || action;
    const rich = content => [{ type: 'text', text: { content: String(content || '').slice(0, 1900) } }];
    await notion(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', body: JSON.stringify({ children: [
      { object: 'block', type: 'heading_3', heading_3: { rich_text: rich(`${actionLabel} — ${target}`) } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: rich(`Date & time: ${item.at} | Admin: ${actor} | Staff member: ${target} | Action: ${actionLabel} | Result: Success`) } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: rich(`Reason: ${item.reason || 'No reason supplied'}`) } },
      { object: 'block', type: 'divider', divider: {} }
    ] }) });
    return true;
  } catch (error) {
    console.error('Could not write staff access audit to Notion; Netlify Blobs copy retained:', error?.message || error);
    return false;
  }
}
export default async req => {
  if (!['GET', 'POST'].includes(req.method)) return response({ error: 'Method not allowed' }, 405);
  const session = sessionFrom(req);
  if (!session) return response({ error: 'Sign in with an authorised staff account first.' }, 401);
  if (!TOKEN || !SESSION_SECRET) return response({ error: 'Admin access cannot be verified.' }, 503);
  if (await sessionRevoked(session)) return response({ error: 'Your session has been revoked. Sign in again.' }, 401);
  if (!(await sessionIsCurrent(session))) return response({ error: 'You have been signed out because your account was logged in on another device.' }, 401);
  try {
    const rows = await staffList();
    const actor = rows.find(row => row.id === session.staffId);
    if (!actor || propText(actor.properties, 'Staff Status') !== 'Active' || checked(actor.properties, 'Access Suspended')) return response({ error: 'Your staff profile is inactive or suspended.' }, 403);
    if (!checked(actor.properties, 'Admin Access')) return response({ error: 'Admin permission is not enabled on your Staff Profile.' }, 403);
    if (req.method === 'GET') {
      const staff = await Promise.all(rows.filter(row => row.id && propText(row.properties, 'Staff Status').toLowerCase() !== 'deleted').map(async row => {
        const lockout = await accountLockStatus(row.id);
        return {
          id: row.id,
          name: propText(row.properties, 'Name') || 'Unnamed staff',
          staffCode: propText(row.properties, 'Staff ID'),
          status: propText(row.properties, 'Staff Status') || 'UNKNOWN',
          loginStatus: lockout.permanent ? 'LOCKED — admin reset required' : lockout.lockedUntil ? `LOCKED — until ${new Date(lockout.lockedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : propText(row.properties, 'Login Status') || 'Unknown',
          failedAttempts: lockout.failures,
          lockedUntil: lockout.lockedUntil,
          permanentlyLocked: lockout.permanent,
          lastSeen: propText(row.properties, 'Last Seen') || '',
          suspended: checked(row.properties, 'Access Suspended'),
          adminAccess: checked(row.properties, 'Admin Access')
        };
      }));
      return response({ staff });
    }
    let body; try { body = await req.json(); } catch { return response({ error: 'Invalid request body.' }, 400); }
    const action = String(body.action || (body.all === true ? 'signout-all' : 'signout')).trim();
    const reason = String(body.reason || '').trim();
    if (action === 'clear-login-lockouts') {
      const lockStore = getStore('helper-login-lockouts', { consistency: 'strong' });
      await lockStore.set('admin-reset-at', String(Date.now()));
      const notionAuditLogged = await audit(getStore('helper-session-revocations', { consistency: 'strong' }), propText(actor.properties, 'Name') || actor.id, action, 'all login lockouts', reason || 'Admin manually overrode login lockouts');
      return response({ ok: true, notionAuditLogged, message: notionAuditLogged ? 'All login lockouts cleared. Audit entry saved in Notion.' : 'All login lockouts cleared. WARNING: audit entry is only in Netlify storage; Notion logging failed.' });
    }
    const target = String(body.staffId || '').trim();
    if (action === 'signout-all') {
      if (body.all !== true) return response({ error: 'Confirm all=true to sign out everyone.' }, 400);
      const store = getStore('helper-session-revocations', { consistency: 'strong' });
      await revoke(store, '', true);
      await Promise.all(rows.filter(row => row.id).map(row => setOffline(row.id).catch(error => console.warn('Could not mark staff offline:', row.id, error?.message || error))));
      const notionAuditLogged = await audit(store, propText(actor.properties, 'Name') || actor.id, action, 'all staff', reason || 'Admin forced sign-out');
      return response({ ok: true, scope: 'all', notionAuditLogged, message: notionAuditLogged ? 'All sessions revoked. Staff must sign in again. Audit entry saved in Notion.' : 'All sessions revoked. Staff must sign in again. WARNING: audit entry is only in Netlify storage; Notion logging failed.' });
    }
    if (!UUID.test(target)) return response({ error: 'Select a valid staff profile.' }, 400);
    const targetPage = rows.find(row => row.id === target);
    if (!targetPage) return response({ error: 'Staff profile not found.' }, 404);
    const store = getStore('helper-session-revocations', { consistency: 'strong' });
    if (action === 'clear-login-lockout') {
      const lockStore = getStore('helper-login-lockouts', { consistency: 'strong' });
      const reasonText = String(body.reason || '').trim();
      const lockKey = `account:${crypto.createHash('sha256').update(target).digest('hex')}`;
      await lockStore.set(lockKey, JSON.stringify({ failures: 0, lockedUntil: 0, permanent: false, updatedAt: Date.now() }));
      const actorName = propText(actor.properties, 'Name') || actor.id;
      const targetName = propText(targetPage.properties, 'Name') || target;
      const notionAuditLogged = await audit(store, actorName, action, targetName, reasonText || 'Administrator cleared this staff account login lockout');
      return response({ ok: true, notionAuditLogged, message: notionAuditLogged ? `Login lockout cleared for ${targetName}. Audit entry saved in Notion.` : `Login lockout cleared for ${targetName}. WARNING: audit entry is only in Netlify storage; Notion logging failed.` });
    }
    if (action === 'suspend' || action === 'restore') {
      if (!reason) return response({ error: 'Enter a reason for suspending or restoring access.' }, 400);
      const suspended = action === 'suspend';
      await setSuspended(target, suspended);
      await revoke(store, target);
      if (!suspended) await clearAccountLockout(target);
      const notionAuditLogged = await audit(store, propText(actor.properties, 'Name') || actor.id, action, propText(targetPage.properties, 'Name') || target, reason);
      const actionMessage = suspended ? 'Access suspended and current sessions revoked.' : 'Access restored and this staff account lockout cleared. The staff member must sign in again; old sessions remain revoked. Network-wide lockouts, if active, are separate.';
      return response({ ok: true, scope: 'staff', suspended, notionAuditLogged, message: notionAuditLogged ? `${actionMessage} Audit entry saved in Notion.` : `${actionMessage} WARNING: audit entry is only in Netlify storage; Notion logging failed.` });
    }
    if (action !== 'signout') return response({ error: 'Unsupported admin action.' }, 400);
    await revoke(store, target); await setOffline(target); const notionAuditLogged = await audit(store, propText(actor.properties, 'Name') || actor.id, action, propText(targetPage.properties, 'Name') || target, reason || 'Admin forced sign-out');
    return response({ ok: true, scope: 'staff', notionAuditLogged, message: notionAuditLogged ? 'Session revoked. The staff member must sign in again. Audit entry saved in Notion.' : 'Session revoked. The staff member must sign in again. WARNING: audit entry is only in Netlify storage; Notion logging failed.' });
  } catch (error) {
    console.error('Staff session admin failed:', error?.message || error);
    return response({ error: 'Admin action could not be completed. Check the Notion connection and session storage.' }, 503);
  }
};
export const config = { path: '/.netlify/functions/staff-session-admin', method: ['GET', 'POST'] };
