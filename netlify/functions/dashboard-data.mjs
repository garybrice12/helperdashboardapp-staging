const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';

const NOTION_EARNINGS_ID =
  process.env.NOTION_EARNINGS_DATA_SOURCE_ID ||
  '46678020-e282-4699-96bc-c4db27d3af56';

const NOTION_WORK_PLANNER_ID =
  process.env.NOTION_WORK_PLANNER_DATA_SOURCE_ID ||
  '5f05970c-fcc0-497b-aa62-3e8edefbbb2b';

const NOTION_HELPER_SUMMARY_ID =
  process.env.NOTION_HELPER_PAY_SUMMARY_PAGE_ID ||
  '3f9f475c-d2eb-81ae-812f-e65f142fc1c1';

const NOTION_DASHBOARD_PAGE_ID =
  process.env.NOTION_DASHBOARD_PAGE_ID ||
  'c5ea7d91-f11c-4e2d-9822-b98b0d42bcf5';

const DEFAULT_DATA = {
  version: 2,
  updatedAt: '',
  nextShift: null,
  recentShift: null,
  latestPayment: null,
  currentlyOwed: null,
  syncTestActive: false,
  trendDemand: {
    title: 'Trend & demand',
    summary: 'No new trend/demand graphic has been recorded for the current shift.',
    imageData: '',
    updatedAt: ''
  },
  currentWeek: {
    caption: 'No current-week forecast available.'
  }
};

function propNumber(props, name) {
  const p = props?.[name];
  if (!p) return null;
  if (p.type === 'number') return p.number == null ? null : Number(p.number);
  if (p.type === 'formula' && p.formula?.type === 'number') {
    return p.formula.number == null ? null : Number(p.formula.number);
  }
  if (p.type === 'rollup') {
    const r = p.rollup;
    if (r?.type === 'number') return r.number == null ? null : Number(r.number);
    if (r?.type === 'array' && Array.isArray(r.array)) {
      const nums = r.array.map(x => {
        if (x?.type === 'number') return Number(x.number || 0);
        if (x?.type === 'formula' && x.formula?.type === 'number') {
          return Number(x.formula.number || 0);
        }
        return null;
      });
      if (nums.every(n => n !== null)) return nums.reduce((a, b) => a + b, 0);
    }
  }
  return null;
}

function propDate(props, name) {
  const p = props?.[name];
  return p?.type === 'date' ? (p.date?.start || null) : null;
}

function propTitle(props, name) {
  const p = props?.[name];
  if (p?.type === 'title') {
    return (p.title || []).map(x => x.plain_text || '').join('').trim();
  }
  return '';
}

function propText(props, name) {
  const p = props?.[name];
  if (p?.type === 'rich_text') {
    return (p.rich_text || []).map(x => x.plain_text || '').join('').trim();
  }
  if (p?.type === 'select') return p.select?.name || '';
  if (p?.type === 'status') return p.status?.name || '';
  return '';
}

function propCheckbox(props, name) {
  return props?.[name]?.type === 'checkbox'
    ? props[name].checkbox === true
    : false;
}

function richTextPlain(items) {
  return (items || []).map(x => x.plain_text || x.text?.content || '').join('');
}

function displayDate(value, includeYear = false) {
  if (!value) return '';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC'
  });
}

function weekdayDate(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  });
}

function durationText(hours) {
  if (!Number.isFinite(hours)) return '';
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

function extractTime(notes) {
  const m = String(notes || '').match(/(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})/);
  return m ? `${m[1]}–${m[2]}` : '';
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function notionRequest(url, options = {}) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Notion API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function queryDataSource(dataSourceId) {
  const results = [];
  let cursor;

  do {
    const data = await notionRequest(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: 'POST',
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {})
        })
      }
    );

    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

async function getPageBlocks(pageId) {
  const results = [];
  let cursor;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);

    const data = await notionRequest(url.toString());
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

