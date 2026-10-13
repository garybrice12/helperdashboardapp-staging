const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';
const NOTION_DATA_SOURCE_ID = process.env.NOTION_EARNINGS_DATA_SOURCE_ID || '46678020-e282-4699-96bc-c4db27d3af56';
const NOTION_DASHBOARD_PAGE_ID = process.env.NOTION_DASHBOARD_PAGE_ID || 'c5ea7d91-f11c-4e2d-9822-b98b0d42bcf5';

const DEFAULT_DATA = {
  version: 2,
  updatedAt: '2026-09-16T00:00:00Z',
  nextShift: {
    date: '2026-09-16', day: 'Wed 16 Sep', location: 'Exmouth', start: '5:00pm', end: '9:00pm',
    status: 'Confirmation pending', responseDeadline: '4pm', finalConfirmation: '4:30pm',
    targetGross: 60, targetTrips: 12, estimatedHelperPay: 25, plannedHours: 4, quest: 'Not currently confirmed'
  },
  recentShift: {
    date: '2026-09-15', day: 'Tue 15 Sep', location: 'Exmouth', start: '5:00pm', end: '8:38pm',
    gross: 48.80, trips: 10, helperTime: '3h 38m', helperPay: 17.30
  },
  latestPayment: {
    amount: 47.49, reference: '40', date: '13 September',
    breakdown: [
      { label: 'Saturday 12 September', detail: '6:04–8:36pm · £18.09' },
      { label: 'Sunday 13 September', detail: '5:02–8:50pm · £29.40' }
    ]
  },
  trendDemand: { title: 'Trend & demand', summary: 'No new trend/demand graphic has been recorded for the current shift.', imageData: '', updatedAt: '' },
  currentWeek: { caption: 'Tuesday is complete. Wednesday, Friday and Sunday remain in the current helper forecast.' }
};

function money(n) { return Number.isFinite(Number(n)) ? Number(n) : 0; }
function propNumber(props, name) {
  const p = props?.[name];
  if (!p) return null;
  if (p.type === 'number') return p.number == null ? null : Number(p.number);
  if (p.type === 'formula') {
    const f = p.formula;
    if (f?.type === 'number') return f.number == null ? null : Number(f.number);
  }
  return null;
}
function propDate(props, name) {
  const p = props?.[name];
  return p?.type === 'date' ? (p.date?.start || null) : null;
}
function propTitle(props, name) {
  const p = props?.[name];
  if (p?.type === 'title') return (p.title || []).map(x => x.plain_text || '').join('').trim();
  return '';
}
function propText(props, name) {
  const p = props?.[name];
  if (p?.type === 'rich_text') return (p.rich_text || []).map(x => x.plain_text || '').join('').trim();
  return '';
}

async function notionChildren(blockId) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  const all = [];
  let cursor = '';
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
    });
    if (!response.ok) throw new Error(`Notion blocks ${response.status}`);
    const data = await response.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : '';
  } while (cursor);
  return all;
}

function richTextPlain(items) {
  return (items || []).map(x => x.plain_text || x.text?.content || '').join('');
}

async function getSyncTestData() {
  const blocks = await notionChildren(NOTION_DASHBOARD_PAGE_ID);
  const callout = blocks.find(b => b.type === 'callout' && /SYNC TEST DATA/i.test(richTextPlain(b.callout?.rich_text)));
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

async function notionQueryAll() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  const all = [];
  let cursor;
  do {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_size: 100,
        sorts: [{ property: 'Date', direction: 'descending' }],
        ...(cursor ? { start_cursor: cursor } : {})
      })
    });
    if (!response.ok) throw new Error(`Notion data source query ${response.status}: ${await response.text()}`);
    const data = await response.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return all;
}

function durationText(hours) {
  if (!Number.isFinite(hours)) return '';
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}
function displayDate(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
function extractTime(notes) {
  const m = String(notes || '').match(/(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})/);
  return m ? `${m[1]}–${m[2]}` : '';
}

