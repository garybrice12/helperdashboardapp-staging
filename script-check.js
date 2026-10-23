
    const views=[...document.querySelectorAll('.view')],tabs=[...document.querySelectorAll('[data-view]')];
    function show(id){views.forEach(v=>v.classList.toggle('active',v.id===id));tabs.forEach(t=>t.classList.toggle('active',t.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});history.replaceState(null,'','#'+id)}
    tabs.forEach(t=>t.addEventListener('click',()=>show(t.dataset.view)));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));
    const initial=location.hash.slice(1);if(views.some(v=>v.id===initial))show(initial);
    const loginForm=document.getElementById('login-form'),loginStatus=document.getElementById('login-status'),loginBox=document.getElementById('login-box'),staffCard=document.getElementById('staff-card');
    function showStaff(staff){if(!staff){loginBox.style.display='block';staffCard.classList.remove('visible');return}loginBox.style.display='none';staffCard.classList.add('visible');document.getElementById('staff-name').textContent=staff.name||'Staff member';document.getElementById('staff-position').textContent=staff.position||'Team member';document.getElementById('staff-status').textContent=staff.status||'Signed in';document.getElementById('staff-work').textContent=staff.currentWork||'';const photo=document.getElementById('staff-photo');if(staff.photoUrl){photo.src=staff.photoUrl;photo.style.display='block'}else{photo.removeAttribute('src');photo.style.display='none'}}
    async function loadMyRequests(){const status=document.getElementById('my-requests-status'),list=document.getElementById('my-requests-list');if(!status||!list)return;list.replaceChildren();try{const r=await fetch('/.netlify/functions/helper-requests',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Sign in to view your requests.');if(!d.requests?.length){status.textContent='No shift requests found under your staff profile name.';return}status.textContent='Showing only requests matching your staff profile name.';d.requests.forEach(item=>{const li=document.createElement('li'),ico=document.createElement('span'),body=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small'),link=document.createElement('a');ico.className='ico';ico.textContent='📋';b.textContent=item.shift||item.date||'Shift request';small.textContent=[item.availability,item.status,item.submittedAt?new Date(item.submittedAt).toLocaleDateString('en-GB'):''].filter(Boolean).join(' · ')||'Status not recorded';body.append(b,small);li.append(ico,body);if(item.url){link.href=item.url;link.target='_blank';link.rel='noopener';link.className='chev';link.textContent='›';link.setAttribute('aria-label','Open request');li.append(link)}list.append(li)})}catch(e){status.textContent=e.message||'Could not load your requests.'}}
    async function checkSession(){try{const r=await fetch('/.netlify/functions/helper-login?action=me',{cache:'no-store'});const d=await r.json();if(r.ok&&d.authenticated){showStaff(d.staff);loadMyRequests()}else{showStaff(null);const s=document.getElementById('my-requests-status');if(s)s.textContent='Sign in to view requests submitted under your staff profile.'}}catch(e){console.warn('Staff session check unavailable',e)}}
    loginForm.addEventListener('submit',async e=>{e.preventDefault();const button=document.getElementById('login-submit');button.disabled=true;loginStatus.textContent='Checking PIN…';try{const r=await fetch('/.netlify/functions/helper-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:document.getElementById('staff-pin').value.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not sign in.');showStaff(d.staff);loadMyRequests();loginStatus.textContent='Signed in successfully.';document.getElementById('staff-pin').value=''}catch(err){loginStatus.textContent=err.message||'Sign-in failed.'}finally{button.disabled=false}});
    document.getElementById('logout-button').addEventListener('click',async()=>{try{await fetch('/.netlify/functions/helper-login?action=logout',{method:'POST'})}catch{}showStaff(null);const rs=document.getElementById('my-requests-status');if(rs)rs.textContent='Sign in to view requests submitted under your staff profile.';document.getElementById('my-requests-list').replaceChildren();loginStatus.textContent='Signed out.'});
    const feedbackForm=document.getElementById('feedback-form');feedbackForm.addEventListener('submit',async e=>{e.preventDefault();const button=document.getElementById('feedback-submit'),status=document.getElementById('feedback-status');button.disabled=true;status.textContent='Sending…';try{const r=await fetch('/.netlify/functions/submit-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('feedback-name').value.trim(),type:document.getElementById('feedback-type').value,area:document.getElementById('feedback-area').value,feedback:document.getElementById('feedback-message').value.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Feedback could not be saved.');status.textContent='Feedback saved for Gary to review.';document.getElementById('feedback-message').value=''}catch(err){status.textContent=err.message||'Could not send feedback.'}finally{button.disabled=false}});
    checkSession();


    const aiForm=document.getElementById('ai-form'),aiInput=document.getElementById('ai-input'),aiThread=document.getElementById('ai-thread'),aiSend=document.getElementById('ai-send');
    function addMessage(text,type='assistant'){const el=document.createElement('div');el.className='message '+type;el.textContent=text;aiThread.appendChild(el);aiThread.scrollTop=aiThread.scrollHeight;return el}
    async function askAI(question){
      addMessage(question,'user');aiInput.value='';aiSend.disabled=true;const waiting=addMessage('Thinking…','assistant');
      try{
        const response=await fetch('/.netlify/functions/ask-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});
        const data=await response.json().catch(()=>({}));waiting.remove();
        if(!response.ok)throw new Error(data.error||'The assistant is unavailable right now.');
        addMessage(data.answer||'I could not find an approved answer to that question.');
      }catch(error){waiting.remove();addMessage(error.message||'The assistant is unavailable right now.','error')}
      finally{aiSend.disabled=false;aiInput.focus()}
    }
    aiForm.addEventListener('submit',event=>{event.preventDefault();const question=aiInput.value.trim();if(question)askAI(question)});
    document.querySelectorAll('.suggestion').forEach(button=>button.addEventListener('click',()=>askAI(button.textContent)));
    
    async function loadDashboardData(){
      const money=v=>v===null||v===undefined||v===''?'—':'£'+Number(v||0).toFixed(2).replace(/\.00$/,'');
      const set=(id,v)=>{const e=document.getElementById(id);if(e&&v!==undefined)e.textContent=(v===null||v==='')?'—':v};
      const status=document.getElementById('connection-status');
      const hoursText=v=>v===null||v===undefined?'—':`${Math.floor(Number(v))}h${Math.round((Number(v)%1)*60)?' '+Math.round((Number(v)%1)*60)+'m':''}`;
      try{
        const response=await fetch('/api/dashboard-data',{cache:'no-store'});
        if(!response.ok) throw new Error('Live Notion data unavailable');
        const d=await response.json();
        if(d.dataUnavailable){
          if(status){status.classList.add('sync-error');status.innerHTML='<span class="dot"></span>Sync unavailable'}
          set('next-status','Live data unavailable');set('next-day','Unable to load shift data');set('next-location-time','Check the Notion connection');
          set('next-deadline','Figures are not being shown as current until the connection is restored.');
          set('next-gross',null);set('next-trips',null);set('next-pay',null);set('next-hours',null);set('next-quest','Quest status unavailable');
          set('owed-amount',null);set('owed-detail','Live Notion connection unavailable — no balance shown.');
          set('latest-payment',null);set('payment-reference','Payment data unavailable');set('payment-status','Unavailable');
          return;
        }
        if(status){if(d.syncError){status.classList.add('sync-error');status.innerHTML='<span class="dot"></span>Sync issue'}else{status.classList.remove('sync-error');status.innerHTML='<span class="dot"></span>Live data'}}
        const n=d.nextShift||{},r=d.recentShift||{},pay=d.latestPayment||{},w=d.currentWeek||{};
        const nextLocation=[n.location,(n.start||n.end)?`${n.start||''}${n.start&&n.end?'–':''}${n.end||''}`:''].filter(Boolean).join(' · ');
        set('next-status',n.status||'No upcoming confirmed shift');set('next-day',n.day||'No upcoming helper shift');set('next-location-time',nextLocation||'No confirmed helper shift');
        set('next-deadline',n.responseDeadline?`Please respond by ${n.responseDeadline}${n.finalConfirmation?`. Final confirmation is sent at ${n.finalConfirmation}.`:'.'}`:'Only confirmed or live helper shifts are shown here.');
        set('next-gross',money(n.targetGross));set('next-trips',n.targetTrips);set('next-pay',money(n.estimatedHelperPay));set('next-hours',n.plannedHours==null?'—':`${n.plannedHours} hrs`);set('next-quest',`Quest: ${String(n.quest||'Not currently confirmed').toLowerCase()}`);
        set('recent-day',r.day||'No completed helper shift recorded');set('recent-location-time',[r.location,(r.start||r.end)?`${r.start||''}${r.start&&r.end?'–':''}${r.end||''}`:''].filter(Boolean).join(' · ')||'—');set('recent-gross',money(r.gross));set('recent-trips',r.trips);set('recent-time',r.helperTime||'—');set('recent-pay',money(r.helperPay));set('recent-boost',r.tripBoost==null?'—':money(r.tripBoost));
        set('owed-amount',money(d.currentlyOwed));set('owed-detail',`Synced from the Notion Earnings Log${d.updatedAt?' · '+new Date(d.updatedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):''}.`);
        set('latest-payment',money(pay.amount));set('payment-reference',pay.amount==null?'No payment recorded':`Reference ${pay.reference||''} · ${pay.date||''}`);set('payment-status',pay.amount==null?'No record':'Paid');
        const breakdown=document.getElementById('payment-breakdown');if(breakdown){breakdown.innerHTML='';if(Array.isArray(pay.breakdown)&&pay.breakdown.length){pay.breakdown.forEach(x=>{const li=document.createElement('li'),ico=document.createElement('span'),body=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small');ico.className='ico';ico.textContent='✓';b.textContent=x.label||'Payment entry';small.textContent=x.detail||'';body.append(b,small);li.append(ico,body);breakdown.append(li)})}else{const li=document.createElement('li');li.textContent='No payment breakdown available.';breakdown.append(li)}}

        // Keep one entry per Notion page. The Notion query is paginated, and
        // page IDs prevent a repeated record from inflating weekly totals.
        const rawWeeklyRows=Array.isArray(d.weeklyRows)?d.weeklyRows:[];
        const seenWeeklyKeys=new Set();
        const weeklyRows=rawWeeklyRows.filter(row=>{
          if(!row||typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(row.date))return false;
          // Notion date properties may include a time and timezone. Normalize
          // dates before week grouping/comparison so Sunday rows are not lost.
          row.date=row.date.slice(0,10);
          if(typeof row.paidDate==='string'&&row.paidDate.length>=10)row.paidDate=row.paidDate.slice(0,10);
          // Prefer the stable Notion page ID. If an API payload omits it, use a
          // row fingerprint instead of treating every missing ID as the same row.
          const key=row.id?`id:${row.id}`:`row:${[row.date,row.shiftTime,row.location,row.gross,row.trips,row.miles,row.helperPaid].join('|')}`;
          if(seenWeeklyKeys.has(key))return false;
          seenWeeklyKeys.add(key);return true;
        });
        const picker=document.getElementById('week-picker');
        const isoDate=date=>date.toISOString().slice(0,10);
        const mondayOf=date=>{const x=new Date(date+'T12:00:00Z');const day=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-day);return isoDate(x)};
        const weekEndOf=start=>{const x=new Date(start+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+6);return isoDate(x)};
        const currentStart=w.weekStart||mondayOf(new Date().toISOString().slice(0,10));
        // Build the selector from every dated helper earnings record returned
        // by the paginated API, not just records in the current week.
        const weekStarts=[...new Set([currentStart,...weeklyRows.filter(row=>row.date).map(row=>mondayOf(row.date))])].sort().reverse();
        if(picker){picker.innerHTML='';weekStarts.forEach(start=>{const end=weekEndOf(start),opt=document.createElement('option');opt.value=start;opt.textContent=`${new Date(start+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})} – ${new Date(end+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}${start===currentStart?' · Current week':''}`;picker.append(opt)});if(!picker.dataset.bound){picker.addEventListener('change',()=>renderSelectedWeek(picker.value));picker.dataset.bound='1';}}
        function renderSelectedWeek(start){
          const end=weekEndOf(start),rows=weeklyRows.filter(row=>row.date>=start&&row.date<=end&&((Number(row.gross)||0)>0||(Number(row.trips)||0)>0||(Number(row.helperHours)||0)>0));
          const paidRows=weeklyRows.filter(row=>row.paidDate&&row.paidDate>=start&&row.paidDate<=end);
          const hoursOf=row=>{if(row.helperHours!==null&&row.helperHours!==undefined&&Number.isFinite(Number(row.helperHours)))return Number(row.helperHours);const m=String(row.shiftTime||'').match(/(\d{1,2}):(\d{2})\s*(am|pm)?\s*[–-]\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i);if(!m)return 0;const mins=(h,mi,suf)=>{let v=Number(h);if(suf){if(suf.toLowerCase()==='pm'&&v<12)v+=12;if(suf.toLowerCase()==='am'&&v===12)v=0;}return v*60+Number(mi)};let a=mins(m[1],m[2],m[3]),b=mins(m[4],m[5],m[6]);if(b<a)b+=1440;return (b-a)/60};
          const hours=rows.reduce((sum,row)=>sum+hoursOf(row),0),gross=rows.reduce((sum,row)=>sum+(Number(row.gross)||0),0),trips=rows.reduce((sum,row)=>sum+(Number(row.trips)||0),0),boost=rows.reduce((sum,row)=>sum+(Number(row.helperBoost)||0),0),fuel=rows.reduce((sum,row)=>sum+(Number(row.miles)||0)*.30,0),earned=rows.reduce((sum,row)=>sum+(Number(row.helperPayout)||0),0),paid=paidRows.reduce((sum,row)=>sum+(Number(row.helperPaid)||0),0),outstanding=rows.reduce((sum,row)=>sum+(row.helperOutstanding!=null?Number(row.helperOutstanding):Math.max(0,(Number(row.helperPayout)||0)-(Number(row.helperPaid)||0))),0);
          const fmtDate=(value,year=false)=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'});
          if(start===currentStart){
            const currentEnd=w.weekEnd||end;
            set('week-dates',w.weekStart&&w.weekEnd?`${fmtDate(w.weekStart)} – ${fmtDate(currentEnd,true)}`:`${fmtDate(start)} – ${fmtDate(end,true)}`);
            // Calculate from dated Earnings Log rows when present. If the API
            // returns no weekly rows but does return the recent helper shift,
            // use that shift rather than displaying a misleading all-zero week.
            const recent=d.recentShift||{};
            const recentInWeek=recent.date&&String(recent.date).slice(0,10)>=start&&String(recent.date).slice(0,10)<=end;
            const fallbackRows=rows.length===0&&recentInWeek?[recent]:[];
            const sourceRows=rows.length?rows:fallbackRows;
            const fallbackHours=sourceRows.reduce((sum,row)=>sum+(Number(row.helperHours)||hoursOf(row)),0);
            const fallbackEarned=sourceRows.reduce((sum,row)=>sum+(Number(row.helperPayout??row.helperPay)||0),0);
            const fallbackPaid=sourceRows.reduce((sum,row)=>sum+(Number(row.helperPaid)||0),0);
            const fallbackOutstanding=sourceRows.reduce((sum,row)=>sum+(row.helperOutstanding!=null?Number(row.helperOutstanding):Math.max(0,(Number(row.helperPayout??row.helperPay)||0)-(Number(row.helperPaid)||0))),0);
            const useRollup=sourceRows.length===0&&Number(w.shiftCount||0)>0;
            set('week-shifts',sourceRows.length?sourceRows.length:(useRollup?w.shiftCount:0));
            set('week-hours',hoursText(sourceRows.length?fallbackHours:(useRollup?(w.hours??0):0)));
            set('week-earned',money(sourceRows.length?fallbackEarned:(useRollup?(w.earned??0):0)));
            set('week-paid',money(sourceRows.length?fallbackPaid:(useRollup?(w.paid??0):0)));
            set('week-outstanding',money(sourceRows.length?fallbackOutstanding:(useRollup?(w.outstanding??0):0)));
            set('week-caption',rows.length?'Totals are calculated from dated Earnings Log records for the selected week.':(fallbackRows.length?'Showing the recent completed shift because no weekly earnings rows were returned.':(useRollup?(w.caption||'Current-week totals from the live Earnings Log rollup.'):'No current-week helper earnings records were returned from Notion.')));
          }else{
            set('week-dates',`${fmtDate(start)} – ${fmtDate(end,true)}`);set('week-shifts',rows.length);set('week-hours',hoursText(hours));set('week-earned',money(earned));set('week-paid',money(paid));set('week-outstanding',money(outstanding));set('week-caption',rows.length?'Totals are based on helper earnings records for the selected week.':'No helper earnings recorded for this week.');
          }
          set('weekly-breakdown-dates',`${fmtDate(start)} – ${fmtDate(end,true)}`);set('wb-average-shift',rows.length?money(gross/rows.length):'—');set('wb-hourly',hours>0?money(gross/hours):'—');set('wb-trips',trips);set('wb-trips-hour',hours>0?(trips/hours).toFixed(1):'—');set('wb-gross',money(gross));set('wb-fuel',money(fuel));set('wb-boost',money(boost));set('wb-unpaid',rows.filter(row=>!(Number(row.helperPaid)>0)).length);
        }
        if(picker){picker.value=currentStart;renderSelectedWeek(currentStart);}else{set('week-dates',w.weekStart&&w.weekEnd?`${new Date(w.weekStart+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})} – ${new Date(w.weekEnd+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}`:'Current week');set('week-shifts',w.shiftCount??'—');set('week-hours',hoursText(w.hours));set('week-earned',money(w.earned));set('week-paid',money(w.paid));set('week-outstanding',money(w.outstanding));set('week-caption',w.caption||'Weekly totals calculated from completed helper earnings records.');}
      }catch(e){console.warn('Dashboard live-data load failed',e);if(status){status.classList.add('sync-error');status.innerHTML='<span class="dot"></span>Sync unavailable'}set('owed-amount',null);set('owed-detail','Live Notion connection unavailable — no balance shown.');}
    }
    const liveShiftImage=document.getElementById('live-shift-image');
    if(liveShiftImage){const wrap=liveShiftImage.closest('.shift-image-wrap');const setBackdrop=()=>{if(wrap)wrap.style.setProperty('--shift-backdrop',`url(\"${liveShiftImage.currentSrc||liveShiftImage.src}\")`)};if(liveShiftImage.complete&&liveShiftImage.naturalWidth)setBackdrop();liveShiftImage.addEventListener('load',setBackdrop);liveShiftImage.addEventListener('error',()=>{const caption=document.getElementById('live-shift-image-caption');if(caption)caption.textContent='Live shift graphic could not load from Notion Graphic Control. Check the Notion image connection.';});}
    loadDashboardData();

    if('serviceWorker' in navigator){window.addEventListener('load',async()=>{try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));if('caches' in window){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}}catch(e){console.warn('Cache cleanup skipped',e);}});}
  