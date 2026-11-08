import crypto from 'node:crypto';

const TOKEN = process.env.NOTION_TOKEN;
const SECRET = process.env.HELPER_SESSION_SECRET;
const STAFF_SOURCE = process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID || 'f9c437cb-bf7e-430d-ba44-a16038607edb';
const DEFAULT_REQUEST_SOURCE = 'd9bdbc65-2285-4176-ac81-ed3c96d6bb22';
const DEFAULT_REQUEST_DATABASE = '3f9d1c74-d9e4-4d2c-ae13-ae17d9ca7173';
const REQUEST_SOURCE = process.env.NOTION_HELPER_REQUESTS_DATA_SOURCE_ID || DEFAULT_REQUEST_SOURCE;
const REQUEST_DATABASE = process.env.NOTION_HELPER_REQUESTS_DATABASE_ID || DEFAULT_REQUEST_DATABASE;
const SHIFTS_SOURCE = process.env.NOTION_SHIFTS_DATA_SOURCE_ID || process.env.NOTION_WORK_PLANNER_DATA_SOURCE_ID || '5f05970c-fcc0-497b-aa62-3e8edefbbb2b';
const NV = '2025-09-03';
const response = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store, max-age=0'}});
const plain = xs => (xs||[]).map(x=>x.plain_text||x.text?.content||'').join('').trim();
function text(p,n){const x=p?.[n];if(!x)return '';if(x.type==='title')return plain(x.title);if(x.type==='rich_text')return plain(x.rich_text);if(x.type==='text')return x.text?.content||'';if(x.type==='select')return x.select?.name||'';if(x.type==='status')return x.status?.name||'';if(x.type==='date')return x.date?.start||'';if(x.type==='multi_select')return (x.multi_select||[]).map(v=>v.name).join(', ');return '';}
function checked(p,n){return p?.[n]?.type==='checkbox'&&p[n].checkbox===true;}
function ukDateISO(now=new Date()){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=t=>parts.find(p=>p.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;}
function requestDateRange(now=new Date()){const today=ukDateISO(now);const base=new Date(`${today}T12:00:00Z`);const shift=(n)=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};return {from:shift(-3),to:shift(7)};}
function verify(token){if(!token||!SECRET)return null;const [payload,sig]=token.split('.');if(!payload||!sig)return null;const expected=crypto.createHmac('sha256',SECRET).update(payload).digest();let actual;try{actual=Buffer.from(sig,'base64url')}catch{return null}if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;try{const p=JSON.parse(Buffer.from(payload,'base64url').toString());return p.exp>Date.now()&&p.staffId?p:null}catch{return null}}
async function notion(url,options={},sourceLabel='unknown source'){const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${TOKEN}`,'Notion-Version':NV,'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const error=new Error(`Notion API failure; source=${sourceLabel}; endpoint=${url}; status=${r.status}; code=${d.code||'unknown'}; message=${d.message||'No error message returned'}; request_id=${d.request_id||'not supplied'}`);error.status=r.status;error.sourceLabel=sourceLabel;throw error;}return d;}
async function queryAll(source,sourceLabel){const rows=[];let cursor;const endpoint=`https://api.notion.com/v1/data_sources/${source}/query`;do{const d=await notion(endpoint,{method:'POST',body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})},sourceLabel);rows.push(...(d.results||[]));cursor=d.has_more?d.next_cursor:null;}while(cursor);return rows;}
function cookieSession(req){const cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('helper_session='));return verify(cookie?.slice('helper_session='.length));}
async function sessionRevoked(session){try{const {getStore}=await import('@netlify/blobs');const store=getStore('helper-session-revocations',{consistency:'strong'});const [allRaw,staffRaw]=await Promise.all([store.get('all',{type:'text'}),store.get(`staff:${session.staffId}`,{type:'text'})]);const allAt=Number(allRaw||0),staffAt=Number(staffRaw||0);return (allAt>0&&(!session.iat||session.iat<=allAt))||(staffAt>0&&(!session.iat||session.iat<=staffAt));}catch(error){console.error('Session revocation check failed',error?.message||error);return true;}}
async function sessionIsCurrent(session){try{const {getStore}=await import('@netlify/blobs');const store=getStore('helper-active-sessions',{consistency:'strong'});return !!session?.sessionId&&(await store.get(`staff:${session.staffId}`,{type:'text'}))===session.sessionId}catch(error){console.error('Active session check failed; rejecting request',error?.message||error);return false}}
function select(name){return {select:{name}};}
function rich(textValue){return {rich_text:[{text:{content:String(textValue).slice(0,2000)}}]};}
function title(textValue){return {title:[{text:{content:String(textValue).slice(0,200)}}]};}
function buildRequestSummary(properties, shifts){
 const p=properties||{};
 const lines=[];
 const add=(label,value)=>{const v=String(value||'').trim();if(v)lines.push(`${label}: ${v}`)};
 add('Request type',text(p,'Submission type'));
 add('Availability',text(p,'Availability'));
 if(Array.isArray(shifts)&&shifts.length){
  lines.push('Selected shifts:');
  shifts.forEach((shift,index)=>lines.push(`${index+1}. ${[shift.dateLabel||shift.date,shift.window,shift.location,shift.quest?'Quest shift':null,shift.shiftStatus?`Status: ${shift.shiftStatus}`:null].filter(Boolean).join(' · ')}`));
 }
 add('Unavailable reason',text(p,'Unavailable reason'));
 add('Pick-up',text(p,'Submitted pick-up'));
 add('Pick-up time',text(p,'Submitted pick-up time'));
 add('Other pick-up details',text(p,'Submitted other pick-up details')||text(p,'Other Pickup Details')||text(p,'Other Pick-up Location'));
 add('Other pick-up / meet-up time',text(p,'Other Pick-up/Meet-up time'));
 add('Drink',text(p,'Submitted drink'));
 add('Other food / drink request',text(p,'Other Drink/Food Request'));
 add('Preferred start time',text(p,'Preferred start time (within shift window)'));
 add('Preferred finish time',text(p,'Preferred finish time (within shift window)'));
 add('Other information',text(p,'Other Requests or relevant Information'));
 add('Decision',text(p,'Request status')||text(p,'Decision status')||text(p,'Pending Request'));
 return lines.join('\n')||'No additional form details were recorded for this request.';
}
function buildProperties(staffName,shifts,body){
 const shiftList=Array.isArray(shifts)?shifts:[shifts];
 const primaryShift=shiftList[0];
 const properties={
  'Name':title(staffName),
  'Date':{date:{start:primaryShift.date}},
  'Requested shift window':{relation:shiftList.map(shift=>({id:shift.id}))},
  'Submission type':select(body.submissionType),
  'Pending Request':select('⏳ Pending'),
  'Decision status':select('⚪ Pending'),
  'Shift Window Status':select('⚪ Pending'),
  '📋 Pickup Details':select('⚪ Pending'),
  '🥤 Drink':select('⚪ Pending'),
  '🍽️ Other Food/Drink':select('⚪ Pending'),
  '📝 Other Info':select('⚪ Pending'),
  '📍 Other Pickup':select('⚪ Pending'),
  '🕒 Other Time':select('⚪ Pending'),
  '✅ Pickup':select('⚪ Pending'),
  'Drink':select('⚪ Pending')
 };
 const setSelect=(field,value)=>{if(value)properties[field]=select(value)};
 const setText=(field,value)=>{if(value)properties[field]=rich(value)};
 setSelect('Availability',body.availability);
 setSelect('Submitted pick-up',body.pickup);
 setSelect('Submitted pick-up time',body.pickupTime);
 if(body.drink)properties['Submitted drink']={multi_select:[{name:body.drink}]};
 setText('Unavailable reason',body.unavailableReason);
 setText('Submitted other pick-up details',body.pickupOther);
 setText('Other Pick-up Location',body.pickupOther);
 setText('Other Pick-up/Meet-up time',body.pickupTimeOther);
 setText('Other Drink/Food Request',body.drinkOther);
 setText('Preferred start time (within shift window)',body.preferredStart);
 setText('Preferred finish time (within shift window)',body.preferredFinish);
 const otherInfo=[body.otherInfo,body.changeNote?`Change/cancellation note: ${body.changeNote}`:''].filter(Boolean).join('\n\n');
 setText('Other Requests or relevant Information',otherInfo);
 return properties;
}
export default async req=>{
 if(!['GET','POST'].includes(req.method))return response({error:'Method not allowed'},405);
 if(!TOKEN||!SECRET)return response({error:'Login is not configured.'},503);
 const session=cookieSession(req);if(!session)return response({error:'Sign in before viewing shifts or submitting a request.'},401);if(await sessionRevoked(session))return response({error:'Your session has been signed out. Please sign in again.'},401);if(!(await sessionIsCurrent(session)))return response({error:'You have been signed out because your account was logged in on another device.'},401);
 const url=new URL(req.url);
 if(req.method==='GET'){
  try{
   const staffRows=await queryAll(STAFF_SOURCE,'Staff Profiles');
   const staff=staffRows.find(x=>x.id===session.staffId);if(!staff)return response({error:'Staff profile not found.'},401);
   const staffStatus=text(staff.properties,'Staff Status');if(staffStatus!=='Active'||checked(staff.properties,'Access Suspended'))return response({error:'This staff profile is inactive or suspended. Contact Gary.'},403);
   const name=text(staff.properties,'Name').normalize('NFKC').trim();if(!name)return response({error:'Your staff profile has no name; contact Gary.'},409);
   if(url.searchParams.get('action')==='options'){
    const shiftRows=await queryAll(SHIFTS_SOURCE,'Work Planner Shifts');
    const shifts=shiftRows.map(row=>({id:row.id,shift:text(row.properties,'Shift'),date:row.properties?.Date?.date?.start||text(row.properties,'Date'),window:text(row.properties,'Window'),location:text(row.properties,'Location'),status:text(row.properties,'Status'),quest:checked(row.properties,'Quest')}))
     .filter(s=>s.id&&s.date&&s.window&&s.location&&['Available'].includes(s.status))
     .sort((a,b)=>a.date.localeCompare(b.date)||a.window.localeCompare(b.window));
    return response({shifts,staffName:name});
   }
   const [requestRows,shiftRows]=await Promise.all([queryAll(REQUEST_SOURCE,'Helper Shift Requests'),queryAll(SHIFTS_SOURCE,'Work Planner Shifts')]);
   const shiftNames=new Map(shiftRows.map(row=>[row.id,text(row.properties,'Shift')]).filter(([id,label])=>id&&label));
   const normalized=name.toLocaleLowerCase('en-GB');
   const {from:requestFrom,to:requestTo}=requestDateRange();
   const own=requestRows.filter(x=>text(x.properties,'Name').normalize('NFKC').trim().toLocaleLowerCase('en-GB')===normalized)
    .sort((a,b)=>String(b.created_time||'').localeCompare(String(a.created_time||'')))
    .map(x=>{const relation=x.properties?.['Requested shift window']?.relation||[];const selectedShifts=relation.map(r=>{const row=shiftRows.find(s=>s.id===r.id);if(!row)return null;const dateValue=row.properties?.Date?.date?.start||row.properties?.Date?.date?.start_date||text(row.properties,'Date')||'';return {id:r.id,shift:text(row.properties,'Shift'),date:dateValue,dateLabel:dateValue?new Date(dateValue+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'',window:text(row.properties,'Window'),location:text(row.properties,'Location'),shiftStatus:text(row.properties,'Status'),quest:checked(row.properties,'Quest')}}).filter(Boolean);
     const visibleShifts=selectedShifts.filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&s.date>=requestFrom&&s.date<=requestTo);
     const fallbackDate=text(x.properties,'Date');const matchesWindow=visibleShifts.length>0||(!relation.length&&/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)&&fallbackDate>=requestFrom&&fallbackDate<=requestTo);
     return matchesWindow?{id:x.id,name:text(x.properties,'Name'),submittedAt:text(x.properties,'Request submitted at')||x.created_time||'',date:fallbackDate,availability:text(x.properties,'Availability'),shift:visibleShifts.map(s=>s.shift).filter(Boolean).join('\n')||text(x.properties,'Requested shift window'),shifts:visibleShifts,status:text(x.properties,'Request status')||text(x.properties,'Decision status')||text(x.properties,'Pending Request'),summary:text(x.properties,'Request summary')||buildRequestSummary(x.properties,visibleShifts),url:x.url}:null;
    }).filter(Boolean).slice(0,10);
   return response({requests:own,window:{from:requestFrom,to:requestTo},limit:10,matchMethod:'exact-staff-name',note:'Only this staff member’s requests with at least one shift dated from three days ago through seven days ahead are returned; at most 10 requests are shown.'});
  }catch(e){console.error('Helper requests read failed',e?.message||e);const message=e?.status===404&&e?.sourceLabel==='Helper Shift Requests'?'The Helper Shift Requests source could not be read by the app integration. The Notion integration may need access to that source.':'Could not load shift options or requests from Notion. Check the database connection.';return response({error:message},503)}
 }
 if(req.headers.get('origin')){try{if(new URL(req.headers.get('origin')).host!==new URL(req.url).host)return response({error:'Request origin not allowed.'},403)}catch{return response({error:'Invalid request origin.'},403)}}
 let body;try{body=await req.json()}catch{return response({error:'The request form data was not valid.'},400)}
 const submissionType=String(body.submissionType||'');
 const allowedTypes=['New request','Change existing request (Only Fill in what you want to change)','Cancel existing request (select only the shift you want to cancel)'];
 if(!allowedTypes.includes(submissionType))return response({error:'Choose a valid request type.'},400);
 const rawShiftIds=Array.isArray(body.shiftIds)?body.shiftIds:(body.shiftId?[body.shiftId]:[]);
 const shiftIds=[...new Set(rawShiftIds.map(x=>String(x||'').trim()).filter(Boolean))];
 if(!shiftIds.length||shiftIds.length>20||shiftIds.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return response({error:'Select between 1 and 20 valid shifts from the list.'},400);
 const cancelling=submissionType.startsWith('Cancel existing request'),changing=submissionType.startsWith('Change existing request');
 const availability=String(body.availability||'');
 if(!cancelling&&!changing&&!['Available','Unavailable','Unsure'].includes(availability))return response({error:'Choose your availability.'},400);
 if(!cancelling&&!changing&&!['Home address','Powder Monkey','Other *Please specify in box below'].includes(String(body.pickup||'')))return response({error:'Choose a pick-up location.'},400);
 if(!cancelling&&!changing&&!['One hour before shift','30 minutes before shift','At shift time (±5 minutes)','Other (please specify in box below)'].includes(String(body.pickupTime||'')))return response({error:'Choose a pick-up time.'},400);
 if(!cancelling&&!changing&&!['Before shift','After shift','N/A or no','Other (Please specify in box below)'].includes(String(body.drink||'')))return response({error:'Choose a drink preference.'},400);

 try{
  const [staffRows,shiftRows]=await Promise.all([queryAll(STAFF_SOURCE,'Staff Profiles'),queryAll(SHIFTS_SOURCE,'Work Planner Shifts')]);
  const staff=staffRows.find(x=>x.id===session.staffId);if(!staff)return response({error:'Staff profile not found.'},401);
  const staffStatus=text(staff.properties,'Staff Status');if(staffStatus!=='Active'||checked(staff.properties,'Access Suspended'))return response({error:'This staff profile is inactive or suspended. Contact Gary.'},403);
  const staffName=text(staff.properties,'Name').normalize('NFKC').trim();if(!staffName)return response({error:'Your staff profile has no name; contact Gary.'},409);
  const selectedRows=shiftIds.map(id=>shiftRows.find(x=>x.id===id));
  if(selectedRows.some(x=>!x))return response({error:'One or more selected shifts no longer exist. Reload the shift list and try again.'},409);
  const shifts=selectedRows.map(selected=>({id:selected.id,shift:text(selected.properties,'Shift'),date:text(selected.properties,'Date'),window:text(selected.properties,'Window'),location:text(selected.properties,'Location'),status:text(selected.properties,'Status')}));
  const allowedStatuses=cancelling||changing?['Available','Live','Confirmed']:['Available'];
  if(shifts.some(shift=>!allowedStatuses.includes(shift.status)))return response({error:'One or more selected shifts are no longer available for this request type. Reload the shift list.'},409);
  if(shifts.some(shift=>!shift.date))return response({error:'One or more selected Work Planner shifts have no date. Contact Gary before submitting.'},409);
  const createdRequests=[];
  try{
   // One form submission creates ONE request record. Every selected Work Planner
   // shift is stored in the same multi-page relation, so approval/decline happens once.
   const properties=buildProperties(staffName,shifts,{...body,submissionType});
   let created, lastCreateError;
   const sourceCandidates=[...new Set([REQUEST_SOURCE,DEFAULT_REQUEST_SOURCE])];
   const databaseCandidates=[...new Set([REQUEST_DATABASE,DEFAULT_REQUEST_DATABASE])];
   const parents=[...sourceCandidates.map(id=>({data_source_id:id})),...databaseCandidates.map(id=>({database_id:id}))];
   for(const parent of parents){
    try { created=await notion('https://api.notion.com/v1/pages',{method:'POST',body:JSON.stringify({parent,properties})},`Create Helper Shift Request (${parent.data_source_id?'data source':'database'} parent)`); break; }
    catch(error){lastCreateError=error;if(error?.status!==404)throw error;}
   }
   if(!created)throw lastCreateError||new Error('No valid Helper Shift Requests parent was available.');
   createdRequests.push({id:created.id,url:created.url,name:staffName,date:shifts[0].date,shift:shifts.map(x=>x.shift).filter(Boolean).join(', '),shiftIds:shifts.map(x=>x.id),shiftCount:shifts.length,status:'⏳ Pending'});
  }catch(error){
   console.error('Helper request create failed',error?.message||error);
   throw error;
  }
  return response({ok:true,createdCount:1,selectedShiftCount:shifts.length,requests:createdRequests,request:createdRequests[0]},201);
 }catch(e){console.error('Helper request submit failed',e?.message||e);const detail=e?.status===404?`Notion returned 404 for every configured and canonical request destination. Last API detail: ${String(e?.message||'No API message').slice(0,500)}. Check that the Netlify integration is connected to the Helper Shift Requests database and that its environment IDs match the live source; Work Planner reads are working, but request creation is not.`:'Could not save the request to Notion. No success has been assumed; reload and try again, or contact Gary if it continues.';return response({error:detail},503)}
};
export const config={path:'/.netlify/functions/helper-requests',method:['GET','POST'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:30}};