async function getNotionData(base) {
  const pages = await notionQueryAll();
  const rows = pages.map(page => {
    const p = page.properties || {};
    return {
      page,
      day: propTitle(p, 'Day'),
      date: propDate(p, 'Date'),
      paidDate: propDate(p, 'Date paid'),
      gross: propNumber(p, 'Gross (£)') || 0,
      miles: propNumber(p, 'Miles') || 0,
      trips: propNumber(p, 'Trips/deliveries') || 0,
      withHelper: p['With helper']?.checkbox === true,
      helperPaid: propNumber(p, 'Helper paid (£)') || 0,
      helperOutstanding: propNumber(p, 'Helper outstanding (£)'),
      helperPayout: propNumber(p, 'Helper payout (£)'),
      paymentRef: propNumber(p, 'Payment ref'),
      helperHours: propNumber(p, 'Helper hours'),
      notes: propText(p, 'Notes')
    };
  });

  const helperRows = rows.filter(r => r.withHelper);
  const owed = helperRows.reduce((sum, r) => sum + (r.helperOutstanding ?? Math.max(0, (r.helperPayout || 0) - (r.helperPaid || 0))), 0);

  const paidRows = helperRows.filter(r => r.paidDate && r.paymentRef != null);
  let latestPayment = base.latestPayment;
  if (paidRows.length) {
    const latestDate = paidRows.map(r => r.paidDate).sort().at(-1);
    const latestRef = paidRows.filter(r => r.paidDate === latestDate).map(r => r.paymentRef).sort((a,b) => a-b).at(-1);
    const paymentRows = paidRows.filter(r => r.paidDate === latestDate && r.paymentRef === latestRef);
    const amount = paymentRows.reduce((sum, r) => sum + (r.helperPaid || 0), 0);
    latestPayment = {
      amount: Math.round(amount * 100) / 100,
      reference: String(latestRef),
      date: displayDate(latestDate),
      breakdown: paymentRows.slice().sort((a,b) => String(a.date).localeCompare(String(b.date))).map(r => ({
        label: r.day.replace(/^.*?—\s*/, '').replace(/\s+(?:helper|evening|afternoon|morning).*$/i, '') || r.day,
        detail: `${extractTime(r.notes)}${extractTime(r.notes) ? ' · ' : ''}£${(r.helperPaid || 0).toFixed(2)}`
      }))
    };
    // Prefer the actual day title for the two current payment rows.
    latestPayment.breakdown = paymentRows.map(r => ({
      label: r.day.replace(/\s+—\s+.*$/, ''),
      detail: `${extractTime(r.notes)}${extractTime(r.notes) ? ' · ' : ''}£${(r.helperPaid || 0).toFixed(2)}`
    }));
  }

  const recent = rows.find(r => r.withHelper && r.date === rows.find(x => x.withHelper)?.date) || helperRows[0];
  const recentShift = recent ? {
    ...base.recentShift,
    date: recent.date,
    day: recent.date ? new Date(`${recent.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : base.recentShift.day,
    gross: recent.gross,
    trips: recent.trips,
    helperPay: recent.helperPayout != null ? Math.round(recent.helperPayout * 100) / 100 : base.recentShift.helperPay,
    helperTime: recent.helperHours != null ? durationText(recent.helperHours) : base.recentShift.helperTime,
    location: /Exmouth/i.test(recent.notes) ? 'Exmouth' : base.recentShift.location,
    start: extractTime(recent.notes)?.split('–')[0] || base.recentShift.start,
    end: extractTime(recent.notes)?.split('–')[1] || base.recentShift.end
  } : base.recentShift;

  const syncTest = await getSyncTestData().catch(() => null);
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    recentShift,
    latestPayment: syncTest?.latestPayment || latestPayment,
    currentlyOwed: syncTest ? Math.round(syncTest.currentlyOwed * 100) / 100 : Math.round(owed * 100) / 100,
    syncTestActive: Boolean(syncTest)
  };
}

async function getData() {
  const fallback = DEFAULT_DATA;
  try { return await getNotionData(fallback); }
  catch (error) {
    console.error('Notion dashboard sync failed; falling back to stored data', error?.message || error);
    try {
      const { getStore } = await import('@netlify/blobs');
      const store = getStore(STORE_NAME, { consistency: 'strong' });
      const value = await store.get(KEY, { type: 'json' });
      return value || fallback;
    } catch { return { ...fallback, storageUnavailable: true }; }
  }
}

export default async (req) => {
  if (req.method === 'GET') return Response.json(await getData(), { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  return new Response('Method not allowed', { status: 405 });
};
export const config = { path: '/api/dashboard-data', method: ['GET'] };
