import assert from 'node:assert/strict';
import test from 'node:test';
import dashboardData, {
  __test,
  buildDashboardData,
  loadLiveDashboard
} from './dashboard-data.mjs';

const NOW = new Date('2026-10-15T15:00:00Z');
const { propNumber, readOutstandingValue } = __test;

function page(properties) {
  return { properties };
}
function title(name, text) {
  return { [name]: { type: 'title', title: [{ plain_text: text }] } };
}
function numberProp(name, value) {
  return { [name]: { type: 'number', number: value } };
}
function dateProp(name, value) {
  return { [name]: { type: 'date', date: value ? { start: value } : null } };
}
function check(name, value) {
  return { [name]: { type: 'checkbox', checkbox: value } };
}
function rich(name, text) {
  return { [name]: { type: 'rich_text', rich_text: [{ plain_text: text }] } };
}
function select(name, value) {
  return { [name]: { type: 'select', select: value ? { name: value } : null } };
}
function rollupNumber(name, value) {
  return { [name]: { type: 'rollup', rollup: { type: 'number', number: value, function: 'sum' } } };
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function earningsRow(fields) {
  return page({
    ...title('Day', fields.day),
    ...dateProp('Date', fields.date),
    ...dateProp('Date paid', fields.paidDate || null),
    ...numberProp('Gross (£)', fields.gross ?? null),
    ...numberProp('Trips/deliveries', fields.trips ?? null),
    ...check('With helper', fields.withHelper !== false),
    ...numberProp('Helper paid (£)', fields.helperPaid ?? null),
    ...numberProp('Helper outstanding (£)', fields.helperOutstanding ?? null),
    ...numberProp('Helper boost (£)', fields.helperBoost ?? null),
    ...numberProp('Helper payout (£)', fields.helperPayout ?? null),
    ...numberProp('Payment ref', fields.paymentRef ?? null),
    ...numberProp('Helper hours', fields.helperHours ?? null),
    ...rich('Notes', fields.notes || ''),
    ...rich('Shift time', fields.shiftTime || ''),
    ...rich('Shift duration', fields.shiftDuration || '')
  });
}

function shiftRow(fields) {
  return page({
    ...title('Shift', fields.title || 'Helper shift'),
    ...dateProp('Date', fields.date),
    ...rich('Location', fields.location || ''),
    ...rich('Window', fields.window || ''),
    ...select('Status', fields.status),
    ...select('Crew', fields.crew || 'With helper'),
    ...numberProp('Target Gross', fields.targetGross ?? null),
    ...numberProp('Trip Target', fields.targetTrips ?? null),
    ...numberProp('Helper Pay', fields.helperPay ?? null),
    ...check('Quest', Boolean(fields.quest)),
    ...check('Completed', Boolean(fields.completed))
  });
}

const septemberPayment = [
  earningsRow({
    day: 'Saturday 12 September — helper', date: '2026-09-12', paidDate: '2026-09-13',
    gross: 40, trips: 8, helperPaid: 18.09, helperPayout: 18.09, paymentRef: 40,
    helperHours: 2.5, shiftTime: '6:04–8:36pm', notes: 'Exmouth'
  }),
  earningsRow({
    day: 'Sunday 13 September — helper', date: '2026-09-13', paidDate: '2026-09-13',
    gross: 55, trips: 11, helperPaid: 29.4, helperPayout: 29.4, paymentRef: 40,
    helperHours: 3.8, shiftTime: '5:02–8:50pm', notes: 'Exmouth'
  })
];

const octoberRows = [
  earningsRow({
    day: 'Monday 13 October — helper', date: '2026-10-13', paidDate: '2026-10-10',
    gross: 40, trips: 8, helperPaid: 4, helperOutstanding: 6, helperPayout: 10,
    helperBoost: 0, paymentRef: 54, helperHours: 2, shiftTime: '5:00pm–7:00pm',
    shiftDuration: '2h', notes: 'Exmouth'
  }),
  earningsRow({
    day: 'Tuesday 14 October — helper', date: '2026-10-14T18:30:00.000+01:00',
    gross: 30, trips: 5, helperPaid: 0, helperOutstanding: null, helperPayout: 12.5,
    helperBoost: 3, helperHours: 1.5, shiftTime: '5:00pm–6:30pm', shiftDuration: '1h 30m',
    notes: 'Exmouth evening'
  }),
  earningsRow({
    day: 'Wednesday 15 October — solo', date: '2026-10-15', gross: 90, trips: 20,
    withHelper: false, helperPaid: 0, helperPayout: 0, helperHours: 4, notes: 'Exmouth'
  })
];

const newerPayment = [
  earningsRow({
    day: 'Saturday 11 October', date: '2026-10-11', paidDate: '2026-10-12T18:00:00.000Z',
    gross: 50, trips: 9, helperPaid: 20.5, helperPayout: 20.5, paymentRef: 55,
    helperHours: 3, shiftTime: '6:00–8:30pm', notes: 'Exmouth'
  }),
  earningsRow({
    day: 'Sunday 12 October', date: '2026-10-12', paidDate: '2026-10-12',
    gross: 36, trips: 7, helperPaid: 10, helperPayout: 10, paymentRef: 55,
    helperHours: 2, shiftTime: '5:00–7:00pm', notes: 'Exmouth'
  })
];

function livePayload(extra = {}) {
  return buildDashboardData({
    earningsPages: [...septemberPayment, ...octoberRows, ...newerPayment],
    shiftPages: [
      shiftRow({ date: '2026-09-16', title: 'Wed 16 Sep', location: 'Exmouth', window: '17:00–21:00', status: 'Confirmed', targetGross: 60, targetTrips: 12, helperPay: 25 }),
      shiftRow({ date: '2026-10-16', title: 'Thursday helper', location: 'Exmouth', window: '17:00–21:00', status: 'Confirmed', quest: true, targetGross: 80, targetTrips: 15, helperPay: 30 }),
      shiftRow({ date: '2026-10-17', location: 'Exmouth', window: '17:00–20:00', status: 'Live', completed: true, targetGross: 40, targetTrips: 8, helperPay: 18 }),
      shiftRow({ date: '2026-10-18', location: 'Exmouth', window: '12:00–15:00', status: 'Confirmation pending', targetGross: 45, targetTrips: 9, helperPay: 16 }),
      shiftRow({ date: '2026-10-19', location: 'Exmouth', window: '5:00pm–9:00pm', status: 'Confirmed', crew: 'Solo', targetGross: 70, targetTrips: 14, helperPay: 22 })
    ],
    outstandingValue: 88.2,
    outstandingError: false,
    now: NOW,
    ...extra
  });
}

test('outstanding rollup reader distinguishes zero, missing and null components', () => {
  assert.equal(readOutstandingValue(rollupNumber('Total outstanding (£)', 0)), 0);
  assert.equal(readOutstandingValue(rollupNumber('Total outstanding (£)', 88.2)), 88.2);
  assert.equal(readOutstandingValue(rollupNumber('Total outstanding (£)', null)), null);
  assert.equal(readOutstandingValue({}), null);
  assert.equal(propNumber({
    'Total outstanding (£)': { type: 'rollup', rollup: { type: 'array', array: [
      { type: 'number', number: 10 },
      { type: 'formula', formula: { type: 'number', number: 5.5 } }
    ] } }
  }, 'Total outstanding (£)'), 15.5);
  assert.equal(propNumber({
    'Total outstanding (£)': { type: 'rollup', rollup: { type: 'array', array: [{ type: 'number', number: null }] } }
  }, 'Total outstanding (£)'), null);
  assert.equal(propNumber({
    'Total outstanding (£)': { type: 'rollup', rollup: { type: 'array', array: [] } }
  }, 'Total outstanding (£)'), null);
  assert.equal(propNumber({
    'Total outstanding (£)': { type: 'rollup', rollup: { type: 'array', array: [
      { type: 'number', number: 0 }, { type: 'number', number: 0 }
    ] } }
  }, 'Total outstanding (£)'), 0);
});

test('outstanding balance comes from the summary rollup, including a genuine zero', () => {
  const owed = livePayload();
  assert.equal(owed.currentlyOwed, 88.2);
  assert.equal(owed.outstandingSyncError, false);
  assert.notEqual(owed.currentlyOwed, 6 + Math.max(0, 12.5));
  const zero = livePayload({ outstandingValue: 0, outstandingError: false });
  assert.equal(zero.currentlyOwed, 0);
  assert.equal(zero.outstandingSyncError, false);
  const failed = livePayload({ outstandingValue: 0, outstandingError: true });
  assert.equal(failed.currentlyOwed, null);
  assert.equal(failed.outstandingSyncError, true);
  assert.notEqual(failed.currentlyOwed, 0);
  const missing = livePayload({ outstandingValue: null, outstandingError: true });
  assert.equal(missing.currentlyOwed, null);
  assert.equal(missing.latestPayment.reference, '55');
});

test('latest payment is the newest payment, with the established breakdown', () => {
  const payload = livePayload();
  assert.equal(payload.latestPayment.amount, 30.5);
  assert.equal(payload.latestPayment.reference, '55');
  assert.equal(payload.latestPayment.date, '12 October');
  assert.deepEqual(payload.latestPayment.breakdown, [
    { label: 'Saturday 11 October', detail: '6:00–8:30pm · £20.50' },
    { label: 'Sunday 12 October', detail: '5:00–7:00pm · £10.00' }
  ]);
  assert.equal(JSON.stringify(payload.latestPayment).includes('September'), false);
});

test('newest helper shift is returned with boost kept separate from helper pay', () => {
  const payload = livePayload();
  assert.equal(payload.recentShift.date, '2026-10-14');
  assert.equal(payload.recentShift.day, 'Wed 14 Oct');
  assert.equal(payload.recentShift.location, 'Exmouth');
  assert.equal(payload.recentShift.start, '5:00pm');
  assert.equal(payload.recentShift.end, '6:30pm');
  assert.equal(payload.recentShift.gross, 30);
  assert.equal(payload.recentShift.trips, 5);
  assert.equal(payload.recentShift.helperTime, '1h 30m');
  assert.equal(payload.recentShift.helperPay, 12.5);
  assert.equal(payload.recentShift.helperBoost, 3);
  assert.equal(payload.tripBoost, 3);
  assert.notEqual(payload.recentShift.helperPay, 15.5);
  assert.notEqual(payload.recentShift.date, '2026-09-15');
});

test('a recorded zero boost is not the same as a missing boost', () => {
  const zeroBoost = buildDashboardData({
    earningsPages: [earningsRow({
      day: 'Tuesday 14 October', date: '2026-10-14', gross: 10, trips: 2,
      helperPayout: 8, helperBoost: 0, helperHours: 1, shiftTime: '5:00pm–6:00pm'
    })],
    outstandingValue: 8,
    now: NOW
  });
  assert.equal(zeroBoost.recentShift.helperBoost, 0);
  assert.equal(zeroBoost.recentShift.helperPay, 8);
  const missing = buildDashboardData({
    earningsPages: [page({ ...title('Day', 'Tuesday 14 October'), ...dateProp('Date', '2026-10-14'), ...check('With helper', true) })],
    outstandingValue: null,
    outstandingError: true,
    now: NOW
  });
  assert.equal(missing.recentShift.gross, null);
  assert.equal(missing.recentShift.trips, null);
  assert.equal(missing.recentShift.helperPay, null);
  assert.equal(missing.recentShift.helperBoost, null);
  assert.equal(missing.recentShift.helperPay === 0, false);
  assert.equal(missing.recentShift.helperBoost === 0, false);
});

test('current week totals use Monday to Sunday earnings, not a hard-coded caption', () => {
  const payload = livePayload();
  assert.equal(payload.currentWeek.weekStart, '2026-10-12');
  assert.equal(payload.currentWeek.weekEnd, '2026-10-18');
  assert.equal(payload.currentWeek.shiftCount, 3);
  assert.equal(payload.currentWeek.hours, 5.5);
  assert.equal(payload.currentWeek.earned, 32.5);
  assert.equal(payload.currentWeek.paid, 30.5);
  assert.equal(payload.currentWeek.outstanding, 18.5);
  assert.match(payload.currentWeek.caption, /12 October–18 October/);
  assert.equal(payload.currentWeek.caption.includes('Tuesday is complete'), false);
});

test('next shift is the next eligible Work Planner row, never 16 September', () => {
  const payload = livePayload();
  assert.equal(payload.nextShift.date, '2026-10-16');
  assert.equal(payload.nextShift.location, 'Exmouth');
  assert.equal(payload.nextShift.start, '5:00pm');
  assert.equal(payload.nextShift.end, '9:00pm');
  assert.equal(payload.nextShift.status, 'Confirmed');
  assert.equal(payload.nextShift.targetGross, 80);
  assert.equal(payload.nextShift.targetTrips, 15);
  assert.equal(payload.nextShift.estimatedHelperPay, 30);
  assert.equal(payload.nextShift.plannedHours, 4);
  assert.equal(payload.nextShift.quest, 'Confirmed');
  assert.equal(payload.upcomingShifts.length, 1);
  assert.equal(payload.upcomingShifts[0].date, '2026-10-16');
  assert.equal(payload.upcomingShifts[0].quest, true);
  assert.equal(JSON.stringify(payload.nextShift).includes('2026-09-16'), false);
});

test('twelve-hour windows keep their meridian and still produce planned hours', () => {
  const payload = buildDashboardData({
    shiftPages: [shiftRow({
      date: '2026-10-20', location: 'Exmouth', window: '5:00pm–9:00pm', status: 'Live',
      targetGross: 0, targetTrips: 0, helperPay: 0
    })],
    outstandingValue: 0,
    now: NOW
  });
  assert.equal(payload.nextShift.start, '5:00pm');
  assert.equal(payload.nextShift.end, '9:00pm');
  assert.equal(payload.nextShift.plannedHours, 4);
  assert.equal(payload.nextShift.targetGross, 0);
});

test('no future helper shift is an explicit empty state', () => {
  const payload = buildDashboardData({
    earningsPages: octoberRows,
    shiftPages: [shiftRow({ date: '2026-09-16', status: 'Confirmed', location: 'Exmouth', window: '17:00–21:00' })],
    outstandingValue: 4,
    now: NOW
  });
  assert.equal(payload.nextShift.date, '');
  assert.equal(payload.nextShift.day, 'No upcoming helper shift');
  assert.equal(payload.nextShift.targetGross, null);
  assert.deepEqual(payload.upcomingShifts, []);
  assert.equal(payload.shiftSyncError, false);
});

test('failed lookups stay errors and never become £0 or September data', () => {
  const failed = buildDashboardData({ earningsError: true, outstandingValue: 0, now: NOW });
  assert.equal(failed.dataUnavailable, true);
  assert.equal(failed.syncError, true);
  assert.equal(failed.currentlyOwed, null);
  assert.equal(failed.latestPayment, null);
  assert.equal(failed.recentShift, null);
  assert.equal(failed.currentWeek.earned, null);
  assert.equal(failed.currentWeek.outstanding, null);
  assert.equal(failed.earningsSyncError, true);
  const serialised = JSON.stringify(failed);
  assert.equal(serialised.includes('2026-09-16'), false);
  assert.equal(serialised.includes('2026-09-15'), false);
  assert.equal(serialised.includes('47.49'), false);
  assert.equal(failed.currentlyOwed === 0, false);
  const shiftsDown = livePayload({ shiftError: true });
  assert.equal(shiftsDown.shiftSyncError, true);
  assert.equal(shiftsDown.dataUnavailable, undefined);
  assert.equal(shiftsDown.nextShift.status, 'Shift sync unavailable');
  assert.equal(shiftsDown.nextShift.targetGross, null);
  assert.deepEqual(shiftsDown.upcomingShifts, []);
  assert.equal(shiftsDown.latestPayment.reference, '55');
  assert.equal(shiftsDown.currentlyOwed, 88.2);
});

test('frontend response fields keep the types the page already reads', () => {
  const view = readLikeFrontend(livePayload());
  assert.equal(view.owed, '£88.20');
  assert.equal(view.boost, '£3');
  assert.equal(view.pay, '£12.50');
  assert.equal(view.reference, 'Reference 55 · 12 October');
  assert.equal(view.weekShifts, 3);
  assert.equal(view.weekEarned, '£32.50');
  assert.equal(view.weekPaid, '£30.50');
  assert.equal(view.weekOutstanding, '£18.50');
  assert.equal(view.weekDates.includes('12 Oct'), true);
  assert.equal(view.nextDay, 'Fri 16 Oct');
  assert.equal(view.nextGross, '£80');
  assert.equal(view.quest, 'Quest: confirmed');
  assert.equal(view.breakdown[0].label, 'Saturday 11 October');
  assert.equal(view.upcoming, 'Fri 16 Oct · Exmouth');
  assert.equal(readLikeFrontend(buildDashboardData({ earningsError: true, now: NOW })).mode, 'unavailable');
  const owedHidden = readLikeFrontend(livePayload({ outstandingError: true, outstandingValue: null }));
  assert.equal(owedHidden.owed, null);
  assert.equal(owedHidden.owedDetail.includes('withheld'), true);
});

test('live loader uses the summary rollup and does not replace a genuine zero', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push(`${options.method || 'GET'} ${target}`);
    if (target.includes('/blocks/')) return json(200, { results: [], has_more: false });
    if (target.includes('/pages/3f9f475c-d2eb-81ae-812f-e65f142fc1c1')) {
      return json(200, { properties: rollupNumber('Total outstanding (£)', 0) });
    }
    if (target.includes('04ae34cf')) return json(500, { message: 'should not be used when the page rollup is zero' });
    if (target.includes('46678020')) return json(200, { results: [...septemberPayment, ...newerPayment], has_more: false });
    if (target.includes('5f05970c')) {
      return json(200, { results: [shiftRow({
        date: '2026-10-16', location: 'Exmouth', window: '17:00–21:00', status: 'Confirmed',
        targetGross: 80, targetTrips: 15, helperPay: 30, quest: true
      })], has_more: false });
    }
    return json(404, { message: 'unexpected' });
  };
  process.env.NOTION_TOKEN = 'test-token';
  const payload = await loadLiveDashboard({ fetchImpl, now: NOW, skipPersist: true });
  assert.equal(payload.currentlyOwed, 0);
  assert.equal(payload.outstandingSyncError, false);
  assert.equal(payload.latestPayment.reference, '55');
  assert.equal(payload.latestPayment.amount, 30.5);
  assert.equal(payload.recentShift.date, '2026-10-12');
  assert.equal(payload.nextShift.date, '2026-10-16');
  assert.equal(calls.some(call => call.includes('04ae34cf')), false);
});