async function getSyncTestData() {
  const blocks = await getPageBlocks(NOTION_DASHBOARD_PAGE_ID);
  const callout = blocks.find(
    b => b.type === 'callout' &&
      /SYNC TEST DATA/i.test(richTextPlain(b.callout?.rich_text))
  );

  if (!callout) return null;

  const text = richTextPlain(callout.callout?.rich_text);
  const owed = text.match(/Currently owed:\s*£?([0-9]+(?:\.[0-9]{1,2})?)/i);
  const payment = text.match(/Latest payment:\s*£?([0-9]+(?:\.[0-9]{1,2})?)/i);
  const ref = text.match(/Reference\s+([^·\n]+)/i);
  const date = text.match(/·\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);

  if (!owed || !payment) return null;

  return {
    currentlyOwed: Number(owed[1]),
    latestPayment: {
      amount: Number(payment[1]),
      reference: (ref?.[1] || 'TEST').trim(),
      date: (date?.[1] || '').trim(),
      breakdown: []
    }
  };
}

async function getHelperSummaryOutstanding() {
  const page = await notionRequest(
    `https://api.notion.com/v1/pages/${NOTION_HELPER_SUMMARY_ID}`
  );

  const props = page.properties || {};

  // Use the summary's outstanding rollup as the source of truth.
  for (const name of [
    'Total outstanding (£)',
    'Total outstanding',
    'Outstanding (£)',
    'Outstanding'
  ]) {
    const value = propNumber(props, name);
    if (value !== null) return money(value);
  }

  throw new Error(
    'Could not read the outstanding rollup from the Helper Pay Summary page. Check its exact property name and type.'
  );
}

function mapEarningsPage(page) {
  const p = page.properties || {};
  const notes = propText(p, 'Notes');
  const date = propDate(p, 'Date');

  return {
    page,
    day: propTitle(p, 'Day'),
    date,
    paidDate: propDate(p, 'Date paid'),
    gross: propNumber(p, 'Gross (£)') ?? 0,
    miles: propNumber(p, 'Miles') ?? 0,
    trips: propNumber(p, 'Trips/deliveries') ?? 0,
    withHelper: propCheckbox(p, 'With helper'),
    helperPaid: propNumber(p, 'Helper paid (£)') ?? 0,
    helperPayout: propNumber(p, 'Helper payout (£)'),
    paymentRef: propNumber(p, 'Payment ref'),
    helperHours: propNumber(p, 'Helper hours'),
    notes,
    boost: propNumber(p, 'Boost (£)') ??
      propNumber(p, 'Trip boost (£)') ??
      propNumber(p, 'Quest bonus (£)'),
    boostEligible: propCheckbox(p, 'Boost eligible') ||
      propCheckbox(p, 'Trip boost eligible')
  };
}

function makeLatestPayment(rows, fallback) {
  const paidRows = rows.filter(r => r.withHelper && r.paidDate && r.paymentRef != null);
  if (!paidRows.length) return fallback;

  const latestDate = paidRows.map(r => r.paidDate).sort().at(-1);
  const latestRef = paidRows
    .filter(r => r.paidDate === latestDate)
    .map(r => r.paymentRef)
    .sort((a, b) => a - b)
    .at(-1);

  const paymentRows = paidRows.filter(
    r => r.paidDate === latestDate && r.paymentRef === latestRef
  );

  const amount = paymentRows.reduce((sum, r) => sum + r.helperPaid, 0);

  return {
    amount: money(amount),
    reference: String(latestRef),
    date: displayDate(latestDate),
    breakdown: paymentRows.map(r => ({
      label: r.day.replace(/\s+—\s+.*$/, '') || r.day,
      detail: `${extractTime(r.notes)}${extractTime(r.notes) ? ' · ' : ''}£${r.helperPaid.toFixed(2)}`
    }))
  };
}

