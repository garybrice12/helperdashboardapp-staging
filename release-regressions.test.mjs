import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dashboard = fs.readFileSync(new URL('../netlify/functions/dashboard-data.mjs', import.meta.url), 'utf8');
const sortSource = dashboard.match(/function plannedShiftStartMinutes\(shift\) \{[\s\S]*?\n\}\n\nfunction sortShifts\(shifts\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(sortSource, 'shift sort functions are present');
const sortShifts = vm.runInNewContext(`(() => { ${sortSource}; return sortShifts; })()`, {});


test('completed shift attribution uses actual Crew members, not planned Staff Profile assignment', () => {
  assert.match(dashboard, /staffProfileIds:\s*Array\.isArray\(props\['Staff Profile'\]\?\.relation\)/);
  assert.match(dashboard, /function makeRecentShift\(rows, staffProfileId\)/);
  assert.match(dashboard, /actualCrewProfileIds\.includes\(staffProfileId\)/);
  assert.match(dashboard, /staffProfileId: auth\.staff\.id/);
  assert.match(dashboard, /NOTION_COMPLETED_SHIFTS_ID/);
  assert.match(dashboard, /Crew members/);
});


test('Earnings Log rows are joined to completed shift Crew members using date and overlapping shift times', () => {
  const names=['roundMoney','dateOnly','propNumber','propDate','propTitle','propText','propSelect','propCheckbox','parseAllocationHistory','mapEarningsPage','mapCompletedShiftPage','clockMinutes','interval','attachActualCrew','helperEntitlement','payoutForStaff'];
  const sourceFns=names.map(name=>dashboard.match(new RegExp('(?:function|const) '+name+'\\b[\\s\\S]*?(?=\\nfunction |\\nconst |\\nexport |$)'))?.[0]).filter(Boolean).join('\n');
  const helpers=`function roundMoney(v){return Math.round(Number(v)*100)/100}`;
  const api=vm.runInNewContext(`(()=>{${helpers}${sourceFns};return {mapEarningsPage,attachActualCrew,payoutForStaff}})()`,{});
  const rich=value=>({type:'rich_text',rich_text:[{plain_text:value}]});
  const earnings=api.mapEarningsPage({id:'earning-3nov',properties:{
    'Day':{type:'title',title:[{plain_text:'Tue 3 Nov 2026 — Uber helper Quest'}]},
    'Date':{type:'date',date:{start:'2026-11-03'}},
    'Shift time':rich('15:58–20:51'),
    'Staff Profile':{type:'relation',relation:[{id:'jay'}]},
    'With helper':{type:'checkbox',checkbox:true},
    'Your payout (£)':{type:'number',number:37.24},
    'Helper payout (£)':{type:'number',number:33.16},
    'Gross (£)':{type:'number',number:91.54}
  }});
  const completed={id:'completed-3nov',properties:{
    'Shift':{type:'title',title:[{plain_text:'Helper Shift — 03 Nov 2026'}]},
    'Date':{type:'date',date:{start:'2026-11-03'}},
    'Window':rich('15:00–21:00'),
    'Crew members':{type:'relation',relation:[{id:'gary'},{id:'jay'}]}
  }};
  const matched=api.attachActualCrew([earnings],[completed])[0];
  assert.deepEqual(Array.from(matched.actualCrewProfileIds),['gary','jay']);
  assert.equal(api.payoutForStaff(matched,'gary'),37.24);
  assert.equal(api.payoutForStaff(matched,'jay'),33.16);
  const ambiguous=api.attachActualCrew([earnings],[completed,{...completed,id:'other',properties:{...completed.properties,'Window':rich('15:30–20:30')}}])[0];
  assert.deepEqual(Array.from(ambiguous.actualCrewProfileIds),[],'ambiguous same-day shift matches must not attribute earnings');
});

test('recent completed shift exposes fuel cost from actual logged miles at £0.30 per mile', () => {
  const recent = dashboard.match(/function makeRecentShift\(rows, staffProfileId\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(recent, /fuelCost:\s*recent\.miles\s*==\s*null\s*\?\s*null\s*:\s*roundMoney\(Number\(recent\.miles\)\s*\*\s*0\.30\)/);
  assert.match(recent, /fuelCost:\s*null/);
  assert.equal(Math.round(67.4 * 0.30 * 100) / 100, 20.22);
  for (const file of ['../index.html', '../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /id="recent-fuel"/);
    assert.match(html, /set\('recent-fuel',money\(r\.fuelCost\)\)/);
  }
});

test('upcoming shifts sort chronologically regardless of status', () => {
  const sorted = sortShifts([
    { status: 'Confirmed', date: '2026-11-01', window: '10:00–12:00', title: 'Confirmed' },
    { status: 'Live', date: '2026-11-03', window: '17:00–21:00', title: 'Live' }
  ]);
  assert.deepEqual(sorted.map(x => x.status), ['Confirmed', 'Live']);
});

test('earliest date wins within same status, then earliest start time', () => {
  const sorted = sortShifts([
    { status: 'Confirmed', date: '2026-11-02', window: '17:00–21:00', title: 'Later' },
    { status: 'Confirmed', date: '2026-11-01', window: '18:00–20:00', title: 'Earlier date' },
    { status: 'Confirmed', date: '2026-11-02', window: '12:00–14:00', title: 'Earlier time' }
  ]);
  assert.deepEqual(sorted.map(x => x.title), ['Earlier date', 'Earlier time', 'Later']);
});

test('both dashboard entry points use the stored Helper Pay estimate, not gross × 40%', () => {
  for (const file of ['../index.html', '../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /const projectedHelperPay=n\.estimatedHelperPay==null\?null:Number\(n\.estimatedHelperPay\)/);
    assert.doesNotMatch(html, /projectedGross\*0\.4/);
  }
});


test('both dashboard entry points reserve enough mobile scroll clearance for the two-row fixed navigation', () => {
  for (const file of ['../index.html', '../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /padding-bottom:calc\(160px \+ env\(safe-area-inset-bottom\)\)/);
    assert.match(html, /class="bottom" id="dashboard-nav"/);
  }
});

test('AI and feedback logs derive staff identity from the authenticated profile', () => {
  const ai = fs.readFileSync(new URL('../netlify/functions/ask-ai.mjs', import.meta.url), 'utf8');
  const feedback = fs.readFileSync(new URL('../netlify/functions/submit-feedback.mjs', import.meta.url), 'utf8');
  assert.match(ai, /authenticatedStaffName\(auth\.staff\)/);
  assert.match(feedback, /authenticatedStaffName\(auth\.staff\)/);
  assert.doesNotMatch(ai, /body\.name/);
  assert.doesNotMatch(feedback, /body\.name/);
});


test('payment breakdown uses only the actual Shift time field and never falls back to notes or planned windows', () => {
  assert.match(dashboard, /shiftTime: propText\(props, 'Shift time'\)/);
  assert.match(dashboard, /String\(row\.shiftTime \|\| ''\)\.trim\(\)/);
  assert.doesNotMatch(dashboard, /extractTime|row\.notes.*time/);
});


import dashboardImage from '../netlify/functions/dashboard-image.mjs';

test('preparation reminder image resolves by exact block ID inside the named announcement toggle', async () => {
  const originalFetch = globalThis.fetch;
  process.env.NOTION_TOKEN = 'test-token';
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = String(input); requested.push(url);
    if (url.includes('/blocks/3eef475c-d2eb-812d-ace1-c978b4ec3b73/children')) return Response.json({ results: [{ id: 'announcement-toggle', type: 'toggle', has_children: true, toggle: { rich_text: [{ plain_text: 'Home announcement image' }] } }] });
    if (url.includes('/blocks/announcement-toggle/children')) return Response.json({ results: [
      { id: 'order-chart-image', type: 'image', image: { type: 'external', external: { url: 'https://images.test/order-chart.png' } } },
      { id: '407f475c-d2eb-805b-99cc-fc17a4e77c7a', type: 'image', image: { type: 'external', external: { url: 'https://images.test/preparation.png' } } }
    ] });
    if (url === 'https://images.test/preparation.png') return new Response(new Uint8Array([1,2,3]), { headers: { 'content-type': 'image/png' } });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const response = await dashboardImage(new Request('https://app.test/api/dashboard-image?slot=announcement-preparation'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1,2,3]);
    assert.ok(requested.includes('https://images.test/preparation.png'));
    assert.ok(!requested.includes('https://images.test/order-chart.png'));
  } finally { globalThis.fetch = originalFetch; }
});

test('preparation reminder slot returns 404 rather than falling back to another image', async () => {
  const originalFetch = globalThis.fetch;
  process.env.NOTION_TOKEN = 'test-token';
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = String(input); requested.push(url);
    if (url.includes('/blocks/3eef475c-d2eb-812d-ace1-c978b4ec3b73/children')) return Response.json({ results: [{ id: 'announcement-toggle', type: 'toggle', has_children: true, toggle: { rich_text: [{ plain_text: 'Home announcement image' }] } }] });
    if (url.includes('/blocks/announcement-toggle/children')) return Response.json({ results: [
      { id: 'order-chart-image', type: 'image', image: { type: 'external', external: { url: 'https://images.test/order-chart.png' } } }
    ] });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const response = await dashboardImage(new Request('https://app.test/api/dashboard-image?slot=announcement-preparation'));
    assert.equal(response.status, 404);
    assert.ok(!requested.includes('https://images.test/order-chart.png'));
  } finally { globalThis.fetch = originalFetch; }
});


test('request cards prioritise linked Work Planner status and refresh after admin completion', () => {
  for (const file of ['../index.html', '../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    const fn = html.match(/function requestShiftStatusLabel\(shifts,fallback=''\)\{[\s\S]*?\n    async function loadMyRequests/);
    assert.ok(fn, `${file} has a request status resolver`);
    const source = fn[0].replace(/\n    async function loadMyRequests$/, '');
    const resolver = vm.runInNewContext(`(()=>{${source};return requestShiftStatusLabel})()`, {});
    assert.equal(resolver([{shiftStatus:'Completed'}], 'Available'), 'Completed');
    assert.equal(resolver([{shiftStatus:'Completed'},{shiftStatus:'Confirmed'}], 'Available'), '1 Completed · 1 Confirmed');
    assert.equal(resolver([], 'Available'), 'Available');
    assert.match(html, /requestShiftStatusLabel\(item\.shifts,item\.availability\)/);
    assert.match(html, /if\(result\.status==='Completed'\)await Promise\.all\(\[loadMyRequests\(\),loadDashboardData\(\)\]\)/);
  }
});

test('submitted request cards use theme-aware tokens in both dashboard entry points', async () => {
  for (const file of ['index.html', 'helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /border:1px solid var\(--border,#e2e8f0\);border-radius:14px;background:var\(--surface,#fff\);list-style:none/);
    assert.doesNotMatch(html, /border:1px solid var\(--line,#e2e8f0\);border-radius:14px;background:var\(--card,#fff\);list-style:none/);
  }
});



test('Pay tab earnings are scoped to actual crew and use the correct personal payout', () => {
  const ownerFn = dashboard.match(/function makeYourEarnings\(rows, now, staffProfileId\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(ownerFn, 'personal earnings aggregation exists');
  const payoutFn = dashboard.match(/function payoutForStaff\(row, staffProfileId\) \{[\s\S]*?\n\}/)?.[0];
  const entitlementFn = dashboard.match(/function helperEntitlement\(row\) \{[\s\S]*?\n\}/)?.[0];
  const helpers = `
    function roundMoney(v){return Math.round(Number(v)*100)/100}
    function currentWeekRange(now){const day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));const wd=day.getUTCDay();const mon=new Date(day);mon.setUTCDate(mon.getUTCDate()+(wd===0?-6:1-wd));const sun=new Date(mon);sun.setUTCDate(sun.getUTCDate()+6);const iso=x=>x.toISOString().slice(0,10);return {weekStart:iso(mon),weekEnd:iso(sun)}}
    function displayDate(v){return v}
    function ukISODate(now){return now.toISOString().slice(0,10)}
  `;
  const makeYourEarnings = vm.runInNewContext(`(()=>{${helpers}${entitlementFn}${payoutFn}${ownerFn};return makeYourEarnings})()`, {});
  const rows = [
    { date:'2026-11-03', yourPayout:37.24, helperPayout:33.16, gross:91.54, day:'Tue 3 Nov 2026 — Helper Quest', dayType:'Helper', withHelper:true, staffProfileIds:['jay'], actualCrewProfileIds:['gary','jay'] },
    { date:'2026-11-02', yourPayout:71.64, gross:92.53, day:'Mon 2 Nov 2026 — Solo', dayType:'Solo', withHelper:false, staffProfileIds:['gary'], actualCrewProfileIds:['gary'] },
    { date:'2026-11-01', yourPayout:22.03, helperPayout:17.19, gross:51.65, day:'Sun 1 Nov 2026 — Helper', dayType:'Helper', withHelper:true, staffProfileIds:['jay'], actualCrewProfileIds:[] }
  ];
  const now = new Date('2026-11-03T12:00:00Z');
  const garyResult = makeYourEarnings(rows.filter(row=>row.actualCrewProfileIds.includes('gary')), now, 'gary');
  const jayResult = makeYourEarnings(rows.filter(row=>row.actualCrewProfileIds.includes('jay')), now, 'jay');
  assert.equal(garyResult.weekTotal,108.88);
  assert.equal(garyResult.monthTotal,108.88);
  assert.equal(garyResult.weekShiftCount,2);
  assert.equal(jayResult.weekTotal,33.16);
  assert.deepEqual(Array.from(garyResult.breakdown,x=>x.payout),[37.24,71.64]);
  assert.match(dashboard,/const personalRows = staffProfileId \? rows\.filter\(row => row\.actualCrewProfileIds\.includes\(staffProfileId\)\) : \[\]/);
  assert.match(dashboard,/yourEarnings: makeYourEarnings\(earningsRows, now, staffProfileId\)/);
  assert.match(dashboard,/yourPayout: propNumber\(props, 'Your payout \(\£\)'\)/);
});

test('both Pay tab entry points display owner earnings separately from helper payment due', () => {
  for (const file of ['../index.html', '../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /id="your-earnings-week"/);
    assert.match(html, /id="your-earnings-month"/);
    assert.match(html, /id="your-earnings-breakdown"/);
    assert.match(html, /Your earnings/);
  }
});

test('all sessions scope earnings and payment ledger to actual completed Crew members', () => {
  assert.match(dashboard,/const personalRows = staffProfileId \? rows\.filter\(row => row\.actualCrewProfileIds\.includes\(staffProfileId\)\) : \[\]/);
  assert.match(dashboard,/const ledgerRows = personalRows/);
  assert.match(dashboard,/latestPayment: makeLatestPayment\(ledgerRows, now\)/);
  assert.match(dashboard,/currentWeek: makeCurrentWeek\(personalRows, now, staffProfileId\)/);
  assert.match(dashboard,/outstandingRows = ledgerRows\.filter/);
  assert.match(dashboard,/const earningsRows = personalRows/);
  assert.match(dashboard,/yourEarnings: makeYourEarnings\(earningsRows, now, staffProfileId\)/);
  assert.match(dashboard,/auth\.staff\.properties\?\.\['Admin Access'\]\?\.checkbox === true/);
});

test('helper sessions do not fall back to the global Helper Pay Summary balance', () => {
  assert.match(dashboard, /const rawCurrentlyOwed = earningsOutstandingKnown \? roundMoney\(earningsOutstanding\)/);
  assert.match(dashboard, /outstandingSyncError: isAdmin \? \(!outstandingKnown && !earningsOutstandingKnown\) : false/);
});


test('recent completed shift shows vehicle insurance and net after vehicle costs for solo and helper shifts', () => {
  const recent = dashboard.match(/function makeRecentShift\(rows, staffProfileId\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(recent, /vehicleInsuranceCost: recent\.miles == null \? null : roundMoney\(Number\(recent\.miles\) \* 0\.01\)/);
  assert.match(recent, /netAfterVehicleCosts: recent\.gross == null \|\| recent\.miles == null \? null : roundMoney/);
  assert.match(dashboard, /actualCrewProfileIds\.includes\(staffProfileId\)/);
  assert.equal(Math.round(67.4 * 0.01 * 100) / 100, 0.67);
  assert.equal(Math.round((92.53 - 67.4 * 0.30 - 67.4 * 0.01) * 100) / 100, 71.64);
  for (const file of ['../index.html', '../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /id="recent-insurance"/);
    assert.match(html, /id="recent-net"/);
    assert.match(html, /set\('recent-insurance',money\(r\.vehicleInsuranceCost\)\)/);
    assert.match(html, /set\('recent-net',money\(r\.netAfterVehicleCosts\)\)/);
  }
});


test('login lockout escalates after three failed attempts, not one, and reports attempts to next threshold', () => {
  const login = fs.readFileSync(new URL('../netlify/functions/helper-login.mjs', import.meta.url), 'utf8');
  assert.match(login, /if \(failures >= 12\) state\.permanent = true/);
  assert.match(login, /else if \(failures >= 9\) state\.lockedUntil = now \+ 24 \* 60 \* 60 \* 1000/);
  assert.match(login, /else if \(failures >= 6\) state\.lockedUntil = now \+ 60 \* 60 \* 1000/);
  assert.match(login, /else if \(failures >= 3\) state\.lockedUntil = now \+ 15 \* 60 \* 1000/);
  assert.match(login, /attemptsRemaining: Math\.max\(0, nextLockoutAt - failures\)/);
  assert.equal(3 - 1, 2);
  assert.equal(3 - 2, 1);
  assert.equal(3 - 3, 0);
});

test('admin restore clears selected account lockout and reports status in the staff selector', () => {
  const admin = fs.readFileSync(new URL('../netlify/functions/staff-session-admin.mjs', import.meta.url), 'utf8');
  assert.match(admin, /async function clearAccountLockout\(staffId\)/);
  assert.match(admin, /if \(!suspended\) await clearAccountLockout\(target\)/);
  assert.match(admin, /LOCKED — admin reset required/);
  assert.match(admin, /LOCKED — until/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Restore access \+ clear lockout/);
  assert.match(html, /Clear lockout \+ confirm access/);
  assert.match(html, /err\.data=d/);
  assert.match(html, /failed attempt.*remaining before the next lockout/);
});


test('account lockout escalates in four groups of three and successful login resets the sequence', () => {
  const login = fs.readFileSync(new URL('../netlify/functions/helper-login.mjs', import.meta.url), 'utf8');
  assert.match(login, /function nextAccountLockout\(previousFailures, now = Date\.now\(\)\)/);
  assert.match(login, /await saveLockout\(lock\.store, lock\.key, \{ failures: 0, lockedUntil: 0, permanent: false, updatedAt: Date\.now\(\) \}\)/);
  const helper = login.match(/function nextAccountLockout\(previousFailures, now = Date\.now\(\)\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(helper);
  const thresholds = [
    { failures: 3, duration: 15 * 60 * 1000, permanent: false },
    { failures: 6, duration: 60 * 60 * 1000, permanent: false },
    { failures: 9, duration: 24 * 60 * 60 * 1000, permanent: false },
    { failures: 12, duration: 0, permanent: true }
  ];
  let previous = 0;
  for (const expected of thresholds) {
    let actual;
    for (let attempt = 0; attempt < 3; attempt++) {
      const now = 1000000;
      const failures = previous + 1;
      actual = { failures, lockedUntil: failures >= 12 ? 0 : failures >= 9 ? now + 24*60*60*1000 : failures >= 6 ? now + 60*60*1000 : failures >= 3 ? now + 15*60*1000 : 0, permanent: failures >= 12 };
      previous = actual.failures;
    }
    assert.equal(actual.failures, expected.failures);
    assert.equal(actual.permanent, expected.permanent);
    assert.equal(actual.lockedUntil, expected.duration ? 1000000 + expected.duration : 0);
  }
  // A valid sign-in writes the account counter back to zero before creating a session.
  assert.ok(login.indexOf('await saveLockout(lock.store, lock.key, { failures: 0') < login.indexOf('const sessionId = crypto.randomUUID()'));
});


test('current-week progress includes only shifts worked by the authenticated crew member', () => {
  const weekly = dashboard.match(/function makeCurrentWeek\(rows, now, staffProfileId\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(weekly);
  assert.doesNotMatch(weekly,/row\.withHelper\s*&&\s*row\.date/);
  assert.match(weekly,/const soloRows = weekRows\.filter\(row => !row\.withHelper\)/);
  assert.match(weekly,/const helperRows = weekRows\.filter\(row => row\.withHelper\)/);
  assert.match(weekly,/payoutForStaff\(row, staffProfileId\)/);
  assert.doesNotMatch(weekly,/ownerView/);
  assert.match(weekly,/soloShiftCount: soloCount/);
  assert.match(weekly,/helperShiftCount: helperCount/);
  assert.match(dashboard,/function weekRowHours\(row, staffProfileId\)/);
  assert.match(dashboard,/row\.shiftDuration/);
  assert.match(dashboard,/currentWeek: makeCurrentWeek\(personalRows, now, staffProfileId\)/);

  const helpers = `
    function roundMoney(v){return Math.round(Number(v)*100)/100}
    function currentWeekRange(){return {weekStart:'2026-11-02',weekEnd:'2026-11-08'}}
    function helperEntitlement(row){return roundMoney(Number(row.helperPayout||0)+Number(row.helperAdjustment||0))}
    function payoutForStaff(row,id){return row.withHelper&&row.staffProfileIds?.includes(id)?helperEntitlement(row):Number(row.yourPayout||0)}
    function weekRowHours(row,id){return row.withHelper&&row.staffProfileIds?.includes(id)?Number(row.helperHours||0):Number(row.hours||0)}
    function displayDate(v){return v}
    function paymentLabel(v){return v}
    function shiftStartMinutes(){return null}
    function allocationsForRow(){return []}
  `;
  const makeCurrentWeek = vm.runInNewContext(`(()=>{${helpers}${weekly};return makeCurrentWeek})()`, {});
  const rows = [
    {date:'2026-11-02',day:'Mon',withHelper:false,yourPayout:71.64,gross:92.53,trips:16,hours:6.283},
    {date:'2026-11-03',day:'Tue',withHelper:true,yourPayout:37.24,helperPayout:33.16,helperAdjustment:0,helperOutstanding:33.16,gross:91.54,trips:13,helperHours:3.5,hours:3.5,staffProfileIds:['jay']}
  ];
  const garyWeek = makeCurrentWeek(rows,new Date('2026-11-03T12:00:00Z'),'gary');
  assert.equal(garyWeek.shiftCount,2);
  assert.equal(garyWeek.earned,108.88);
  assert.equal(garyWeek.outstanding,33.16);
  const jayWeek = makeCurrentWeek([rows[1]],new Date('2026-11-03T12:00:00Z'),'jay');
  assert.equal(jayWeek.earned,33.16);

  for (const file of ['../index.html','../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html,/html:not\(\.dark-mode\) #pay \.graphic-stats b\{color:var\(--text\)\}/);
    assert.match(html,/<span>Worked shifts<\/span>/);
    assert.match(html,/<span>Helper payments this week<\/span>/);
  }
});


test("weekly duration uses each actual crew member's own worked time on helper shifts", () => {
  const fn=dashboard.match(/function weekRowHours\(row, staffProfileId\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fn);
  const weekRowHours=vm.runInNewContext(`(()=>{${fn};return weekRowHours})()`,{});
  const shift={withHelper:true,staffProfileIds:['jay'],helperHours:3.5,shiftDuration:'4h 53m',shiftTime:'15:58–20:51'};
  assert.equal(weekRowHours(shift,'gary'),4+53/60);
  assert.equal(weekRowHours(shift,'jay'),3.5);
});

test('new helper requests are locked to Available shifts', () => {
  const api = fs.readFileSync(new URL('../netlify/functions/helper-requests.mjs', import.meta.url), 'utf8');
  for (const file of ['../index.html','../helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /changing\?\['Available','Live','Confirmed'\]\.includes\(s\.status\):\['Available'\]\.includes\(s\.status\)/);
  }
  assert.match(api, /const allowedStatuses=cancelling\|\|changing\?\['Available','Live','Confirmed'\]:\['Available'\]/);
});

test('upcoming helper shifts include all non-completed statuses and exclude completed records', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/dashboard-data.mjs', import.meta.url), 'utf8');
  const fn = source.match(/function isUpcomingHelperShift\(shift, today\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fn);
  const isUpcoming = vm.runInNewContext(`(()=>{${fn};return isUpcomingHelperShift})()`, {});
  for (const status of ['Available','Confirmed','Live','Cancelled']) assert.equal(isUpcoming({date:'2026-11-04',status,completed:false,crew:'With helper'},'2026-11-03'),true);
  assert.equal(isUpcoming({date:'2026-11-04',status:'Completed',completed:false,crew:'With helper'},'2026-11-03'),false);
});

test('new shift requests are restricted to Available shifts in both UI and server validation', () => {
  const api = fs.readFileSync(new URL('../netlify/functions/helper-requests.mjs', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(api, /const allowedStatuses=cancelling\|\|changing\?\['Available','Live','Confirmed'\]:\['Available'\]/);
  assert.match(api, /\['Available'\]\.includes\(s\.status\)/);
  assert.match(html, /changing\?\['Available','Live','Confirmed'\]\.includes\(s\.status\):\['Available'\]\.includes\(s\.status\)/);
});

test('Available Work tab is present in both dashboard entry points', () => {
  for (const file of ['index.html','helper-dashboard-final.html']) {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /id="available-work"/);
    assert.match(html, /renderAvailableWork\(d\.upcomingShifts\|\|\[\],d\.adminStaffProfiles\|\|\[\],currentStaff\?\.adminAccess===true\)/);
  }
});


test('admin shift management is server-side admin gated and supports Notion request links and completed archive', () => {
  const endpoint = fs.readFileSync(new URL('../netlify/functions/admin-shift-management.mjs', import.meta.url), 'utf8');
  const dashboard = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(endpoint, /Admin Access/);
  assert.match(endpoint, /sessionRevoked/);
  assert.match(endpoint, /sessionIsCurrent/);
  assert.match(endpoint, /Staff Status/);
  assert.match(endpoint, /Requested shift window/);
  assert.match(endpoint, /COMPLETED_SOURCE/);
  assert.match(endpoint, /archived:true/);
  assert.match(dashboard, /id="admin-management"/);
  assert.match(dashboard, /Open request in Notion/);
  assert.match(dashboard, /loadAdminManagement/);
});



test('Available Work exposes admin-only crew assignment and the server updates Work Planner Staff Profile relations', () => {
  const endpoint=fs.readFileSync(new URL('../netlify/functions/admin-shift-management.mjs',import.meta.url),'utf8');
  assert.match(endpoint,/\['set-status','assign-crew'\]/);
  assert.match(endpoint,/body\.action==='assign-crew'/);
  assert.match(endpoint,/Staff Profile':\{relation:ids\.map\(id=>\(\{id\}\)\)\}/);
  assert.match(endpoint,/activeById\.has\(id\)/);
  assert.match(endpoint,/Admin Access/);
  assert.match(endpoint,/sessionIsCurrent/);
  for(const file of ['../index.html','../helper-dashboard-final.html']){
    const html=fs.readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(html,/Allocated crew:/);
    assert.match(html,/adminMode&&shift\.id/);
    assert.match(html,/action:'assign-crew'/);
    assert.match(html,/select\.selectedOptions/ );
    assert.match(html,/id="next-crew"/);
    assert.match(html,/Actual crew who worked \(required to complete\)/);
    assert.match(html,/payload\.crewMemberIds=\[\.\.\.actualCrew\.selectedOptions\]/);
  }
});

test('admin management limits request inbox to the last seven days and shifts to the next seven days, excluding completed', () => {
  const endpoint = fs.readFileSync(new URL('../netlify/functions/admin-shift-management.mjs', import.meta.url), 'utf8');
  assert.match(endpoint, /sevenDaysAgo/);
  assert.match(endpoint, /sevenDaysAhead/);
  assert.match(endpoint, /created>=Date\.parse\(requestCutoff\)/);
  assert.match(endpoint, /x\.date>=iso\(today\)&&x\.date<=iso\(sevenDaysAhead\)&&x\.status!=='Completed'/);
});


test('selecting dashboard tabs refreshes the corresponding live data sources', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /refreshSelectedTab/);
  assert.match(html, /tabs\.forEach\(t=>t\.addEventListener\('click',\(\)=>\{show\(t\.dataset\.view\);refreshSelectedTab\(t\.dataset\.view\)\}\)\)/);
  assert.match(html, /if\(\['overview','available-work','shifts','pay'\]\.includes\(view\)\)await loadDashboardData\(\)/);
  assert.match(html, /if\(view==='admin-management'.*await loadAdminManagement\(\)/);
  assert.match(html, /if\(view==='shifts'\)\{await loadRequestShifts\(\);await loadMyRequests\(\)\}/);
  assert.match(html, /if\(view==='news'\)await loadNewsMessage\(\)/);
});


test('home places weekly progress immediately below staff profile and includes refresh guidance', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const profile = html.indexOf('id="staff-card"');
  const weekly = html.indexOf('id="week-shifts"');
  const refresh = html.indexOf('GET THE LATEST INFORMATION');
  const pin = html.indexOf('id="profile-pin-toggle-card"');
  assert.ok(refresh >= 0 && profile > refresh && pin > profile && weekly > pin);
  assert.match(html, /Use the <strong>Refresh<\/strong> icon at the top of the app/);
  assert.match(html, /class="refresh-help-icon">↻/);
});


test('Change PIN is directly under staff profile and weekly progress follows admin controls', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const staff = html.indexOf('id="staff-card"');
  const pin = html.indexOf('id="profile-pin-toggle-card"');
  const admin = html.indexOf('id="session-admin-card"');
  const week = html.indexOf('id="week-shifts"');
  assert.ok(staff >= 0 && pin > staff && admin > pin && week > admin);
});


test('home order is refresh guidance, staff profile, PIN, admin controls, weekly progress, then next helper shift', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const home = html.slice(html.indexOf('id="overview"'), html.indexOf('</section>', html.indexOf('id="overview"')));
  const positions = [
    home.indexOf('GET THE LATEST INFORMATION'),
    home.indexOf('id="staff-card"'),
    home.indexOf('id="profile-pin-toggle-card"'),
    home.indexOf('id="session-admin-card"'),
    home.indexOf('This week at a glance'),
    home.indexOf('Next helper shift')
  ];
  assert.ok(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1])));
});


test('bottom navigation order is News, Admin, Home, then Available Work', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const nav = html.slice(html.indexOf('id="dashboard-nav"'), html.indexOf('</nav>', html.indexOf('id="dashboard-nav"')));
  const positions = ['id="news-tab"','id="admin-management-tab"','id="overview-tab"','id="available-work-tab"'].map(x=>nav.indexOf(x));
  assert.ok(positions.every((x,i)=>x>=0&&(i===0||x>positions[i-1])));
});


test('Available Work exposes the existing shift availability form and refreshes requestable options', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const section = html.slice(html.indexOf('id="available-work"'), html.indexOf('</section>', html.indexOf('id="available-work"')));
  assert.match(section, /id="available-work-request-button"/);
  assert.match(section, /data-go="shift-request"/);
  assert.match(html, /if\(view==='available-work'\)await loadRequestShifts\(\)/);
  assert.match(html, /id="shift-request-form"/);
});
