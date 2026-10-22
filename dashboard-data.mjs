// Helper dashboard payload for /api/dashboard-data.
// Outstanding balance is read only from the Helper Pay Summary rollup.
// A failed or missing rollup stays null with outstandingSyncError — never £0,
// and never a sum of Earnings Log rows. Earnings, shifts and the summary fail
// independently. Stale September records are never returned.

const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';

const NOTION_EARNINGS_ID =
  process.env.NOTION_EARNINGS_DATA_SOURCE_ID ||
  '46678020-e282-4699-96bc-c4db27d3af56';

const NOTION_SHIFTS_ID =
  process.env.NOTION_SHIFTS_DATA_SOURCE_ID ||
  process.env.NOTION_WORK_PLANNER_DATA_SOURCE_ID ||
  '5f05970c-fcc0-497b-aa62-3e8edefbbb2b';

const NOTION_HELPER_SUMMARY_PAGE_ID =
  process.env.NOTION_HELPER_PAY_SUMMARY_PAGE_ID ||
  '3f9f475c-d2eb-81ae-812f-e65f142fc1c1';

const NOTION_OUTSTANDING_DATA_SOURCE_ID =
  process.env.NOTION_OUTSTANDING_DATA_SOURCE_ID ||
  '04ae34cf-2938-40ab-91c5-d917e76b297a';

const NOTION_DASHBOARD_PAGE_ID =
  process.env.NOTION_DASHBOARD_PAGE_ID ||
  'c5ea7d91-f11c-4e2d-9822-b98b0d42bcf5';

const OUTSTANDING_NAMES = [
  'Total outstanding (£)',
  'Total outstanding',
  'Outstanding (£)',
  'Outstanding'
];

const TREND_DEMAND = {
  title: 'Trend & demand',
  summary: 'No new trend/demand graphic has been recorded for the current shift.',
  imageData: '',
  updatedAt: ''
};

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function dateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function propNumber(props, name) {
  const property = props?.[name];
  if (!property) return null;
  if (property.type === 'number') {
    return property.number == null ? null : Number(property.number);
  }
  if (property.type === 'formula') {
    const formula = property.formula;
    if (formula?.type === 'number') {
      return formula.number == null ? null : Number(formula.number);
    }
    return null;
  }
  if (property.type === 'rollup') return rollupNumber(property.rollup);
  return null;
}

function rollupNumber(rollup) {
  if (!rollup) return null;
  if (rollup.type === 'number') {
    return rollup.number == null ? null : Number(rollup.number);
  }
  if (rollup.type !== 'array' || !Array.isArray(rollup.array)) return null;
  if (rollup.array.length === 0) return null;
  const numbers = rollup.array.map(item => {
    if (item?.type === 'number') {
      return item.number == null ? null : Number(item.number);
    }
    if (item?.type === 'formula' && item.formula?.type === 'number') {
      return item.formula.number == null ? null : Number(item.formula.number);
    }
    return null;
  });
  if (numbers.some(value => value == null || !Number.isFinite(value))) return null;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function readOutstandingValue(props) {
  if (!props) return null;
  for (const name of OUTSTANDING_NAMES) {
    if (Object.prototype.hasOwnProperty.call(props, name)) {
      const value = propNumber(props, name);
      if (value !== null) return value;
    }
  }
  const fallbackName = Object.keys(props).find(name => /total outstanding/i.test(name));
  if (!fallbackName) return null;
  return propNumber(props, fallbackName);
}

function propDate(props, name) {
  const property = props?.[name];
  if (property?.type !== 'date') return null;
  return dateOnly(property.date?.start);
}

function propTitle(props, name) {
  const property = props?.[name];
  if (property?.type !== 'title') return '';
  return (property.title || []).map(part => part.plain_text || '').join('').trim();
}

function pageTitle(page) {
  const props = page?.properties || {};
  for (const property of Object.values(props)) {
    if (property?.type === 'title') {
      return (property.title || []).map(part => part.plain_text || '').join('').trim();
    }
  }
  return '';
}

function propText(props, name) {
  const property = props?.[name];
  if (!property) return '';
  if (property.type === 'rich_text') {
    return (property.rich_text || []).map(part => part.plain_text || '').join('').trim();
  }
  if (property.type === 'select') return property.select?.name || '';
  if (property.type === 'status') return property.status?.name || '';
  if (property.type === 'formula') {
    const formula = property.formula;
    if (formula?.type === 'string') return formula.string || '';
    if (formula?.type === 'number' && formula.number != null) return String(formula.number);
  }
  return '';
}

function propSelect(props, name) {
  const property = props?.[name];
  if (property?.type === 'select') return property.select?.name || '';
  if (property?.type === 'status') return property.status?.name || '';
  return '';
}

function propCheckbox(props, name) {
  return props?.[name]?.type === 'checkbox' && props[name].checkbox === true;
}

function richTextPlain(items) {
  return (items || []).map(part => part.plain_text || part.text?.content || '').join('');
}

function displayDate(value) {
  const day = dateOnly(value);
  if (!day) return '';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  });
}

