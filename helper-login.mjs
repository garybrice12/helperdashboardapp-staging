import crypto from 'node:crypto';

const STAFF_SOURCE_ID = process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID || 'f9c437cb-bf7e-430d-ba44-a16038607edb';
const TOKEN = process.env.NOTION_TOKEN;
const SESSION_SECRET = process.env.HELPER_SESSION_SECRET;
const NOTION_VERSION = '2025-09-03';

function plain(items) { return (items || []).map(x => x.plain_text || x.text?.content || '').join('').trim(); }
function propText(p, name) {
  const x = p?.[name]; if (!x) return '';
  if (x.type === 'rich_text') return plain(x.rich_text);
  if (x.type === 'title') return plain(x.title);
  if (x.type === 'select' || x.type === 'status') return x[x.type]?.name || '';
  if (x.type === 'multi_select') return (x.multi_select || []).map(v => v.name).join(', ');
  if (x.type === 'date') return x.date?.start || '';
  return '';
}
function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}
function verify(token, allowExpired = false) {
  if (!token || !SESSION_SECRET) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest();
  let actual; try { actual = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!payload.exp || (!allowExpired && payload.exp < Date.now()) || !payload.staffId) return null;
    return payload;
  } catch { return null; }
}
async function notion(url, options={}) {
  const r = await fetch(url, { ...options, headers: {
    Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json', ...(options.headers || {})
  }});
  const body = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(`Notion request failed (${r.status})`);
  return body;
}
async function getStaff() {
  if (!TOKEN) throw new Error('NOTION_TOKEN is not configured');
  const rows = [];
  let cursor;
  do {
    const body = await notion(`https://api.notion.com/v1/data_sources/${STAFF_SOURCE_ID}/query`, {
      method:'POST', body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})
    });
    rows.push(...(body.results || [])); cursor = body.has_more ? body.next_cursor : null;
  } while(cursor);
  return rows;
}
async function updatePresence(pageId, online) {
  if (!TOKEN || !pageId) return;
  try {
    await notion(`https://api.notion.com/v1/pages/${pageId}`, { method:'PATCH', body:JSON.stringify({properties:{'Login Status':{select:{name:online?'Signed in':'Offline'}},'Last Seen':{date:{start:new Date().toISOString()}}}}) });
  } catch (error) { console.warn('Staff presence update failed:', error?.message || error); }
}
function isChecked(p, name) { return p?.[name]?.type === 'checkbox' && p[name].checkbox === true; }
async function staffImage(page) {
  const cover = page.cover;
  if (cover?.type === 'external') return cover.external?.url || '';
  if (cover?.type === 'file') return cover.file?.url || '';
  try {
    const blocks = await notion(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`);
    for (const b of blocks.results || []) {
      if (b.type === 'image') {
        const image = b.image;
        return image?.type === 'external' ? image.external?.url || '' : image?.file?.url || '';
      }
    }
  } catch {}
  return '';
}
async function sessionRevoked(session) {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('helper-session-revocations', { consistency: 'strong' });
    const [allRaw, staffRaw] = await Promise.all([
      store.get('all', { type: 'text' }),
      store.get(`staff:${session.staffId}`, { type: 'text' })
    ]);
    const allAt = Number(allRaw || 0), staffAt = Number(staffRaw || 0);
    return (allAt > 0 && (!session.iat || session.iat <= allAt)) || (staffAt > 0 && (!session.iat || session.iat <= staffAt));
  } catch (error) {
    console.error('Session revocation check failed:', error?.message || error);
    return true; // fail closed: never accept a session if revocation state cannot be checked
  }
}
function response(body, status=200, extra={}) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store, max-age=0', ...extra}});
}
const LOCKOUT_STORE = 'helper-login-lockouts';
const hashKey = value => crypto.createHash('sha256').update(String(value || 'unknown')).digest('hex');
const accountLockoutKey = staffId => `account:${hashKey(staffId)}`;
const ipLockoutKey = ip => `ip:${hashKey(ip || 'unknown-client')}`;
async function readLockoutKey(key) {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore(LOCKOUT_STORE, { consistency: 'strong' });
  const [raw, resetRaw] = await Promise.all([store.get(key, { type: 'text' }), store.get('admin-reset-at', { type: 'text' })]);
  let state = { failures: 0, lockedUntil: 0, permanent: false, updatedAt: 0 };
  if (raw) { try { state = { ...state, ...JSON.parse(raw) }; } catch {} }
  if (Number(resetRaw || 0) >= Number(state.updatedAt || 0)) state = { failures: 0, lockedUntil: 0, permanent: false, updatedAt: Number(resetRaw || 0) };
  if (!state.permanent && Number(state.lockedUntil || 0) <= Date.now()) state.lockedUntil = 0;
  return { store, key, state };
}
async function readAccountLockout(staffId) { return readLockoutKey(accountLockoutKey(staffId)); }
async function saveLockout(store, key, state) { await store.set(key, JSON.stringify(state)); }
function nextAccountLockout(previousFailures, now = Date.now()) {
  const failures = Number(previousFailures || 0) + 1;
  const state = { failures, lockedUntil: 0, permanent: false, updatedAt: now };
  if (failures >= 12) state.permanent = true;
  else if (failures >= 9) state.lockedUntil = now + 24 * 60 * 60 * 1000;
  else if (failures >= 6) state.lockedUntil = now + 60 * 60 * 1000;
  else if (failures >= 3) state.lockedUntil = now + 15 * 60 * 1000;
  return state;
}
function lockoutReply(state) {
  if (state.permanent) return response({ locked: true, permanent: true, error: 'Account locked. Contact an administrator to restore access.' }, 423);
  if (Number(state.lockedUntil || 0) > Date.now()) {
    const message = state.failures >= 9 ? 'Too many incorrect attempts. Try again in 24 hours.' : state.failures >= 6 ? 'Too many incorrect attempts. Try again in 1 hour.' : 'Too many incorrect attempts. Try again in 15 minutes.';
    return response({ locked: true, permanent: false, lockedUntil: state.lockedUntil, error: message }, 429);
  }
  return null;
}
async function sessionIsCurrent(session) {
  if (!session?.sessionId) return false;
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('helper-active-sessions', { consistency: 'strong' });
    return (await store.get(`staff:${session.staffId}`, { type: 'text' })) === session.sessionId;
  } catch (error) { console.error('Active session check failed:', error?.message || error); return false; }
}
function staffCode(page) { return propText(page.properties, 'Staff ID'); }
function staffName(page) { return propText(page.properties, 'Name') || 'Staff member'; }
function validStaffCode(value) { return /^\d{3}$/.test(String(value || '')); }
export default async (req, context = {}) => {
  if (!['POST','GET'].includes(req.method)) return response({error:'Method not allowed'},405);
  const earlyUrl = new URL(req.url);
  if (req.method === 'POST' && earlyUrl.searchParams.get('action') === 'logout') {
    const cookies = req.headers.get('cookie') || '';
    const token = cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith('helper_session='))?.split('=').slice(1).join('=');
    const session = verify(token); if (session && await sessionIsCurrent(session)) { const { getStore } = await import('@netlify/blobs'); await getStore('helper-active-sessions', { consistency: 'strong' }).set(`staff:${session.staffId}`, ''); await updatePresence(session.staffId, false); }
    return response({ok:true},200,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  }
  if (!TOKEN || !SESSION_SECRET) return response({error:'Login is not configured. Check NOTION_TOKEN and HELPER_SESSION_SECRET in Netlify.'},503);
  const lockoutAction = new URL(req.url).searchParams.get('action');
  if (req.method === 'GET' && lockoutAction === 'staff-list') {
    try {
      const pages = await getStaff();
      const active = pages.filter(page => propText(page.properties, 'Staff Status') === 'Active' && !isChecked(page.properties, 'Access Suspended'));
      const codeCounts = new Map();
      for (const page of active) { const code = staffCode(page); if (validStaffCode(code)) codeCounts.set(code, (codeCounts.get(code) || 0) + 1); }
      const staff = active.map(page => ({ id: page.id, name: staffName(page), staffCode: staffCode(page) }))
        .filter(item => validStaffCode(item.staffCode) && codeCounts.get(item.staffCode) === 1)
        .sort((a,b) => a.name.localeCompare(b.name, 'en-GB'));
      const invalidCount = active.filter(page => !validStaffCode(staffCode(page))).length;
      const duplicateCount = [...codeCounts.values()].filter(n => n > 1).reduce((sum,n) => sum+n,0);
      const warnings = [];
      if (invalidCount) warnings.push(`${invalidCount} active staff profile(s) need a three-digit Staff ID text property.`);
      if (duplicateCount) warnings.push(`${duplicateCount} active profile(s) have duplicate Staff IDs; those IDs are hidden until corrected.`);
      return response({ staff, setupWarning: warnings.join(' '), invalidCount, duplicateCount });
    } catch (error) { console.error('Staff selector load failed:', error?.message || error); return response({ error: 'Could not load staff profiles. Check the Staff ID property and Notion connection.' }, 503); }
  }
  if (req.method === 'POST' && lockoutAction === 'lockout-status') {
    try {
      const body = await req.json(); const staffId = String(body.staffId || ''); const code = String(body.staffCode || '');
      if (!staffId || !validStaffCode(code)) return response({ error: 'Select your staff name or ID first.' }, 400);
      const pages = await getStaff(); const page = pages.find(x => x.id === staffId);
      if (!page || staffCode(page) !== code || propText(page.properties, 'Staff Status') !== 'Active' || isChecked(page.properties, 'Access Suspended') || pages.filter(row => staffCode(row) === code && propText(row.properties, 'Staff Status') === 'Active' && !isChecked(row.properties, 'Access Suspended')).length !== 1) return response({ error: 'Select a valid active staff profile with a unique Staff ID.' }, 400);
      const { state } = await readAccountLockout(staffId); const blocked = state.permanent || Number(state.lockedUntil || 0) > Date.now();
      return response({ locked: blocked, permanent: !!state.permanent, lockedUntil: Number(state.lockedUntil || 0), failures: Number(state.failures || 0) });
    } catch (error) { console.error('Lockout status unavailable:', error?.message || error); return response({ error: 'Could not verify login lockout status. Try again shortly.' }, 503); }
  }
  const url = new URL(req.url);
  if (['GET','POST'].includes(req.method) && ['my-pin','change-pin'].includes(lockoutAction)) {
    const cookies = req.headers.get('cookie') || '';
    const token = cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith('helper_session='))?.split('=').slice(1).join('=');
    const session = verify(token);
    if (!session || await sessionRevoked(session) || !(await sessionIsCurrent(session))) return response({error:'Your session has expired. Sign in again.'},401,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    try {
      const pages = await getStaff();
      const page = pages.find(x=>x.id===session.staffId);
      if (!page || propText(page.properties,'Staff Status') !== 'Active' || isChecked(page.properties,'Access Suspended')) return response({error:'Staff profile is inactive or suspended.'},403);
      const pinProp = page.properties?.['Helper PIN'];
      const currentPin = pinProp?.type === 'rich_text' ? plain(pinProp.rich_text) : pinProp?.type === 'text' ? pinProp.text?.content || '' : '';
      if (lockoutAction === 'my-pin' && req.method === 'GET') return response({currentPin});
      let changeBody; try { changeBody = await req.json(); } catch { return response({error:'Enter a new PIN and confirm it.'},400); }
      const newPin = String(changeBody.newPin || '').trim();
      const confirmPin = String(changeBody.confirmPin || '').trim();
      if (!/^\d{4,8}$/.test(newPin)) return response({error:'New PIN must be 4–8 digits.'},400);
      if (newPin !== confirmPin) return response({error:'New PIN and confirmation do not match.'},400);
      if (newPin === currentPin) return response({error:'Choose a PIN different from your current PIN.'},400);
      await notion(`https://api.notion.com/v1/pages/${page.id}`, {method:'PATCH',body:JSON.stringify({properties:{'Helper PIN':{rich_text:[{text:{content:newPin}}]}}})});
      return response({ok:true,message:'PIN changed successfully. Your Staff Profile has been updated.'});
    } catch (error) { console.error('PIN management failed:',error?.message||error); return response({error:'Could not update the PIN in Notion. No change was confirmed; try again shortly.'},503); }
  }
  if (req.method === 'GET' && url.searchParams.get('action') === 'session-check') {
    const cookies = req.headers.get('cookie') || '';
    const token = cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith('helper_session='))?.split('=').slice(1).join('=');
    const session = verify(token);
    if (!session) return response({ authenticated:false, reason:'session_expired' },401,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    if (await sessionRevoked(session) || !(await sessionIsCurrent(session))) return response({ authenticated:false, reason:'session_replaced', message:'You have been signed out because your account was logged in on another device.' },401,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    return response({ authenticated:true, staffId:session.staffId });
  }
  if (req.method === 'GET' && url.searchParams.get('action') === 'me') {
    const cookies = req.headers.get('cookie') || '';
    const token = cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith('helper_session='))?.split('=').slice(1).join('=');
    const session = verify(token);
    if (!session) { const expired = verify(token, true); if (expired) await updatePresence(expired.staffId, false); return response({authenticated:false},401,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}); }
    if (await sessionRevoked(session) || !(await sessionIsCurrent(session))) { return response({authenticated:false, reason:'session_replaced', message:'You have been signed out because your account was logged in on another device.'},401,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}); }
    try {
      const pages = await getStaff();
      const page = pages.find(x=>x.id===session.staffId);
      if (!page) return response({authenticated:false},401);
      if (propText(page.properties,'Staff Status') !== 'Active' || isChecked(page.properties,'Access Suspended')) { await updatePresence(page.id, false); return response({authenticated:false, reason:'staff_inactive_or_suspended'},401,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}); }
      await updatePresence(page.id, true);
      return response({authenticated:true, staff:await publicStaff(page)});
    } catch { return response({authenticated:false},503); }
  }
  let body;
  try { body = await req.json(); } catch { return response({error:'Select your staff profile and enter your PIN.'},400); }
  const pin = String(body.pin || '').trim();
  const selectedId = String(body.staffId || '').trim();
  const selectedCode = String(body.staffCode || '').trim();
  const selectedName = String(body.staffName || '').normalize('NFKC').trim();
  if (!selectedId || !validStaffCode(selectedCode) || !selectedName) return response({error:'Choose your exact staff name and ID before entering your PIN.'},400);
  if (!/^\d{4,8}$/.test(pin)) return response({error:'Enter the PIN assigned to your selected staff profile.'},400);
  let lock;
  try {
    const ipKey = ipLockoutKey(context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown-client');
    const ipLock = await readLockoutKey(ipKey);
    if (Number(ipLock.state.lockedUntil || 0) > Date.now()) return response({ locked:true, lockedUntil:ipLock.state.lockedUntil, error:'Too many sign-in attempts from this network. Try again later.' },429);
    lock = await readAccountLockout(selectedId);
    const blocked = lockoutReply(lock.state); if (blocked) return blocked;
  } catch (error) { console.error('Account lockout storage unavailable:', error?.message || error); return response({ error: 'Login protection is temporarily unavailable. Try again shortly.' }, 503); }
  try {
    const pages = await getStaff();
    const match = pages.find(page => page.id === selectedId);
    const p = match?.properties || {};
    const pinProp = p['Helper PIN'];
    const stored = pinProp?.type === 'rich_text' ? plain(pinProp.rich_text) : pinProp?.type === 'text' ? pinProp.text?.content || '' : '';
    const active = match && propText(p,'Staff Status') === 'Active' && !isChecked(p,'Access Suspended');
    const identityMatches = match && staffCode(match) === selectedCode && staffName(match).normalize('NFKC').trim() === selectedName && pages.filter(row => staffCode(row) === selectedCode && propText(row.properties, 'Staff Status') === 'Active' && !isChecked(row.properties, 'Access Suspended')).length === 1;
    if (!match || !active || !identityMatches || stored !== pin) {
      const state = nextAccountLockout(lock.state.failures, Date.now());
      const failures = state.failures;
      await saveLockout(lock.store, lock.key, state);
      const ipKey = ipLockoutKey(context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown-client');
      const ipLock = await readLockoutKey(ipKey);
      const ipFailures = Number(ipLock.state.failures || 0) + 1;
      const ipState = { failures: ipFailures, lockedUntil: ipFailures >= 20 ? Date.now() + 15 * 60 * 1000 : 0, permanent:false, updatedAt:Date.now() };
      await saveLockout(ipLock.store, ipLock.key, ipState);
      const blocked = lockoutReply(state);
      if (blocked) return blocked;
      const nextLockoutAt = failures < 3 ? 3 : failures < 6 ? 6 : failures < 9 ? 9 : 12;
      return response({ error: 'Staff name, ID and PIN do not match. Check your details and try again.', attemptsRemaining: Math.max(0, nextLockoutAt - failures), failedAttempts: failures },401);
    }
    await saveLockout(lock.store, lock.key, { failures: 0, lockedUntil: 0, permanent: false, updatedAt: Date.now() });
    // A second layer limits repeated attempts from one network without coupling account lockouts.
    const ipKey = ipLockoutKey(context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown-client');
    const ipLock = await readLockoutKey(ipKey);
    await saveLockout(ipLock.store, ipLock.key, { failures: 0, lockedUntil: 0, permanent:false, updatedAt:Date.now() });
    const sessionId = crypto.randomUUID();
    const sessionPayload = {staffId:match.id, staffCode:selectedCode, sessionId, iat:Date.now(), exp:Date.now()+12*60*60*1000};
    const session = sign(sessionPayload);
    const { getStore } = await import('@netlify/blobs');
    const activeStore = getStore('helper-active-sessions', { consistency: 'strong' });
    await activeStore.set(`staff:${match.id}`, sessionId);
    await updatePresence(match.id, true);
    const publicData = await publicStaff(match);
    publicData.adminAccess = isChecked(match.properties,'Admin Access');
    publicData.staffCode = selectedCode;
    return response({authenticated:true, staff:publicData},200,{'Set-Cookie':`helper_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`});
  } catch (error) {
    console.error('Helper login failed:', error?.message || error);
    return response({error:'Could not check the staff PIN against Notion. Check the Notion connection and try again.'},503);
  }
};
async function publicStaff(page) {
  const p = page.properties || {};
  const name = propText(p,'Name') || 'Staff member';
  return {
    id:page.id, name, staffCode:staffCode(page),
    adminAccess:isChecked(p,'Admin Access'),
    accessSuspended:isChecked(p,'Access Suspended'),
    position:propText(p,'Position') || 'Team member',
    status:propText(p,'Staff Status') || 'Active',
    currentWork:propText(p,'Current Work 1'),
    memberSince:propText(p,'Member Since'),
    photoUrl:await staffImage(page)
  };
};
export const config = { path: '/.netlify/functions/helper-login', method: ['GET','POST'] };
