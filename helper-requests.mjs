import crypto from 'node:crypto';
const TOKEN = process.env.NOTION_TOKEN;
const SECRET = process.env.HELPER_SESSION_SECRET || process.env.NOTION_TOKEN;
const STAFF_SOURCE = process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID || 'f9c437cb-bf7e-430d-ba44-a16038607edb';
const REQUEST_SOURCE = process.env.NOTION_HELPER_REQUESTS_DATA_SOURCE_ID || 'd9bdbc65-2285-4176-ac81-ed3c96d6bb22';
const NV = '2025-09-03';
const response = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store, max-age=0'}});
const plain = xs => (xs||[]).map(x=>x.plain_text||x.text?.content||'').join('').trim();
function text(p,n){const x=p?.[n];if(!x)return '';if(x.type==='title')return plain(x.title);if(x.type==='rich_text')return plain(x.rich_text);if(x.type==='select')return x.select?.name||'';if(x.type==='status')return x.status?.name||'';if(x.type==='date')return x.date?.start||'';return '';}
function verify(token){if(!token||!SECRET)return null;const [payload,sig]=token.split('.');if(!payload||!sig)return null;const expected=crypto.createHmac('sha256',SECRET).update(payload).digest();let actual;try{actual=Buffer.from(sig,'base64url')}catch{return null}if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;try{const p=JSON.parse(Buffer.from(payload,'base64url').toString());return p.exp>Date.now()&&p.staffId?p:null}catch{return null}}
async function notion(url,options={}){const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${TOKEN}`,'Notion-Version':NV,'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Notion ${r.status}`);return d;}
async function queryAll(source){const rows=[];let cursor;do{const d=await notion(`https://api.notion.com/v1/data_sources/${source}/query`,{method:'POST',body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})});rows.push(...(d.results||[]));cursor=d.has_more?d.next_cursor:null;}while(cursor);return rows;}
export default async req=>{
 if(req.method!=='GET')return response({error:'Method not allowed'},405);
 if(!TOKEN||!SECRET)return response({error:'Login is not configured.'},503);
 const cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('helper_session='));
 const session=verify(cookie?.slice('helper_session='.length));if(!session)return response({error:'Sign in to view your requests.'},401);
 try{
  const [staffRows,requestRows]=await Promise.all([queryAll(STAFF_SOURCE),queryAll(REQUEST_SOURCE)]);
  const staff=staffRows.find(x=>x.id===session.staffId);if(!staff)return response({error:'Staff profile not found.'},401);
  const name=text(staff.properties,'Name').normalize('NFKC').trim().toLocaleLowerCase('en-GB');if(!name)return response({error:'Your staff profile has no name; contact Gary.'},409);
  // The request database currently has a name field but no relation to Staff Profiles.
  // Match exact normalized names only; never return the whole request database.
  const own=requestRows.filter(x=>text(x.properties,'Name').normalize('NFKC').trim().toLocaleLowerCase('en-GB')===name)
    .sort((a,b)=>String(b.created_time||'').localeCompare(String(a.created_time||''))).slice(0,30)
    .map(x=>({id:x.id,name:text(x.properties,'Name'),submittedAt:text(x.properties,'Request submitted at')||x.created_time||'',date:text(x.properties,'Date'),availability:text(x.properties,'Submitted availability'),shift:text(x.properties,'Requested shift window'),status:text(x.properties,'Request status')||text(x.properties,'Review status')||text(x.properties,'Confirm Shift'),summary:text(x.properties,'Request summary'),url:x.url}));
  return response({requests:own,matchMethod:'exact-staff-name',note:'Requests are matched by exact staff name because the source database has no Staff Profile relation.'});
 }catch(e){console.error('Helper requests read failed',e?.message||e);return response({error:'Could not load your requests from Notion. Check the database connection.'},503)}
};
export const config={path:'/.netlify/functions/helper-requests',method:['GET'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:30}};