function weekdayDate(value) {
  const day = dateOnly(value);
  if (!day) return '';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  });
}

function durationText(hours) {
  if (!Number.isFinite(hours)) return '';
  const mins = Math.round(hours * 60);
  const wholeHours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return wholeHours ? `${wholeHours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
}

function extractTime(notes) {
  const match = String(notes || '').match(
    /(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[–-]\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i
  );
  if (!match) return '';
  return `${match[1].replace(/\s+/g, '')}–${match[2].replace(/\s+/g, '')}`;
}

function formatClock(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/[ap]m$/i.test(raw)) return raw.replace(/\s+/g, '').replace(/AM$/i, 'am').replace(/PM$/i, 'pm');
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${match[2]}${suffix}`;
}

function toMinutes(hourText, minuteText, suffix) {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (suffix) {
    const marker = suffix.toLowerCase();
    if (marker === 'pm' && hour < 12) hour += 12;
    if (marker === 'am' && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
}

function hoursFromWindow(value) {
  const match = String(value || '').match(
    /(\d{1,2}):(\d{2})\s*(am|pm)?\s*[–-]\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i
  );
  if (!match) {
    const hours = String(value || '').match(/(\d+(?:\.\d+)?)\s*hours?/i);
    return hours ? Number(hours[1]) : null;
  }
  let start = toMinutes(match[1], match[2], match[3]);
  let end = toMinutes(match[4], match[5], match[6]);
  if (end < start) end += 24 * 60;
  return Math.round(((end - start) / 60) * 100) / 100;
}

function clockWindow(value) {
  const match = String(value || '').match(
    /(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[–-]\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i
  );
  if (!match) return { start: '', end: '' };
  return {
    start: formatClock(match[1]),
    end: formatClock(match[2])
  };
}

function emptyNextShift() {
  return {
    date: '',
    day: 'No upcoming helper shift',
    location: 'No confirmed helper shift',
    start: '',
    end: '',
    status: 'No upcoming helper shift',
    responseDeadline: '',
    finalConfirmation: '',
    targetGross: null,
    targetTrips: null,
    estimatedHelperPay: null,
    plannedHours: null,
    quest: 'No upcoming confirmed Quest shift'
  };
}

function shiftUnavailable() {
  return {
    ...emptyNextShift(),
    day: 'Unable to load shift data',
    location: 'Work Planner could not be read',
    status: 'Shift sync unavailable',
    quest: 'Unavailable'
  };
}

function unavailablePayload(now = new Date()) {
  return {
    version: 3,
    updatedAt: now.toISOString(),
    dataUnavailable: true,
    dataError: 'Live Notion data could not be loaded.',
    syncError: true,
    syncErrorMessage: 'Live Notion data could not be loaded.',
    nextShift: {
      date: '',
      day: 'Live data unavailable',
      location: 'Unable to load shift data',
      start: '',
      end: '',
      status: 'Connection unavailable',
      responseDeadline: '',
      finalConfirmation: '',
      targetGross: null,
      targetTrips: null,
      estimatedHelperPay: null,
      plannedHours: null,
      quest: 'Unavailable'
    },
    recentShift: null,
    latestPayment: null,
    currentlyOwed: null,
    outstandingSyncError: true,
    earningsSyncError: true,
    shiftSyncError: true,
    upcomingShifts: [],
    weeklyRows: [],
    currentWeek: {
      weekStart: null,
      weekEnd: null,
      shiftCount: null,
      hours: null,
      earned: null,
      paid: null,
      outstanding: null,
      caption: 'Live weekly data unavailable'
    },
    trendDemand: {
      title: 'Live data unavailable',
      summary: 'Connect the Notion data sources to display current information.',
      imageData: '',
      updatedAt: ''
    },
    syncTestActive: false,
    tripBoost: null,
    sync: { source: 'notion', syncedAt: null }
  };
}

function mapShiftPage(page) {
  const props = page?.properties || {};
  const date = propDate(props, 'Date');
  const windowText = propText(props, 'Window');
  return {
    date,
    day: date ? weekdayDate(date) : '',
    title: propTitle(props, 'Shift'),
    location: propText(props, 'Location'),
    window: windowText,
    status: propSelect(props, 'Status'),
    crew: propSelect(props, 'Crew'),
    targetGross: propNumber(props, 'Target Gross'),
    targetTrips: propNumber(props, 'Trip Target'),
    estimatedHelperPay: propNumber(props, 'Helper Pay'),
    quest: propCheckbox(props, 'Quest'),
    completed: propCheckbox(props, 'Completed')
  };
}

function isUpcomingHelperShift(shift, today) {
  return Boolean(shift.date) &&
    shift.date >= today &&
    !shift.completed &&
    (shift.status === 'Confirmed' || shift.status === 'Live') &&
    (!shift.crew || shift.crew === 'With helper');
}

function sortShifts(shifts) {
  const priority = { Live: 0, Confirmed: 1 };
  return shifts.slice().sort((a, b) =>
    a.date.localeCompare(b.date) ||
    (priority[a.status] ?? 9) - (priority[b.status] ?? 9)
  );
}

function makeLiveNextShift(pages, today) {
  const upcoming = sortShifts(
    (pages || []).map(mapShiftPage).filter(shift => isUpcomingHelperShift(shift, today))
  );
  const shift = upcoming[0];
  if (!shift) return emptyNextShift();
  const times = clockWindow(shift.window || shift.title);
  return {
    date: shift.date,
    day: shift.day,
    location: shift.location || shift.title,
    start: times.start,
    end: times.end,
    status: shift.status,
    responseDeadline: '',
    finalConfirmation: '',
    targetGross: shift.targetGross,
    targetTrips: shift.targetTrips,
    estimatedHelperPay: shift.estimatedHelperPay,
    plannedHours: hoursFromWindow(shift.window),
    quest: shift.quest ? 'Confirmed' : 'Not currently confirmed'
  };
}

function makeLiveUpcomingShifts(pages, today) {
  return sortShifts(
    (pages || []).map(mapShiftPage).filter(shift => isUpcomingHelperShift(shift, today))
  ).slice(0, 10);
}

function mapEarningsPage(page) {
  const props = page?.properties || {};
  return {
    id: page?.id || null,
    day: propTitle(props, 'Day'),
    date: propDate(props, 'Date'),
    paidDate: propDate(props, 'Date paid'),
    gross: propNumber(props, 'Gross (£)'),
    miles: propNumber(props, 'Miles'),
    trips: propNumber(props, 'Trips/deliveries'),
    withHelper: propCheckbox(props, 'With helper'),
    helperPaid: propNumber(props, 'Helper paid (£)'),
    helperOutstanding: propNumber(props, 'Helper outstanding (£)'),
    helperBoost: propNumber(props, 'Helper boost (£)'),
    helperPayout: propNumber(props, 'Helper payout (£)'),
    helperAdjustment: propNumber(props, 'Helper adjustment (£)'),
    paymentRef: propNumber(props, 'Payment ref'),
    helperHours: propNumber(props, 'Helper hours'),
    notes: propText(props, 'Notes'),
    shiftTime: propText(props, 'Shift time'),
    shiftDuration: propText(props, 'Shift duration')
  };
}

function paymentLabel(day) {
  const label = String(day || '')
    .replace(/\s+[—–-]\s+.*$/, '')
    .trim();
  return label || 'Payment entry';
}

function paymentDetail(row) {
  const time = String(row.shiftTime || extractTime(row.notes) || '').trim();
  const amount = roundMoney(row.helperPaid).toFixed(2);
  return time ? `${time} · £${amount}` : `£${amount}`;
}

function splitTimes(row) {
  const time = String(row.shiftTime || extractTime(row.notes) || '').trim();
  const parts = time.split(/\s*[–-]\s*/);
  return {
    start: (parts[0] || '').trim(),
    end: (parts[1] || '').trim()
  };
}

function makeLatestPayment(rows) {
  const paidRows = rows.filter(row =>
    row.withHelper && row.paidDate && (row.helperPaid || 0) > 0
  );
  if (!paidRows.length) {
    return { amount: null, reference: '', date: '', breakdown: [] };
  }
  const latestDate = paidRows.map(row => row.paidDate).sort().at(-1);
  const latestDayRows = paidRows.filter(row => row.paidDate === latestDate);
  const refs = latestDayRows
    .map(row => row.paymentRef)
    .filter(value => value !== null && value !== undefined);
  const latestRef = refs.length
    ? refs.slice().sort((a, b) => Number(a) - Number(b)).at(-1)
    : null;
  const paymentRows = (latestRef === null
    ? latestDayRows
    : latestDayRows.filter(row => String(row.paymentRef) === String(latestRef))
  ).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const amount = paymentRows.reduce((sum, row) => sum + (row.helperPaid || 0), 0);
  return {
    amount: roundMoney(amount),
    reference: latestRef === null ? 'Not recorded' : String(latestRef),
    date: displayDate(latestDate),
    breakdown: paymentRows.map(row => ({
      label: paymentLabel(row.day),
      detail: paymentDetail(row)
    }))
  };
}

function makeRecentShift(rows) {
  const recent = rows
    .filter(row => row.withHelper && row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!recent) {
    return {
      date: '',
      day: 'No completed helper shift recorded',
      location: '',
      start: '',
      end: '',
      gross: null,
      trips: null,
      helperTime: '',
      helperPay: null,
      helperBoost: null,
      tripBoost: null
    };
  }
  const times = splitTimes(recent);
  return {
    date: recent.date,
    day: weekdayDate(recent.date),
    location: /Exmouth/i.test(`${recent.notes} ${recent.day}`) ? 'Exmouth' : '',
    start: times.start,
    end: times.end,
    gross: recent.gross,
    trips: recent.trips,
    helperTime: recent.shiftDuration || (recent.helperHours != null ? durationText(recent.helperHours) : ''),
    // The completed-shift card shows earned helper pay before separate adjustments
    // (for example, the £5 mobile deduction). Keep payout/outstanding calculations unchanged.
    helperPay: recent.helperPayout == null ? null : roundMoney(recent.helperPayout - (recent.helperAdjustment || 0)),
    // Original Earnings Log rule: Helper boost (£) is the trip boost.
    // Missing boost data stays null; a recorded zero remains £0. It is not added to helper pay.
    helperBoost: recent.helperBoost == null ? null : roundMoney(recent.helperBoost),
    tripBoost: recent.helperBoost == null ? null : roundMoney(recent.helperBoost)
  };
}

function ukISODate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function currentWeekRange(now) {
  const [year, month, day] = ukISODate(now).split('-').map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const weekday = today.getUTCDay();
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const iso = date => date.toISOString().slice(0, 10);
  return { weekStart: iso(monday), weekEnd: iso(sunday) };
}

function makeCurrentWeek(rows, now) {
  const { weekStart, weekEnd } = currentWeekRange(now);
  const weekRows = rows.filter(row =>
    row.withHelper &&
    row.date &&
    row.date >= weekStart &&
    row.date <= weekEnd &&
    ((row.gross || 0) > 0 || (row.trips || 0) > 0 || (row.helperHours || 0) > 0)
  );
  const earned = weekRows.reduce((sum, row) => sum + (row.helperPayout || 0), 0);
  const paid = rows
    .filter(row => row.withHelper && row.paidDate && row.paidDate >= weekStart && row.paidDate <= weekEnd)
    .reduce((sum, row) => sum + (row.helperPaid || 0), 0);
  const outstanding = weekRows.reduce((sum, row) => sum + (
    row.helperOutstanding ?? Math.max(0, (row.helperPayout || 0) - (row.helperPaid || 0))
  ), 0);
  // Use recorded decimal helper hours where present; otherwise derive duration from the logged shift-time range.
  // This prevents the weekly total undercounting shifts whose Helper hours property was left blank.
  const hours = weekRows.reduce((sum, row) => {
    if (row.helperHours !== null && row.helperHours !== undefined && Number.isFinite(Number(row.helperHours))) {
      return sum + Number(row.helperHours);
    }
    const timeText = String(row.shiftTime || extractTime(row.notes) || '').trim();
    const parts = timeText.split(/\s*[–-]\s*/);
    if (parts.length !== 2) return sum;
    const toMinutes = value => {
      const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const start = toMinutes(parts[0]);
    const end = toMinutes(parts[1]);
    if (start === null || end === null) return sum;
    const duration = end >= start ? end - start : (24 * 60 - start + end);
    return sum + duration / 60;
  }, 0);
  const shiftCount = weekRows.length;
  const caption = `${displayDate(weekStart)}–${displayDate(weekEnd)} · ${shiftCount} helper shift${shiftCount === 1 ? '' : 's'} · £${earned.toFixed(2)} earned · £${paid.toFixed(2)} paid this week · £${outstanding.toFixed(2)} outstanding on these shifts`;
  return {
    weekStart,
    weekEnd,
    shiftCount,
    hours: roundMoney(hours),
    earned: roundMoney(earned),
    paid: roundMoney(paid),
    outstanding: roundMoney(outstanding),
    caption
  };
}

export function buildDashboardData({
  earningsPages = [],
  shiftPages = [],
  outstandingValue = null,
  outstandingError = false,
  shiftError = false,
  earningsError = false,
  syncTestActive = false,
  now = new Date()
} = {}) {
  if (earningsError) return unavailablePayload(now);
  const rows = (earningsPages || []).map(mapEarningsPage);
  const today = ukISODate(now);
  const recentShift = makeRecentShift(rows);
  const outstandingKnown = !outstandingError && outstandingValue !== null && outstandingValue !== undefined;
  const currentlyOwed = outstandingKnown ? roundMoney(outstandingValue) : null;
  return {
    version: 2,
    updatedAt: now.toISOString(),
    nextShift: shiftError ? shiftUnavailable() : makeLiveNextShift(shiftPages, today),
    recentShift,
    latestPayment: makeLatestPayment(rows),
    currentlyOwed,
    outstandingSyncError: !outstandingKnown,
    currentWeek: makeCurrentWeek(rows, now),
    weeklyRows: rows.filter(row => row.withHelper && row.date).map(row => ({
      id: row.id,
      date: row.date,
      paidDate: row.paidDate,
      gross: row.gross,
      miles: row.miles,
      trips: row.trips,
      helperPaid: row.helperPaid,
      helperOutstanding: row.helperOutstanding,
      helperBoost: row.helperBoost,
      helperPayout: row.helperPayout,
      helperHours: row.helperHours,
      shiftTime: row.shiftTime || extractTime(row.notes),
      withHelper: row.withHelper
    })),
    upcomingShifts: shiftError ? [] : makeLiveUpcomingShifts(shiftPages, today),
    shiftSyncError: Boolean(shiftError),
    earningsSyncError: false,
    syncTestActive: Boolean(syncTestActive),
    tripBoost: recentShift?.tripBoost ?? null,
    trendDemand: TREND_DEMAND,
    sync: { source: 'notion', syncedAt: now.toISOString() }
  };
}

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2025-09-03',
    'Content-Type': 'application/json'
  };
}

async function notionRequest(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      ...notionHeaders(),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion API ${response.status}: ${body.slice(0, 180)}`);
  }
  return response.json();
}

async function queryDataSource(dataSourceId, sort, fetchImpl) {
  const load = async sortProperty => {
    const results = [];
    let cursor = null;
    do {
      const data = await notionRequest(
        `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
        {
          method: 'POST',
          body: JSON.stringify({
            page_size: 100,
            ...(sortProperty ? { sorts: [{ property: sortProperty, direction: 'descending' }] } : {}),
            ...(cursor ? { start_cursor: cursor } : {})
          })
        },
        fetchImpl
      );
      results.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);
    return results;
  };
  try {
    return await load(sort || null);
  } catch (error) {
    if (sort && /Notion API 400/.test(error?.message || '')) {
      console.error('Notion query sort failed; retrying unsorted', error.message);
      return load(null);
    }
    throw error;
  }
}