test('a failed summary does not wipe live payments or pretend the balance is zero', async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes('/blocks/')) return json(500, { message: 'blocks down' });
    if (target.includes('/pages/')) return json(404, { message: 'summary missing' });
    if (target.includes('04ae34cf')) return json(500, { message: 'rollup down' });
    if (target.includes('46678020')) return json(200, { results: newerPayment, has_more: false });
    if (target.includes('5f05970c')) return json(500, { message: 'planner down' });
    return json(404, { message: 'unexpected' });
  };
  process.env.NOTION_TOKEN = 'test-token';
  const payload = await loadLiveDashboard({ fetchImpl, now: NOW, skipPersist: true });
  assert.equal(payload.dataUnavailable, undefined);
  assert.equal(payload.currentlyOwed, null);
  assert.equal(payload.outstandingSyncError, true);
  assert.equal(payload.currentlyOwed === 0, false);
  assert.equal(payload.latestPayment.reference, '55');
  assert.equal(payload.latestPayment.amount, 30.5);
  assert.equal(payload.shiftSyncError, true);
  assert.equal(payload.nextShift.status, 'Shift sync unavailable');
  assert.equal(payload.syncTestActive, false);
});

test('failed earnings query is an error payload, not stale September figures', async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes('46678020')) return json(503, { message: 'earnings down' });
    if (target.includes('/pages/')) return json(200, { properties: rollupNumber('Outstanding (£)', 12) });
    if (target.includes('5f05970c')) {
      return json(200, { results: [shiftRow({ date: '2026-09-16', status: 'Confirmed', window: '17:00–21:00', location: 'Exmouth' })], has_more: false });
    }
    if (target.includes('/blocks/')) return json(200, { results: [], has_more: false });
    return json(200, { results: [], has_more: false });
  };
  process.env.NOTION_TOKEN = 'test-token';
  const payload = await loadLiveDashboard({ fetchImpl, now: NOW, skipPersist: true });
  assert.equal(payload.dataUnavailable, true);
  assert.equal(payload.currentlyOwed, null);
  assert.equal(payload.latestPayment, null);
  assert.equal(payload.recentShift, null);
  const serialised = JSON.stringify(payload);
  assert.equal(serialised.includes('2026-09-16'), false);
  assert.equal(serialised.includes('47.49'), false);
});

