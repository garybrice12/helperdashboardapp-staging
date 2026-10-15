const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';
const NOTION_DATA_SOURCE_ID = process.env.NOTION_EARNINGS_DATA_SOURCE_ID || '46678020-e282-4699-96bc-c4db27d3af56';
const NOTION_DASHBOARD_PAGE_ID = process.env.NOTION_DASHBOARD_PAGE_ID || 'c5ea7d91-f11c-4e2d-9822-b98b0d42bcf5';
const NOTION_SHIFTS_DATA_SOURCE_ID = process.env.NOTION_SHIFTS_DATA_SOURCE_ID || '5f05970c-fcc0-497b-aa62-3e8edefbbb2b';
const NOTION_OUTSTANDING_DATA_SOURCE_ID = process.env.NOTION_OUTSTANDING_DATA_SOURCE_ID || '04ae34cf-2938-40ab-91c5-d917e76b297a';

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
  if (p.type === 'rollup') { const r = p.rollup; if (r?.type === 'number') return r.number == null ? null : Number(r.number); if (r?.type === 'array' && Array.isArray(r.array)) return r.array.reduce((sum, item) => sum + Number(item?.number || item?.formula?.number || 0), 0); }
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


function propSelect(props, name) {
  const p = props?.[name];
  return p?.type === 'select' ? (p.select?.name || '') : '';
}
function propCheckbox(props, name) {
  const p = props?.[name];
  return p?.type === 'checkbox' && p.checkbox === true;
}
function propFormulaText(props, name) {
  const p = props?.[name];
  if (p?.type !== 'formula') return '';
  const f = p.formula;
  if (f?.type === 'string') return f.string || '';
  if (f?.type === 'number') return f.number == null ? '' : String(f.number);
  return '';
}
async function notionQuerySource(sourceId, sortProperty = 'Date', direction = 'ascending') {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  const all = [];
  let cursor;
  do {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${sourceId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_size: 100,
        sorts: [{ property: sortProperty, direction }],
        ...(cursor ? { start_cursor: cursor } : {})
      })
    });
    if (!response.ok) throw new Error(`Notion data source ${sourceId} query ${response.status}`);
    const data = await response.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return all;
}
function formatClock(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return value;
  const h = Number(m[1]), mins = m[2];
  const suffix = h >= 12 ? 'pm' : 'am';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${mins === '00' ? '00' : mins}${suffix}`;
}
function hoursFromWindow(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) {
    const h = String(value || '').match(/(\d+(?:\.\d+)?)\s*hours?/i);
    return h ? Number(h[1]) : 0;
  }
  let start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (end < start) end += 24 * 60;
  return Math.round(((end - start) / 60) * 100) / 100;
}
function makeLiveNextShift(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = pages.map(page => {
    const p = page.properties || {};
    const date = propDate(p, 'Date');
    return {
      date,
      day: date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '',
      title: propTitle(p, 'Shift'),
      location: propText(p, 'Location'),
      window: propText(p, 'Window'),
      status: propSelect(p, 'Status'),
      crew: propSelect(p, 'Crew'),
      targetGross: propNumber(p, 'Target Gross'),
      targetTrips: propNumber(p, 'Trip Target'),
      estimatedHelperPay: propNumber(p, 'Helper Pay'),
      quest: propCheckbox(p, 'Quest') ? 'Confirmed' : 'Not currently confirmed',
      completed: propCheckbox(p, 'Completed')
    };
  }).filter(s => s.date && s.date >= today && !s.completed &&
    ['Confirmed', 'Live'].includes(s.status) &&
    (!s.crew || s.crew === 'With helper'));
  const priority = { Live: 0, Confirmed: 1 };
  candidates.sort((a, b) => a.date.localeCompare(b.date) ||
    (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
  const s = candidates[0];
  if (!s) return {
    date: '', day: 'No upcoming helper shift', location: 'No confirmed helper shift',
    start: '', end: '', status: 'No upcoming helper shift', responseDeadline: '',
    finalConfirmation: '', targetGross: null, targetTrips: null, estimatedHelperPay: null,
    plannedHours: null, quest: 'No upcoming confirmed Quest shift'
  };
  const m = String(s.window || s.title).match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  return {
    date: s.date, day: s.day, location: s.location || s.title, start: m ? formatClock(m[1]) : '',
    end: m ? formatClock(m[2]) : '', status: s.status, responseDeadline: '',
    finalConfirmation: '', targetGross: s.targetGross || 0, targetTrips: s.targetTrips || 0,
    estimatedHelperPay: s.estimatedHelperPay || 0, plannedHours: hoursFromWindow(s.window),
    quest: s.quest
  };
}

function makeLiveUpcomingShifts(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = pages.map(page => {
    const p = page.properties || {};
    const date = propDate(p, 'Date');
    return {
      date,
      day: date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '',
      title: propTitle(p, 'Shift'),
      location: propText(p, 'Location'),
      window: propText(p, 'Window'),
      status: propSelect(p, 'Status'),
      crew: propSelect(p, 'Crew'),
      targetGross: propNumber(p, 'Target Gross'),
      targetTrips: propNumber(p, 'Trip Target'),
      estimatedHelperPay: propNumber(p, 'Helper Pay'),
      quest: propCheckbox(p, 'Quest'),
      completed: propCheckbox(p, 'Completed')
    };
  }).filter(s => s.date && s.date >= today && !s.completed &&
    ['Confirmed', 'Live'].includes(s.status) && (!s.crew || s.crew === 'With helper'));
  const priority = { Live: 0, Confirmed: 1 };
  return rows.sort((a, b) => a.date.localeCompare(b.date) ||
    (priority[a.status] ?? 9) - (priority[b.status] ?? 9)).slice(0, 10);
}

async function getNotionData(base) {
  const [pages, shiftResult] = await Promise.all([
    notionQueryAll(),
    notionQuerySource(NOTION_SHIFTS_DATA_SOURCE_ID, 'Date', 'ascending')
      .then(pages => ({ pages, error: false }))
      .catch(error => {
        console.error('Notion live-shifts sync failed', error?.message || error);
        return { pages: [], error: true };
      })
  ]);
  const shiftPages = shiftResult.pages;
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
      helperBoost: propNumber(p, 'Helper boost (£)'),
      helperPayout: propNumber(p, 'Helper payout (£)'),
      paymentRef: propNumber(p, 'Payment ref'),
      helperHours: propNumber(p, 'Helper hours'),
      notes: propText(p, 'Notes'),
      shiftTime: propText(p, 'Shift time'),
      shiftDuration: propText(p, 'Shift duration')
    };
  });

  const helperRows = rows.filter(r => r.withHelper);
  // Authoritative balance: read the Current helper outstanding rollup, not a duplicate sum of earnings rows.
  let owed = null;
  let outstandingSyncError = false;
  try {
    const summaryPages = await notionQuerySource(NOTION_OUTSTANDING_DATA_SOURCE_ID, 'Summary', 'ascending');
    const summary = summaryPages.find(page => /current helper outstanding/i.test(propTitle(page.properties || {}, 'Name'))) || summaryPages[0];
    if (summary) {
      const p = summary.properties || {};
      owed = propNumber(p, 'Total outstanding (£)');
      if (owed === null) {
        const title = Object.keys(p).find(k => /total outstanding/i.test(k));
        if (title) owed = propNumber(p, title);
      }
    }
    if (owed === null) outstandingSyncError = true;
  } catch (error) {
    console.error('Authoritative outstanding rollup sync failed', error?.message || error);
    outstandingSyncError = true;
  }

  const paidRows = helperRows.filter(r => r.paidDate && (r.helperPaid || 0) > 0);
  let latestPayment = { amount: null, reference: '', date: '', breakdown: [] };
  if (paidRows.length) {
    const latestDate = paidRows.map(r => r.paidDate).sort().at(-1);
    const latestDayRows = paidRows.filter(r => r.paidDate === latestDate);
    const refs = latestDayRows.map(r => r.paymentRef).filter(v => v !== null && v !== undefined);
    const latestRef = refs.length ? refs.sort((a,b) => Number(a)-Number(b)).at(-1) : null;
    const paymentRows = latestRef === null ? latestDayRows : latestDayRows.filter(r => String(r.paymentRef) === String(latestRef));
    const amount = paymentRows.reduce((sum, r) => sum + (r.helperPaid || 0), 0);
    latestPayment = {
      amount: Math.round(amount * 100) / 100,
      reference: latestRef === null ? 'Not recorded' : String(latestRef),
      date: displayDate(latestDate),
      breakdown: paymentRows.slice().sort((a,b) => String(a.date).localeCompare(String(b.date))).map(r => ({
        label: r.day.replace(/^.*?—\s*/, '').replace(/\s+(?:helper|evening|afternoon|morning).*$/i, '') || r.day,
        detail: `${r.shiftTime || extractTime(r.notes)}${(r.shiftTime || extractTime(r.notes)) ? ' · ' : ''}£${(r.helperPaid || 0).toFixed(2)}`
      }))
    };
    // Prefer the actual day title for the two current payment rows.
    latestPayment.breakdown = paymentRows.map(r => ({
      label: r.day.replace(/\s+—\s+.*$/, ''),
      detail: `${r.shiftTime || extractTime(r.notes)}${(r.shiftTime || extractTime(r.notes)) ? ' · ' : ''}£${(r.helperPaid || 0).toFixed(2)}`
    }));
  }

  const recent = helperRows.filter(r => r.date).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const recentShift = recent ? {
    date: recent.date,
    day: new Date(`${recent.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
    gross: recent.gross,
    trips: recent.trips,
    helperBoost: recent.helperBoost,
    helperPay: recent.helperPayout != null ? Math.round(recent.helperPayout * 100) / 100 : null,
    helperTime: recent.shiftDuration || (recent.helperHours != null ? durationText(recent.helperHours) : ''),
    location: /Exmouth/i.test(recent.notes) ? 'Exmouth' : '',
    start: (recent.shiftTime || extractTime(recent.notes))?.split(/[–-]/)[0] || '',
    end: (recent.shiftTime || extractTime(recent.notes))?.split(/[–-]/)[1] || ''
  } : { date: '', day: 'No completed helper shift recorded', gross: null, trips: null, helperPay: null, helperTime: '', location: '', start: '', end: '' };

  const nextShift = makeLiveNextShift(shiftPages);
  const upcomingShifts = makeLiveUpcomingShifts(shiftPages);
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = new Date(todayUtc);
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const iso = d => d.toISOString().slice(0, 10);
  const weekStart = iso(monday), weekEnd = iso(sunday);
  const weekRows = helperRows.filter(r => r.date && r.date >= weekStart && r.date <= weekEnd &&
    ((r.gross || 0) > 0 || (r.trips || 0) > 0 || (r.helperHours || 0) > 0));
  const weekEarned = weekRows.reduce((sum, r) => sum + (r.helperPayout || 0), 0);
  const weekPaid = helperRows.filter(r => r.paidDate && r.paidDate >= weekStart && r.paidDate <= weekEnd)
    .reduce((sum, r) => sum + (r.helperPaid || 0), 0);
  const weekOutstanding = weekRows.reduce((sum, r) => sum + (r.helperOutstanding ?? Math.max(0, (r.helperPayout || 0) - (r.helperPaid || 0))), 0);
  const weekHours = weekRows.reduce((sum, r) => sum + (r.helperHours || 0), 0);
  const weekCaption = `${displayDate(weekStart)}–${displayDate(weekEnd)} · ${weekRows.length} helper shift${weekRows.length === 1 ? '' : 's'} · £${weekEarned.toFixed(2)} earned · £${weekPaid.toFixed(2)} paid this week · £${weekOutstanding.toFixed(2)} outstanding on these shifts`;
  const currentWeek = { weekStart, weekEnd, shiftCount: weekRows.length, hours: Math.round(weekHours * 100) / 100,
    earned: Math.round(weekEarned * 100) / 100, paid: Math.round(weekPaid * 100) / 100,
    outstanding: Math.round(weekOutstanding * 100) / 100, caption: weekCaption };
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    nextShift,
    recentShift,
    latestPayment,
    currentlyOwed: owed === null ? null : Math.round(owed * 100) / 100,
    outstandingSyncError,
    currentWeek,
    upcomingShifts,
    shiftSyncError: shiftResult.error,
    earningsSyncError: false,
    syncTestActive: false
  };
}

async function getData() {
  const fallback = DEFAULT_DATA;
  try { return await getNotionData(fallback); }
  catch (error) {
    console.error('Notion dashboard sync failed; live data is unavailable', error?.message || error);
    return {
      version: 3,
      updatedAt: '',
      dataUnavailable: true,
      dataError: 'Live Notion data could not be loaded.',
      nextShift: { date: '', day: 'Live data unavailable', location: 'Unable to load shift data', start: '', end: '', status: 'Connection unavailable', responseDeadline: '', finalConfirmation: '', targetGross: null, targetTrips: null, estimatedHelperPay: null, plannedHours: null, quest: 'Unavailable' },
      recentShift: null,
      latestPayment: null,
      currentlyOwed: null,
      currentWeek: { caption: 'Live weekly data unavailable', shiftCount: null, hours: null, earned: null, paid: null, outstanding: null },
      upcomingShifts: [],
      trendDemand: { title: 'Live data unavailable', summary: 'Connect the Notion data sources to display current information.', imageData: '', updatedAt: '' }
    };
  }
}

export default async (req) => {
  if (req.method === 'GET') return Response.json(await getData(), { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  return new Response('Method not allowed', { status: 405 });
};
export const config = { path: '/api/dashboard-data', method: ['GET'] };
