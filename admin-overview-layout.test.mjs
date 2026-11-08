import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const entryPoints=['../index.html','../helper-dashboard-final.html'];
test('admin overview is one unified panel with comparable solo/helper metrics and larger daily expanders',()=>{
 for(const file of entryPoints){const html=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  assert.match(html,/id="admin-overview-summary"[^>]*hidden/);
  assert.match(html,/admin-overview-unified/);
  assert.match(html,/id="admin-business-gross"/);assert.match(html,/id="admin-business-retained"/);
  assert.match(html,/id="admin-week-comparison"/);assert.match(html,/renderAdminShiftComparison\(shifts,money,hoursText\)/);
  assert.match(html,/id="admin-week-days"/);assert.match(html,/function renderAdminWeekDays\(shifts,money,hoursText,weekStartISO\)/);
  assert.match(html,/admin-bar-row/);assert.match(html,/admin-day-ledger/);
  assert.match(html,/Solo shifts/);assert.match(html,/Helper shifts/);
  assert.match(html,/min-height:68px/);assert.match(html,/font-size:13px;font-weight:900;font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(html,/MY ACTIVITY|HELPER ACTIVITY/);
  assert.match(html,/adminOverview\.hidden=!isAdminOverview/);
  assert.match(html,/standardWeekSummary\.hidden=isAdminOverview/);
  assert.match(html,/not currently connect to those expense records/);
 }
});
test('overview uses live dashboard payload and preserves existing API calculation functions',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/fetch\('\/api\/dashboard-data'/);assert.match(html,/const owner=d\.yourEarnings\|\|\{\}/);assert.match(html,/w=d\.currentWeek\|\|\{\}/);
 const api=fs.readFileSync(new URL('../netlify/functions/dashboard-data.mjs',import.meta.url),'utf8');
 assert.match(api,/function makeCurrentWeek\(rows, now, staffProfileId\)/);assert.match(api,/fuelCost: row\.miles == null/);assert.match(api,/vehicleInsuranceCost: row\.miles == null/);assert.match(api,/helperPaid: paidAmount/);
});
test('admin and alternate dashboard entry points remain byte-identical',()=>{
 const a=fs.readFileSync(new URL('../index.html',import.meta.url));const b=fs.readFileSync(new URL('../helper-dashboard-final.html',import.meta.url));assert.deepEqual(b,a);
});
