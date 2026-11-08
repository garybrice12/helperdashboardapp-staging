import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../netlify/functions/helper-requests.mjs',import.meta.url),'utf8');
const rangeStart=source.indexOf('function ukDateISO('); const rangeEnd=source.indexOf('async function notion(',rangeStart); const rangeSource=source.slice(rangeStart,rangeEnd).trim();
assert.ok(rangeSource,'UK-local date range functions exist');
const requestDateRange=vm.runInNewContext(`(()=>{${rangeSource};return requestDateRange})()`,{});
test('staff request history window is three days back through seven days ahead in UK local dates',()=>{
 const r=requestDateRange(new Date('2026-11-03T12:00:00Z'));
 assert.deepEqual({...r},{from:'2026-10-31',to:'2026-11-10'});
});
test('staff request endpoint filters by selected shift dates and caps the result at ten',()=>{
 assert.match(source,/visibleShifts=selectedShifts\.filter\(s=>\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(s\.date\)&&s\.date>=requestFrom&&s\.date<=requestTo\)/);
 assert.match(source,/\.filter\(Boolean\)\.slice\(0,10\)/);
 assert.match(source,/limit:10/);
 assert.match(source,/Europe\/London/);
});
