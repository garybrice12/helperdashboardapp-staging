import crypto from 'node:crypto';
const TOKEN=process.env.NOTION_TOKEN,SECRET=process.env.HELPER_SESSION_SECRET;
const STAFF_SOURCE=process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID||'f9c437cb-bf7e-430d-ba44-a16038607edb';
const REQUEST_SOURCE=process.env.NOTION_HELPER_REQUESTS_DATA_SOURCE_ID||'d9bdbc65-2285-4176-ac81-ed3c96d6bb22';
const SHIFTS_SOURCE=process.env.NOTION_SHIFTS_DATA_SOURCE_ID||'5f05970c-fcc0-497b-aa62-3e8edefbbb2b';
const COMPLETED_SOURCE=process.env.NOTION_COMPLETED_SHIFTS_DATA_SOURCE_ID||'e2427666-dc40-4cdd-be84-49bd51826862';
const NV='2025-09-03';
const ukDateISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const out=(d,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store, max-age=0'}});
const plain=a=>(a||[]).map(x=>x.plain_text||x.text?.content||'').join('').trim();
function val(p,n){const x=p?.[n];if(!x)return '';if(x.type==='title')return plain(x.title);if(x.type==='rich_text')return plain(x.rich_text);if(x.type==='select'||x.type==='status')return x.select?.name||x.status?.name||'';if(x.type==='date')return x.date?.start||'';return ''}
function requestSummary(p,shifts){const lines=[];const add=(label,value)=>{const v=String(value||'').trim();if(v)lines.push(`${label}: ${v}`)};add('Request type',val(p,'Submission type'));add('Availability',val(p,'Availability'));if(shifts.length){lines.push('Selected shifts:');shifts.forEach((x,i)=>lines.push(`${i+1}. ${[x.date,x.window,x.location,x.quest?'Quest shift':null,x.status?`Status: ${x.status}`:null].filter(Boolean).join(' · ')}`))}add('Unavailable reason',val(p,'Unavailable reason'));add('Pick-up',val(p,'Submitted pick-up')||val(p,'Pick-up'));add('Pick-up time',val(p,'Submitted pick-up time')||val(p,'Pick-up time'));add('Other pick-up details',val(p,'Submitted other pick-up details')||val(p,'Other Pickup Details')||val(p,'Other Pick-up Location'));add('Other pick-up / meet-up time',val(p,'Other Pick-up/Meet-up time'));add('Drink',val(p,'Submitted drink')||val(p,'Drink'));add('Other food / drink request',val(p,'Other Drink/Food Request'));add('Preferred start time',val(p,'Preferred start time (within shift window)'));add('Preferred finish time',val(p,'Preferred finish time (within shift window)'));add('Other information',val(p,'Other Requests or relevant Information'));add('Decision',val(p,'Decision status')||val(p,'Pending Request'));return lines.join('\n')||'No additional form details were recorded for this request.'}
function dedupeShiftCards(rows){
 const unique=new Map();
 for(const row of rows){
  const shift={id:row.id,title:val(row.properties,'Shift'),date:val(row.properties,'Date'),window:val(row.properties,'Window'),location:val(row.properties,'Location'),status:val(row.properties,'Status'),staffProfileIds:(row.properties?.['Staff Profile']?.relation||[]).map(x=>x.id),crewMemberIds:(row.properties?.['Crew members']?.relation||[]).map(x=>x.id),lastEdited:row.last_edited_time||row.created_time||''};
  const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-GB');
  const identity=[shift.date,shift.title,shift.window,shift.location].map(norm);
  if(!identity[0]||!identity.slice(1).some(Boolean)){unique.set(`record:${row.id}`,shift);continue}
  const key=identity.join('|');
  const prior=unique.get(key);
  if(!prior||String(shift.lastEdited)>String(prior.lastEdited))unique.set(key,shift);
 }
 return [...unique.values()].map(({lastEdited,...shift})=>shift);
}
function verify(token){if(!token||!SECRET)return null;const [p,s]=token.split('.');if(!p||!s)return null;const e=crypto.createHmac('sha256',SECRET).update(p).digest();let a;try{a=Buffer.from(s,'base64url')}catch{return null}if(a.length!==e.length||!crypto.timingSafeEqual(a,e))return null;try{const v=JSON.parse(Buffer.from(p,'base64url').toString());return v.exp>Date.now()&&v.staffId?v:null}catch{return null}}
async function notion(url,options={}){const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${TOKEN}`,'Notion-Version':NV,'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Notion ${r.status}: ${d.message||'request failed'}`);return d}
async function queryAll(source){let rows=[],cursor;do{const d=await notion(`https://api.notion.com/v1/data_sources/${source}/query`,{method:'POST',body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})});rows.push(...(d.results||[]));cursor=d.has_more?d.next_cursor:null}while(cursor);return rows}
async function sessionRevoked(session){try{const {getStore}=await import('@netlify/blobs');const store=getStore('helper-session-revocations',{consistency:'strong'});const [allRaw,staffRaw]=await Promise.all([store.get('all',{type:'text'}),store.get(`staff:${session.staffId}`,{type:'text'})]);const allAt=Number(allRaw||0),staffAt=Number(staffRaw||0);return (allAt>0&&(!session.iat||session.iat<=allAt))||(staffAt>0&&(!session.iat||session.iat<=staffAt))}catch(error){console.error('Admin session revocation check failed',error?.message||error);return true}}
async function sessionIsCurrent(session){try{const {getStore}=await import('@netlify/blobs');const store=getStore('helper-active-sessions',{consistency:'strong'});return !!session?.sessionId&&(await store.get(`staff:${session.staffId}`,{type:'text'}))===session.sessionId}catch(error){console.error('Admin active-session check failed',error?.message||error);return false}}
function cookie(req){const x=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('helper_session='));return verify(x?.slice(15))}
export default async req=>{
 if(!['GET','POST'].includes(req.method))return out({error:'Method not allowed'},405);
 if(!TOKEN||!SECRET)return out({error:'Admin management is not configured.'},503);
 const session=cookie(req);if(!session)return out({error:'Sign in required.'},401);if(await sessionRevoked(session))return out({error:'Your session has been signed out. Please sign in again.'},401);if(!(await sessionIsCurrent(session)))return out({error:'You have been signed out because your account was logged in on another device.'},401);
 try{
  const staffRows=await queryAll(STAFF_SOURCE),staff=staffRows.find(x=>x.id===session.staffId);
  if(!staff||staff.properties?.['Admin Access']?.checkbox!==true)return out({error:'Admin access required.'},403);
  if(staff.properties?.['Staff Status']?.select?.name!=='Active'||staff.properties?.['Access Suspended']?.checkbox===true)return out({error:'This admin profile is inactive or suspended.'},403);
  if(req.method==='GET'){
   const [requests,shifts]=await Promise.all([queryAll(REQUEST_SOURCE),queryAll(SHIFTS_SOURCE)]);
   const shiftMap=new Map(shifts.map(x=>[x.id,x]));
   const today= new Date(`${ukDateISO()}T00:00:00Z`);
   const sevenDaysAgo=new Date(today);sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate()-7);
   const sevenDaysAhead=new Date(today);sevenDaysAhead.setUTCDate(sevenDaysAhead.getUTCDate()+7);
   const iso=d=>d.toISOString().slice(0,10);
   const requestCutoff=sevenDaysAgo.toISOString();
   const recentRequests=requests.filter(x=>{const created=Date.parse(x.created_time||'');return Number.isFinite(created)&&created>=Date.parse(requestCutoff)});
   const staffDirectory=staffRows.map(x=>({id:x.id,name:val(x.properties,'Name'),staffCode:val(x.properties,'Staff ID'),active:val(x.properties,'Staff Status')==='Active'&&x.properties?.['Access Suspended']?.checkbox!==true})).filter(x=>x.id&&x.name);
   const activeStaff=staffDirectory.filter(x=>x.active);
   const staffById=new Map(staffDirectory.map(x=>[x.id,x.name]));
   const activeShifts=dedupeShiftCards(shifts)
    .filter(x=>x.date&&x.date>=iso(today)&&x.date<=iso(sevenDaysAhead)&&x.status!=='Completed')
    .map(x=>({...x,assignedCrew:x.staffProfileIds.map(id=>staffById.get(id)).filter(Boolean)}))
    .sort((a,b)=>a.date.localeCompare(b.date)||a.window.localeCompare(b.window)||a.title.localeCompare(b.title));
   return out({
    staffProfiles:staffDirectory,
    requests:recentRequests.map(x=>{const selected=(x.properties?.['Requested shift window']?.relation||[]).map(r=>{const q=shiftMap.get(r.id);return q?{id:q.id,title:val(q.properties,'Shift'),date:val(q.properties,'Date'),window:val(q.properties,'Window'),location:val(q.properties,'Location'),status:val(q.properties,'Status'),quest:q.properties?.Quest?.checkbox===true}:null}).filter(Boolean);return {id:x.id,url:x.url,name:val(x.properties,'Name'),date:val(x.properties,'Date'),type:val(x.properties,'Submission type'),status:val(x.properties,'Decision status')||val(x.properties,'Pending Request'),summary:requestSummary(x.properties,selected),shifts:selected,created:x.created_time}}).sort((a,b)=>String(b.created||'').localeCompare(String(a.created||''))),
    shifts:activeShifts,
    window:{requestsSince:requestCutoff,shiftFrom:iso(today),shiftThrough:iso(sevenDaysAhead)}
   });
  }
  const origin=req.headers.get('origin');if(origin){try{if(new URL(origin).host!==new URL(req.url).host)return out({error:'Request origin not allowed.'},403)}catch{return out({error:'Invalid request origin.'},403)}}
  const body=await req.json().catch(()=>({}));
  if(!['set-status','assign-crew'].includes(body.action))return out({error:'Unsupported admin action.'},400);
  if(!/^[0-9a-f-]{36}$/i.test(String(body.shiftId||'')))return out({error:'Choose a valid shift.'},400);
  const shift=await notion(`https://api.notion.com/v1/pages/${body.shiftId}`);
  const source=shift.properties||{},statusProp=source.Status;
  if(!statusProp||!['select','status'].includes(statusProp.type))return out({error:'The Work Planner Status property is not editable as a select/status.'},409);
  if(body.action==='assign-crew'){
   const date=val(source,'Date'),currentStatus=val(source,'Status');
   if(!date||date<ukDateISO()||['Completed','Cancelled'].includes(currentStatus))return out({error:'Crew can only be changed on an upcoming shift that is not completed or cancelled.'},409);
   const ids=Array.isArray(body.staffProfileIds)?[...new Set(body.staffProfileIds.map(x=>String(x||'')))]:[];
   if(ids.length>10||ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return out({error:'Choose up to 10 valid staff profiles.'},400);
   const activeById=new Map(staffRows.filter(x=>val(x.properties,'Staff Status')==='Active'&&x.properties?.['Access Suspended']?.checkbox!==true).map(x=>[x.id,val(x.properties,'Name')]));
   if(ids.some(id=>!activeById.has(id)))return out({error:'One or more selected staff profiles are inactive, suspended or unavailable.'},409);
   const properties={'Staff Profile':{relation:ids.map(id=>({id}))}};
   if(!ids.length&&currentStatus==='Confirmed')properties.Status=statusProp.type==='select'?{select:{name:'Available'}}:{status:{name:'Available'}};
   await notion(`https://api.notion.com/v1/pages/${body.shiftId}`,{method:'PATCH',body:JSON.stringify({properties})});
   return out({ok:true,shiftId:body.shiftId,staffProfileIds:ids,assignedCrew:ids.map(id=>activeById.get(id)),status:!ids.length&&currentStatus==='Confirmed'?'Available':currentStatus});
  }
  const allowed=['Available','Confirmed','Live','Cancelled','Completed'];
  if(!allowed.includes(body.status))return out({error:'Choose a valid shift status.'},400);
  if(body.status==='Completed'){
    const requestedCrewIds=Array.isArray(body.crewMemberIds)?[...new Set(body.crewMemberIds.map(x=>String(x||'')))]:[];
    const existingCrewIds=(source['Crew members']?.relation||[]).map(x=>x.id);
    const actualCrewIds=body.crewMemberIds===undefined?existingCrewIds:requestedCrewIds;
    if(!actualCrewIds.length)return out({error:'Select the staff members who actually worked this shift before completing it.'},409);
    if(actualCrewIds.length>10||actualCrewIds.some(id=>!/^[0-9a-f-]{36}$/i.test(id))||actualCrewIds.some(id=>!staffRows.some(person=>person.id===id)))return out({error:'One or more actual crew profiles are invalid.'},400);
    if(body.crewMemberIds!==undefined){
      await notion(`https://api.notion.com/v1/pages/${body.shiftId}`,{method:'PATCH',body:JSON.stringify({properties:{'Crew members':{relation:actualCrewIds.map(id=>({id}))}}})});
      source['Crew members']={type:'relation',relation:actualCrewIds.map(id=>({id}))};
    }
    const archiveProps={};
    const titleValue=source.Shift?.title||[];
    archiveProps.Shift={title:titleValue.length?titleValue:[{text:{content:'Completed helper shift'}}]};
    const dateValue=source.Date?.date;
    if(dateValue?.start)archiveProps.Date={date:{start:dateValue.start,...(dateValue.end?{end:dateValue.end}:{})}};
    const richFields=['Window','Location','Reference'];
    for(const key of richFields){const value=source[key]?.rich_text;if(value?.length)archiveProps[key]={rich_text:value}}
    const numberFields=['Actual Trips','Actual Gross','Actual Fuel','Miles','Target Gross','Helper Pay','Planned Fuel','Trip Target'];
    for(const key of numberFields){if(source[key]?.number!==null&&source[key]?.number!==undefined)archiveProps[key]={number:source[key].number}}
    if(source.Crew?.select?.name)archiveProps.Crew={select:{name:source.Crew.select.name}};
    if(source['Payment Status']?.select?.name)archiveProps['Payment Status']={select:{name:source['Payment Status'].select.name}};
    if(source.Quest?.checkbox!==undefined)archiveProps.Quest={checkbox:source.Quest.checkbox};
    archiveProps.Completed={checkbox:true};archiveProps.Status={select:{name:'Completed'}};
    archiveProps['Crew members']={relation:actualCrewIds.map(id=>({id}))};
    const originalUrl=shift.url||`https://www.notion.so/${body.shiftId.replace(/-/g,'')}`;
    const priorReference=plain(source.Reference?.rich_text);
    archiveProps.Reference={rich_text:[{text:{content:[priorReference,`Source: ${originalUrl}`].filter(Boolean).join(' | ').slice(0,2000)}}]};
    const existingArchive=(await queryAll(COMPLETED_SOURCE)).find(x=>plain(x.properties?.Reference?.rich_text).includes(originalUrl));
    const archived=existingArchive
      ? await notion(`https://api.notion.com/v1/pages/${existingArchive.id}`,{method:'PATCH',body:JSON.stringify({properties:{'Crew members':{relation:actualCrewIds.map(id=>({id}))}}})})
      : await notion('https://api.notion.com/v1/pages',{method:'POST',body:JSON.stringify({parent:{data_source_id:COMPLETED_SOURCE},properties:archiveProps})});
    // Archive, do not delete, the original so request/earnings relations remain resolvable.
    if(!shift.archived)await notion(`https://api.notion.com/v1/pages/${body.shiftId}`,{method:'PATCH',body:JSON.stringify({archived:true})});
    return out({ok:true,shiftId:body.shiftId,status:'Completed',archiveId:archived.id,archiveUrl:archived.url});
  }
  const properties=statusProp.type==='select'?{Status:{select:{name:body.status}}}:{Status:{status:{name:body.status}}};
  await notion(`https://api.notion.com/v1/pages/${body.shiftId}`,{method:'PATCH',body:JSON.stringify({properties})});
  return out({ok:true,shiftId:body.shiftId,status:body.status});
 }catch(e){console.error('Admin shift management error',e?.message||e);return out({error:e.message||'Could not complete admin action.'},503)}
};
export const config={path:'/.netlify/functions/admin-shift-management',method:['GET','POST']};