async function getPageBlocks(pageId, fetchImpl) {
  const results = [];
  let cursor = null;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const data = await notionRequest(url.toString(), {}, fetchImpl);
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

async function getSyncTestActive(fetchImpl) {
  try {
    const blocks = await getPageBlocks(NOTION_DASHBOARD_PAGE_ID, fetchImpl);
    const callout = blocks.find(block =>
      block.type === 'callout' &&
      /SYNC TEST DATA/i.test(richTextPlain(block.callout?.rich_text))
    );
    return Boolean(callout);
  } catch (error) {
    console.error('Sync-test callout read failed', error?.message || error);
    return false;
  }
}

async function readHelperSummaryOutstanding(fetchImpl) {
  try {
    const page = await notionRequest(
      `https://api.notion.com/v1/pages/${NOTION_HELPER_SUMMARY_PAGE_ID}`,
      {},
      fetchImpl
    );
    const value = readOutstandingValue(page.properties || {});
    if (value !== null) return { outstandingValue: value, outstandingError: false };
    console.error('Helper Pay Summary page did not contain a readable outstanding rollup');
  } catch (error) {
    console.error('Helper Pay Summary page read failed', error?.message || error);
  }

  try {
    const pages = await queryDataSource(NOTION_OUTSTANDING_DATA_SOURCE_ID, null, fetchImpl);
    const match = pages.find(page => /current helper outstanding/i.test(pageTitle(page)));
    const chosen = match || (pages.length === 1 ? pages[0] : null);
    if (!chosen) {
      console.error('Helper Pay Summary rollup row was not found');
      return { outstandingValue: null, outstandingError: true };
    }
    const value = readOutstandingValue(chosen.properties || {});
    if (value === null) {
      console.error('Helper Pay Summary rollup value was missing');
      return { outstandingValue: null, outstandingError: true };
    }
    return { outstandingValue: value, outstandingError: false };
  } catch (error) {
    console.error('Helper Pay Summary rollup query failed', error?.message || error);
    return { outstandingValue: null, outstandingError: true };
  }
}

async function persistDashboard(payload) {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore(STORE_NAME, { consistency: 'strong' });
    if (typeof store.setJSON === 'function') await store.setJSON(KEY, payload);
    else await store.set(KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Dashboard blob persist skipped', error?.message || error);
  }
}

export async function loadLiveDashboard(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || new Date();
  try {
    const [earningsResult, shiftResult, outstandingResult, syncTestActive] = await Promise.all([
      queryDataSource(NOTION_EARNINGS_ID, 'Date', fetchImpl)
        .then(pages => ({ pages, error: false }))
        .catch(error => {
          console.error('Earnings Log sync failed', error?.message || error);
          return { pages: [], error: true };
        }),
      queryDataSource(NOTION_SHIFTS_ID, 'Date', fetchImpl)
        .then(pages => ({ pages, error: false }))
        .catch(error => {
          console.error('Work Planner sync failed', error?.message || error);
          return { pages: [], error: true };
        }),
      readHelperSummaryOutstanding(fetchImpl),
      getSyncTestActive(fetchImpl)
    ]);

    const payload = buildDashboardData({
      earningsPages: earningsResult.pages,
      shiftPages: shiftResult.pages,
      outstandingValue: outstandingResult.outstandingValue,
      outstandingError: outstandingResult.outstandingError,
      shiftError: shiftResult.error,
      earningsError: earningsResult.error,
      syncTestActive,
      now
    });

    if (!payload.dataUnavailable && !options.skipPersist) await persistDashboard(payload);
    return payload;
  } catch (error) {
    console.error('Notion dashboard sync failed', error?.message || error);
    return unavailablePayload(now);
  }
}

export default async function dashboardData(req) {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  return Response.json(await loadLiveDashboard(), {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  });
}

export const config = {
  path: '/api/dashboard-data',
  method: ['GET']
};

export const __test = {
  propNumber,
  readOutstandingValue,
  rollupNumber,
  emptyNextShift
};
