import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../netlify/functions/admin-shift-management.mjs',import.meta.url),'utf8');
const match=source.match(/function dedupeShiftCards\(rows\)\s*\{[\s\S]*?\n\}/);
assert.ok(match,'admin shift deduplication function exists');
const dedupe=vm.runInNewContext(`(()=>{const plain=a=>(a||[]).map(x=>x.plain_text||x.text?.content||'').join('').trim();function val(p,n){const x=p?.[n];if(!x)return '';if(x.type==='title')return plain(x.title);if(x.type==='rich_text')return plain(x.rich_text);if(x.type==='select'||x.type==='status')return x.select?.name||x.status?.name||'';if(x.type==='date')return x.date?.start||''}${match[0]};return dedupeShiftCards})()`,{});
const page=(id,{title='Helper Shift',date='2026-11-03',window='15:00–21:00',location='Exmouth / Exeter',status='Live',edited='2026-11-03T15:00:00Z'}={})=>({id,last_edited_time:edited,properties:{Shift:{type:'title',title:[{plain_text:title}]},Date:{type:'date',date:{start:date}},Window:{type:'rich_text',rich_text:[{plain_text:window}]},Location:{type:'rich_text',rich_text:[{plain_text:location}]},Status:{type:'select',select:{name:status}}}});
test('identical Work Planner shift records render once and retain the latest edited record',()=>{
 const rows=[page('older',{status:'Confirmed',edited:'2026-11-03T14:00:00Z'}),page('newer',{status:'Live',edited:'2026-11-03T15:00:00Z'})];
 const result=dedupe(rows);assert.equal(result.length,1);assert.equal(result[0].id,'newer');assert.equal(result[0].status,'Live');
});
test('different dates, windows or locations remain separate shifts',()=>{
 const result=dedupe([page('a'),page('b',{date:'2026-11-04'}),page('c',{window:'16:00–21:00'}),page('d',{location:'Exeter'})]);assert.equal(result.length,4);
});
test('identical records with different capitalization and whitespace are deduplicated',()=>{
 const result=dedupe([page('a'),page('b',{title:' helper   shift ',location:'exmouth / exeter'})]);assert.equal(result.length,1);
});
test('incomplete records are preserved independently rather than incorrectly merged',()=>{
 const result=dedupe([page('a',{title:'',window:'',location:''}),page('b',{title:'',window:'',location:''})]);assert.equal(result.length,2);
});
