import crypto from 'node:crypto';

const STAFF_SOURCE_ID = process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID || 'f9c437cb-bf7e-430d-ba44-a16038607edb';
const TOKEN = process.env.NOTION_TOKEN;
const SESSION_SECRET = process.env.HELPER_SESSION_SECRET || process.env.NOTION_TOKEN;
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
function verify(token) {
  if (!token || !SESSION_SECRET) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest();
  let actual; try { actual = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now() || !payload.staffId) return null;
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
function response(body, status=200, extra={}) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store, max-age=0', ...extra}});
}
export default async (req) => {
  if (!['POST','GET'].includes(req.method)) return response({error:'Method not allowed'},405);
  const earlyUrl = new URL(req.url);
  if (req.method === 'POST' && earlyUrl.searchParams.get('action') === 'logout') return response({ok:true},200,{'Set-Cookie':'helper_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  if (!TOKEN || !SESSION_SECRET) return response({error:'Login is not configured: the Netlify NOTION_TOKEN is missing.'},503);
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('action') === 'me') {
    const cookies = req.headers.get('cookie') || '';
    const token = cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith('helper_session='))?.split('=').slice(1).join('=');
    const session = verify(token);
    if (!session) return response({authenticated:false},401);
    try {
      const pages = await getStaff();
      const page = pages.find(x=>x.id===session.staffId);
      if (!page) return response({authenticated:false},401);
      return response({authenticated:true, staff:await publicStaff(page)});
    } catch { return response({authenticated:false},503); }
  }
  let body;
  try { body = await req.json(); } catch { return response({error:'Enter your PIN and try again.'},400); }
  const pin = String(body.pin || '').trim();
  if (!/^\d{4,8}$/.test(pin)) return response({error:'Enter the PIN assigned to your staff profile.'},400);
  try {
    const pages = await getStaff();
    const match = pages.find(page => {
      const p = page.properties || {};
      const pinProp = p['Helper PIN'];
      const stored = pinProp?.type === 'rich_text' ? plain(pinProp.rich_text) : pinProp?.type === 'text' ? pinProp.text?.content || '' : '';
      const status = propText(p,'Staff Status');
      return stored === pin && (!status || status === 'Active');
    });
    if (!match) return response({error:'PIN not recognised, or this staff profile is not active.'},401);
    const session = sign({staffId:match.id, exp:Date.now()+12*60*60*1000});
    const staff = await publicStaff(match);
    return response({authenticated:true, staff},200,{'Set-Cookie':`helper_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`});
  } catch (error) {
    console.error('Helper login failed:', error?.message || error);
    return response({error:'Could not check the staff PIN against Notion. Check the Notion connection and try again.'},503);
  }
};
async function publicStaff(page) {
  const p = page.properties || {};
  const name = propText(p,'Name') || 'Staff member';
  return {
    id:page.id, name,
    position:propText(p,'Position') || 'Team member',
    status:propText(p,'Staff Status') || 'Active',
    currentWork:propText(p,'Current Work 1'),
    memberSince:propText(p,'Member Since'),
    photoUrl:await staffImage(page)
  };
};
export const config = { path: '/.netlify/functions/helper-login', method: ['GET','POST'] };