test('summary data source is used only when the summary page has no rollup', async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes('/blocks/')) return json(200, { results: [], has_more: false });
    if (target.includes('/pages/')) return json(200, { properties: title('Name', 'Current helper outstanding') });
    if (target.includes('04ae34cf')) {
      return json(200, { results: [
        page({ ...title('Name', 'Something else'), ...rollupNumber('Total outstanding (£)', 999) }),
        page({ ...title('Name', 'Current helper outstanding'), ...rollupNumber('Total outstanding (£)', 15) })
      ], has_more: false });
    }
    if (target.includes('46678020')) return json(200, { results: octoberRows, has_more: false });
    if (target.includes('5f05970c')) return json(200, { results: [], has_more: false });
    return json(404, {});
  };
  process.env.NOTION_TOKEN = 'test-token';
  const payload = await loadLiveDashboard({ fetchImpl, now: NOW, skipPersist: true });
  assert.equal(payload.currentlyOwed, 15);
  assert.equal(payload.outstandingSyncError, false);
  assert.notEqual(payload.currentlyOwed, 999);
});

test('missing token does not invent a zero balance', async () => {
  const previous = process.env.NOTION_TOKEN;
  delete process.env.NOTION_TOKEN;
  try {
    const payload = await loadLiveDashboard({
      fetchImpl: async () => { throw new Error('fetch should not run without a token'); },
      now: NOW,
      skipPersist: true
    });
    assert.equal(payload.dataUnavailable, true);
    assert.equal(payload.currentlyOwed, null);
    assert.equal(payload.syncErrorMessage, 'Live Notion data could not be loaded.');
  } finally {
    if (previous == null) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = previous;
  }
});

