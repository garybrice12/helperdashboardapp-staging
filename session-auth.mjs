import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const TOKEN = process.env.NOTION_TOKEN;
const SECRET = process.env.HELPER_SESSION_SECRET;
const STAFF_SOURCE_ID = process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID || 'f9c437cb-bf7e-430d-ba44-a16038607edb';
const NOTION_VERSION = '2025-09-03';

function readText(items) { return (items || []).map(x => x.plain_text || x.text?.content || '').join('').trim(); }
function propertyText(properties, name) {
  const p = properties?.[name];
  if (!p) return '';
  if (p.type === 'title') return readText(p.title);
  if (p.type === 'rich_text') return readText(p.rich_text);
  if (p.type === 'select' || p.type === 'status') return p[p.type]?.name || '';
  return '';
}
function checked(properties, name) { return properties?.[name]?.type === 'checkbox' && properties[name].checkbox === true; }
function verify(token) {
  if (!token || !SECRET) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!payload.staffId || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    return payload;
  } catch { return null; }
}
function cookieValue(req) {
  const part = (req.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('helper_session='));
  return part ? part.slice('helper_session='.length) : '';
}
async function isRevoked(session) {
  try {
    const store = getStore('helper-session-revocations', { consistency: 'strong' });
    const [allRaw, staffRaw] = await Promise.all([
      store.get('all', { type: 'text' }),
      store.get(`staff:${session.staffId}`, { type: 'text' })
    ]);
    const allAt = Number(allRaw || 0), staffAt = Number(staffRaw || 0);
    return (allAt > 0 && session.iat <= allAt) || (staffAt > 0 && session.iat <= staffAt);
  } catch (error) {
    console.error('Session revocation check failed; rejecting request:', error?.message || error);
    return true;
  }
}
async function isCurrentSession(session) {
  if (!session?.sessionId) return false;
  try {
    const store = getStore('helper-active-sessions', { consistency: 'strong' });
    return (await store.get(`staff:${session.staffId}`, { type: 'text' })) === session.sessionId;
  } catch (error) { console.error('Active session verification failed; rejecting request:', error?.message || error); return false; }
}
async function findStaff(staffId) {
  if (!TOKEN) throw new Error('Notion connection is not configured');
  let cursor;
  do {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${STAFF_SOURCE_ID}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Staff permission lookup failed (${response.status})`);
    const match = (data.results || []).find(row => row.id === staffId);
    if (match) return match;
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return null;
}

// Every protected API re-checks revocation and current Notion access. Never trust
// the browser's cached staff object as proof of an active session.
export async function requireStaffSession(req) {
  if (!TOKEN || !SECRET) return { ok: false, status: 503, error: 'Staff access cannot be verified right now.' };
  const session = verify(cookieValue(req));
  if (!session) return { ok: false, status: 401, error: 'Your session is missing or expired. Sign in again.' };
  if (await isRevoked(session)) return { ok: false, status: 401, error: 'Your session has been revoked. Sign in again.' };
  if (await isCurrentSession(session) === false) return { ok: false, status: 401, error: 'You have been signed out because your account was logged in on another device.' };
  try {
    const staff = await findStaff(session.staffId);
    if (!staff) return { ok: false, status: 401, error: 'Your staff profile could not be verified.' };
    const properties = staff.properties || {};
    if (propertyText(properties, 'Staff Status') !== 'Active' || checked(properties, 'Access Suspended')) {
      return { ok: false, status: 403, error: 'Your staff access is inactive or suspended.' };
    }
    return { ok: true, session, staff };
  } catch (error) {
    console.error('Staff session verification failed; rejecting request:', error?.message || error);
    return { ok: false, status: 503, error: 'Staff access could not be verified. Please retry.' };
  }
}
export function authFailure(result) {
  return Response.json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
