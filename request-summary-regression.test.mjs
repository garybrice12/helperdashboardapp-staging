import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../netlify/functions/helper-requests.mjs',import.meta.url),'utf8');
test('helper request API builds an in-app summary from the submitted Notion fields when Request summary is empty',()=>{
 assert.match(source,/function buildRequestSummary\(properties, shifts\)/);
 for(const field of ['Submission type','Availability','Submitted pick-up','Submitted pick-up time','Submitted drink','Submitted other pick-up details','Other Pick-up Location','Other Pick-up/Meet-up time','Other Drink/Food Request','Preferred start time \(within shift window\)','Preferred finish time \(within shift window\)','Other Requests or relevant Information']) assert.ok(source.includes(`text(p,'${field}')`),`summary includes ${field}`);
 assert.match(source,/summary:text\(x\.properties,'Request summary'\)\|\|buildRequestSummary\(x\.properties,visibleShifts\)/);
});

const adminSource=fs.readFileSync(new URL('../netlify/functions/admin-shift-management.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('admin request API returns a complete in-app request summary with pickup and preference fields',()=>{
 assert.match(adminSource,/function requestSummary\(p,shifts\)/);
 for(const field of ['Submitted pick-up','Submitted pick-up time','Submitted other pick-up details','Submitted drink','Other Drink/Food Request','Preferred start time (within shift window)','Preferred finish time (within shift window)','Other Requests or relevant Information']) assert.ok(adminSource.includes(`val(p,'${field}')`),`admin summary includes ${field}`);
 assert.match(adminSource,/summary:requestSummary\(x\.properties,selected\)/);
});
test('completed requests are grouped behind a collapsed three-day toggle for staff and admin',()=>{
 assert.match(html,/id="my-completed-requests"/);
 assert.match(html,/id="admin-completed-requests"/);
 assert.match(html,/Completed requests — last 3 days/);
 assert.match(html,/const threeDaysAgo=new Date\(today\)/);
 assert.match(html,/String\(x\.shiftStatus\|\|''\)\.toLowerCase\(\)==='completed'/);
 assert.match(html,/String\(x\.status\|\|''\)\.toLowerCase\(\)==='completed'/);
 assert.match(html,/activeRequests=d\.requests\.filter\(x=>!isAllCompleted\(x\)\)/);
 assert.match(html,/active=\(d\.requests\|\|\[\]\)\.filter\(x=>!isAllCompleted\(x\)\)/);
});
test('admin access controls are grouped by individual versus all-staff scope with explanations',()=>{
 for(const phrase of ['Individual account actions','Only affects the selected staff member.','Advanced — affects all staff','These actions affect every staff account.']) assert.ok(html.includes(phrase),`admin controls include ${phrase}`);
 assert.match(html,/Restore access \+ clear account lockout/);
});
