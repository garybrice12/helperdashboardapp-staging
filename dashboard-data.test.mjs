import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardData } from '../netlify/functions/dashboard-data.mjs';

const n = value => ({ type: 'number', number: value });
const d = value => ({ type: 'date', date: value ? { start: value } : null });
const title = value => ({ type: 'title', title: [{ plain_text: value }] });
const text = value => ({ type: 'rich_text', rich_text: [{ plain_text: value }] });
const checkbox = value => ({ type: 'checkbox', checkbox: value });
function earnings({ id, day, date, gross, trips, hours, time, paid = null, paidDate = null, payout, outstanding = null, boost = null }) {
  return {
    id,
    properties: {
      'Day': title(day), 'Date': d(date), 'Date paid': d(paidDate),
      'Gross (£)': n(gross), 'Miles': n(0), 'Trips/deliveries': n(trips),
      'With helper': checkbox(true), 'Helper paid (£)': n(paid),
      'Helper outstanding (£)': n(outstanding), 'Helper boost (£)': n(boost),
      'Helper payout (£)': n(payout), 'Helper adjustment (£)': n(0),
      'Helper hours': n(hours), 'Notes': text(''), 'Shift time': text(time),
      'Shift duration': text('')
    }
  };
}

test('weekly totals include the four real helper records for 19–25 Oct 2026', () => {
  const pages = [
    earnings({ id:'205', day:'Mon 19 Oct 2026 — Helper evening', date:'2026-10-19', gross:74.41, trips:9, hours:4.57, time:'16:37–21:11', paid:22.92, paidDate:'2026-10-21', payout:22.92, outstanding:0 }),
    earnings({ id:'206', day:'Tue 20 Oct 2026 — Helper evening', date:'2026-10-20', gross:78.16, trips:12, hours:5, time:'16:00–21:00', paid:30.82, paidDate:'2026-10-21', payout:30.82, outstanding:0 }),
    earnings({ id:'207', day:'Wed 21 Oct 2026 — Helper evening', date:'2026-10-21', gross:57.66, trips:10, hours:3.4, time:'16:04–19:28', paid:20.96, paidDate:'2026-10-21', payout:20.96, outstanding:0 }),
    earnings({ id:'208', day:'Thu 22 Oct 2026 — Helper Quest evening', date:'2026-10-22', gross:68.60, trips:13, hours:2.78, time:'17:09–19:56', payout:29.43, outstanding:29.43 })
  ];
  const result = buildDashboardData({ earningsPages: pages, now: new Date('2026-10-23T12:00:00Z') });
  assert.equal(result.currentWeek.weekStart, '2026-10-19');
  assert.equal(result.currentWeek.shiftCount, 4);
  assert.equal(result.currentWeek.earned, 104.13);
  assert.equal(result.currentWeek.paid, 74.70);
  assert.equal(result.currentWeek.outstanding, 29.43);
  assert.equal(result.weeklyRows.length, 4);
  assert.equal(result.recentShift.date, '2026-10-22');
  assert.equal(result.recentShift.start, '17:09');
  assert.equal(result.recentShift.end, '19:56');
  assert.equal(result.recentShift.gross, 68.6);
  assert.equal(result.recentShift.trips, 13);
  assert.equal(result.recentShift.tripBoost, null);
});

test('same-day completed shifts choose the later start time', () => {
  const pages = [
    earnings({ id:'early', day:'Thu 22 Oct 2026 — Helper early', date:'2026-10-22', gross:20, trips:3, hours:1, time:'10:00–11:00', payout:8, boost:0.5 }),
    earnings({ id:'late', day:'Thu 22 Oct 2026 — Helper evening', date:'2026-10-22', gross:68.6, trips:13, hours:2.78, time:'17:09–19:56', payout:29.43 })
  ];
  const result = buildDashboardData({ earningsPages: pages, now: new Date('2026-10-23T12:00:00Z') });
  assert.equal(result.recentShift.gross, 68.6);
  assert.equal(result.recentShift.tripBoost, null);
});


test('missing trip boost remains unknown rather than being fabricated', () => {
  const pages = [earnings({ id:'no-boost', day:'Thu 22 Oct 2026 — Helper evening', date:'2026-10-22', gross:68.6, trips:13, hours:2.78, time:'17:09–19:56', payout:29.43 })];
  const result = buildDashboardData({ earningsPages: pages, now: new Date('2026-10-23T12:00:00Z') });
  assert.equal(result.recentShift.tripBoost, null);
  assert.equal(result.weeklyRows[0].helperBoost, null);
});

test('trip boost reads supported alternate Notion property labels without fabricating a value', () => {
  const page = earnings({ id: 'alias-boost', day: 'Thu 22 Oct 2026 — Helper evening', date: '2026-10-22', gross: 68.6, trips: 13, hours: 2.78, time: '17:09–19:56', payout: 29.43 });
  delete page.properties['Helper boost (£)'];
  page.properties['Trip Boost (£)'] = n(5);
  const result = buildDashboardData({ earningsPages: [page], now: new Date('2026-10-23T12:00:00Z') });
  assert.equal(result.recentShift.tripBoost, 5);
  assert.equal(result.weeklyRows[0].helperBoost, 5);
});

test('weekly hours derive from shift time when the numeric hours property is blank', () => {
  const pages = [
    earnings({ id: 'missing-hours', day: 'Thu 22 Oct 2026 — Helper evening', date: '2026-10-22', gross: 68.6, trips: 13, hours: null, time: '17:09–19:56', payout: 29.43, outstanding: 29.43 })
  ];
  const result = buildDashboardData({ earningsPages: pages, now: new Date('2026-10-23T12:00:00Z') });
  assert.equal(result.currentWeek.shiftCount, 1);
  assert.equal(result.currentWeek.hours, 2.78);
});

test('zero boost remains a real recorded zero and is not confused with missing data', () => {
  const pages = [earnings({ id: 'zero-boost', day: 'Thu 22 Oct 2026 — Helper evening', date: '2026-10-22', gross: 68.6, trips: 13, hours: 2.78, time: '17:09–19:56', payout: 29.43, boost: 0 })];
  const result = buildDashboardData({ earningsPages: pages, now: new Date('2026-10-23T12:00:00Z') });
  assert.equal(result.recentShift.tripBoost, 0);
});