function makeRecentShift(rows, fallback) {
  const recent = rows
    .filter(r => r.withHelper && r.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!recent) return fallback;

  return {
    date: recent.date,
    day: weekdayDate(recent.date),
    location: /Exmouth/i.test(recent.notes) ? 'Exmouth' : '',
    start: extractTime(recent.notes)?.split('–')[0] || '',
    end: extractTime(recent.notes)?.split('–')[1] || '',
    gross: recent.gross,
    trips: recent.trips,
    helperTime: recent.helperHours != null ? durationText(recent.helperHours) : '',
    helperPay: recent.helperPayout != null ? money(recent.helperPayout) : null,
    boost: recent.boost,
    boostEligible: recent.boostEligible
  };
}

function makeNextShift(pages) {
  const today = new Date().toISOString().slice(0, 10);

  const candidates = pages.map(page => {
    const p = page.properties || {};
    return {
      date: propDate(p, 'Date'),
      day: propTitle(p, 'Day'),
      location: propText(p, 'Location') || propText(p, 'Area'),
      start: propText(p, 'Start time') || propText(p, 'Start'),
      end: propText(p, 'End time') || propText(p, 'Finish time') || propText(p, 'End'),
      status: propText(p, 'Status'),
      crew: propText(p, 'Crew') || propText(p, 'With helper'),
      quest: propCheckbox(p, 'Quest') ? 'Confirmed' : 'Not confirmed',
      targetGross: propNumber(p, 'Target gross (£)') ?? propNumber(p, 'Target gross'),
      targetTrips: propNumber(p, 'Target trips'),
      plannedHours: propNumber(p, 'Planned hours')
    };
  });

  const upcoming = candidates
    .filter(s => s.date && s.date >= today &&
      !/complete|cancel|declined/i.test(s.status || ''))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!upcoming.length) return null;

  const shift = upcoming[0];
  return {
    ...shift,
    day: shift.day || weekdayDate(shift.date),
    status: shift.status || 'Pending confirmation',
    responseDeadline: '',
    finalConfirmation: '',
    estimatedHelperPay: null
  };
}

async function getData() {
  const [earningsPages, plannerPages, summaryOwed] = await Promise.all([
    queryDataSource(NOTION_EARNINGS_ID),
    queryDataSource(NOTION_WORK_PLANNER_ID),
    getHelperSummaryOutstanding()
  ]);

  const rows = earningsPages.map(mapEarningsPage)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const nextShift = makeNextShift(plannerPages);
  const recentShift = makeRecentShift(rows, null);
  const latestPayment = makeLatestPayment(rows, null);

  const syncTest = await getSyncTestData().catch(() => null);

  return {
    ...DEFAULT_DATA,
    updatedAt: new Date().toISOString(),
    nextShift,
    recentShift,
    latestPayment: syncTest?.latestPayment || latestPayment,
    currentlyOwed: syncTest
      ? money(syncTest.currentlyOwed)
      : money(summaryOwed),
    syncTestActive: Boolean(syncTest),
    tripBoost: recentShift?.boost ?? null
  };
}

async function getDataSafe() {
  try {
    return await getData();
  } catch (error) {
    console.error('Notion dashboard sync failed', error?.message || error);

    try {
      const { getStore } = await import('@netlify/blobs');
      const store = getStore(STORE_NAME, { consistency: 'strong' });
      const value = await store.get(KEY, { type: 'json' });

      // Never show stale September fallback data as a real upcoming shift.
      return {
        ...DEFAULT_DATA,
        ...(value || {}),
        nextShift: null,
        syncError: true,
        syncErrorMessage: 'Live Notion data could not be loaded.'
      };
    } catch {
      return {
        ...DEFAULT_DATA,
        nextShift: null,
        currentlyOwed: null,
        storageUnavailable: true,
        syncError: true
      };
    }
  }
}

export default async req => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  return Response.json(await getDataSafe(), {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  });
};

export const config = {
  path: '/api/dashboard-data',
  method: ['GET']
};