test('sync-test callout does not replace the rollup or the latest payment', async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes('/blocks/')) {
      return json(200, { results: [{
        type: 'callout',
        callout: { rich_text: [{ plain_text: 'SYNC TEST DATA\nCurrently owed: £1.00\nLatest payment: £2.00\nReference TEST · 1 January 2026' }] }
      }], has_more: false });
    }
    if (target.includes('/pages/')) return json(200, { properties: rollupNumber('Total outstanding (£)', 44) });
    if (target.includes('46678020')) return json(200, { results: newerPayment, has_more: false });
    if (target.includes('5f05970c')) return json(200, { results: [], has_more: false });
    return json(200, { results: [], has_more: false });
  };
  process.env.NOTION_TOKEN = 'test-token';
  const payload = await loadLiveDashboard({ fetchImpl, now: NOW, skipPersist: true });
  assert.equal(payload.syncTestActive, true);
  assert.equal(payload.currentlyOwed, 44);
  assert.equal(payload.latestPayment.amount, 30.5);
  assert.equal(payload.latestPayment.reference, '55');
});

test('GET handler returns the live payload and rejects other methods', async () => {
  const previousFetch = globalThis.fetch;
  process.env.NOTION_TOKEN = 'test-token';
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('/blocks/')) return json(200, { results: [], has_more: false });
    if (target.includes('/pages/')) return json(200, { properties: rollupNumber('Total outstanding (£)', 12.5) });
    if (target.includes('46678020')) return json(200, { results: newerPayment, has_more: false });
    if (target.includes('5f05970c')) return json(200, { results: [], has_more: false });
    return json(200, { results: [], has_more: false });
  };
  try {
    const denied = await dashboardData(new Request('https://helperdashboardapp.netlify.app/api/dashboard-data', { method: 'POST' }));
    assert.equal(denied.status, 405);
    const response = await dashboardData(new Request('https://helperdashboardapp.netlify.app/api/dashboard-data'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json();
    assert.equal(body.currentlyOwed, 12.5);
    assert.equal(body.outstandingSyncError, false);
    assert.equal(body.latestPayment.reference, '55');
    assert.equal(body.dataUnavailable, undefined);
    assert.equal(readLikeFrontend(body).owed, '£12.50');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function money(value) {
  return value === null || value === undefined || value === ''
    ? null
    : `£${Number(value || 0).toFixed(2).replace(/\.00$/, '')}`;
}

function readLikeFrontend(data) {
  if (data.dataUnavailable) return { mode: 'unavailable', owed: null };
  const next = data.nextShift || {};
  const recent = data.recentShift || {};
  const payment = data.latestPayment || {};
  const week = data.currentWeek || {};
  const weekDates = week.weekStart && week.weekEnd
    ? `${new Date(`${week.weekStart}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${week.weekEnd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    : 'Current week';
  return {
    mode: 'live',
    owed: data.outstandingSyncError ? null : money(data.currentlyOwed),
    owedDetail: data.outstandingSyncError
      ? 'Current helper outstanding rollup could not be read — balance withheld.'
      : 'Source: Current helper outstanding rollup',
    boost: money(recent.helperBoost),
    pay: money(recent.helperPay),
    reference: payment.amount == null ? 'No payment recorded' : `Reference ${payment.reference || ''} · ${payment.date || ''}`,
    breakdown: payment.breakdown,
    weekShifts: week.shiftCount,
    weekEarned: money(week.earned),
    weekPaid: money(week.paid),
    weekOutstanding: money(week.outstanding),
    weekDates,
    nextDay: next.day,
    nextGross: money(next.targetGross),
    quest: `Quest: ${String(next.quest || 'Not currently confirmed').toLowerCase()}`,
    upcoming: `${data.upcomingShifts?.[0]?.day || ''} · ${data.upcomingShifts?.[0]?.location || ''}`
  };
}
