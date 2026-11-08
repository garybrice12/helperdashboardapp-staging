import { requireStaffSession, authFailure } from './session-auth.mjs';
// Helper dashboard payload for /api/dashboard-data.
// The existing outstanding total continues to prefer the Helper Pay Summary rollup.
// Payment status and draft payment allocations are derived from Earnings Log rows.
// A failed or missing data source must not be represented as a confirmed £0 balance.

const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';

const NOTION_EARNINGS_ID =
  process.env.NOTION_EARNINGS_DATA_SOURCE_ID ||
  '46678020-e282-4699-96bc-c4db27d3af56';

const NOTION_SHIFTS_ID =
  process.env.NOTION_SHIFTS_DATA_SOURCE_ID ||
  process.env.NOTION_WORK_PLANNER_DATA_SOURCE_ID ||
  '5f05970c-fcc0-497b-aa62-3e8edefbbb2b';
const NOTION_COMPLETED_SHIFTS_ID =
  process.env.NOTION_COMPLETED_SHIFTS_DATA_SOURCE_ID ||
  'e2427666-dc40-4cdd-be84-49bd51826862';
const NOTION_STAFF_PROFILES_ID =
  process.env.NOTION_STAFF_PROFILES_DATA_SOURCE_ID ||
  'f9c437cb-bf7e-430d-ba44-a16038607edb';

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
    location: 'No upcoming helper shift',
    start: '',
    end: '',
    status: 'No upcoming helper shift',
    responseDeadline: '',
    finalConfirmation: '',
    targetGross: null,
    targetTrips: null,
    estimatedHelperPay: null,
    plannedHours: null,
    quest: 'No upcoming Quest shift'
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
    yourEarnings: { weekTotal: null, monthTotal: null, weekShiftCount: null, monthShiftCount: null, breakdown: [], available: false },
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

function mapShiftPage(page, staffById = new Map()) {
  const props = page?.properties || {};
  const date = propDate(props, 'Date');
  const windowText = propText(props, 'Window');
  const staffProfileIds = Array.isArray(props['Staff Profile']?.relation) ? props['Staff Profile'].relation.map(item => item.id) : [];
  return {
    id: page?.id || '',
    date,
    day: date ? weekdayDate(date) : '',
    title: propTitle(props, 'Shift'),
    location: propText(props, 'Location'),
    window: windowText,
    status: propSelect(props, 'Status'),
    crew: propSelect(props, 'Crew'),
    staffProfileIds,
    assignedCrew: staffProfileIds.map(id => staffById.get(id)).filter(Boolean),
    targetGross: propNumber(props, 'Target Gross'),
    questBonus: propNumber(props, 'Quest Bonus (£)'),
    targetTrips: propNumber(props, 'Trip Target'),
    estimatedHelperPay: propNumber(props, 'Helper Pay'),
    quest: propCheckbox(props, 'Quest'),
    completed: propCheckbox(props, 'Completed')
  };
}

function mapStaffPage(page) {
  const props = page?.properties || {};
  return { id: page?.id || '', name: propTitle(props, 'Name') || propText(props, 'Name'), active: propSelect(props, 'Staff Status') === 'Active' && !propCheckbox(props, 'Access Suspended') };
}

function mapCompletedShiftPage(page) {
  const props = page?.properties || {};
  return {
    id: page?.id || '',
    date: propDate(props, 'Date'),
    window: propText(props, 'Window'),
    location: propText(props, 'Location'),
    crewMemberIds: Array.isArray(props['Crew members']?.relation) ? props['Crew members'].relation.map(item => item.id) : [],
    title: propTitle(props, 'Shift')
  };
}

function clockMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > (match[3] ? 12 : 23) || hour < (match[3] ? 1 : 0)) return null;
  if (match[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (match[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function interval(value) {
  const parts = String(value || '').split(/\s*[–-]\s*/);
  if (parts.length !== 2) return null;
  const start = clockMinutes(parts[0]), end = clockMinutes(parts[1]);
  if (start === null || end === null) return null;
  return { start, end: end < start ? end + 1440 : end };
}

function attachActualCrew(earningsRows, completedPages) {
  const mapped = (completedPages || []).map(mapCompletedShiftPage).filter(x => x.date && x.crewMemberIds.length);
  const unique = new Map();
  for (const shift of mapped) {
    const key = [shift.date, shift.window, shift.location, [...shift.crewMemberIds].sort().join(',')].join('|');
    if (!unique.has(key)) unique.set(key, shift);
  }
  return earningsRows.map(row => {
    const candidates = [...unique.values()].filter(shift => {
      if (shift.date !== row.date) return false;
      const a = interval(row.shiftTime), b = interval(shift.window);
      if (a && b) return a.start < b.end && b.start < a.end;
      return !a && !b;
    });
    // Fail closed when a same-day/multi-shift match is ambiguous. Planned Staff Profile
    // is not evidence of attendance; only the completed shift's Crew members relation is.
    const crewIds = candidates.length === 1 ? candidates[0].crewMemberIds : [];
    return { ...row, actualCrewProfileIds: crewIds, completedShiftMatchCount: candidates.length };
  });
}

function payoutForStaff(row, staffProfileId) {
  if (row.withHelper && row.staffProfileIds.includes(staffProfileId)) return helperEntitlement(row) || 0;
  return Number(row.yourPayout || 0);
}

function isUpcomingHelperShift(shift, today) {
  return Boolean(shift.date) &&
    shift.date >= today &&
    !shift.completed &&
    shift.status !== 'Completed' &&
    (!shift.crew || shift.crew === 'With helper');
}

function plannedShiftStartMinutes(shift) {
  const raw = String(shift.window || shift.title || '').match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!raw) return Number.MAX_SAFE_INTEGER;
  let hour = Number(raw[1]);
  const minute = Number(raw[2]);
  if (raw[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (raw[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function sortShifts(shifts) {
  return shifts.slice().sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    plannedShiftStartMinutes(a) - plannedShiftStartMinutes(b) ||
    String(a.title || '').localeCompare(String(b.title || ''))
  );
}

function makeLiveNextShift(pages, today, staffById = new Map()) {
  const upcoming = sortShifts(
    (pages || []).map(page => mapShiftPage(page, staffById)).filter(shift => isUpcomingHelperShift(shift, today))
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
    questBonus: shift.questBonus,
    targetTrips: shift.targetTrips,
    estimatedHelperPay: shift.estimatedHelperPay,
    plannedHours: hoursFromWindow(shift.window),
    quest: shift.quest ? 'Confirmed' : 'Not currently confirmed',
    assignedCrew: shift.assignedCrew
  };
}

function makeLiveUpcomingShifts(pages, today, staffById = new Map()) {
  return sortShifts(
    (pages || []).map(page => mapShiftPage(page, staffById)).filter(shift => isUpcomingHelperShift(shift, today))
  ).slice(0, 10);
}

function mapEarningsPage(page) {
  const props = page?.properties || {};
  return {
    pageId: page.id,
    staffProfileIds: Array.isArray(props['Staff Profile']?.relation) ? props['Staff Profile'].relation.map(item => item.id) : [],
    day: propTitle(props, 'Day'),
    date: propDate(props, 'Date'),
    paidDate: propDate(props, 'Date paid'),
    gross: propNumber(props, 'Gross (£)'),
    dayType: propSelect(props, 'Day type 1'),
    yourPayout: propNumber(props, 'Your payout (£)'),
    miles: propNumber(props, 'Miles'),
    trips: propNumber(props, 'Trips/deliveries'),
    withHelper: propCheckbox(props, 'With helper'),
    settledByConfirmation: propCheckbox(props, 'Settled by confirmation'),
    helperPaid: propNumber(props, 'Helper paid (£)'),
    amountStillUnallocated: propNumber(props, 'Amount still unallocated (£)'),
    helperOutstanding: propCheckbox(props, 'Settled by confirmation') ? 0 : propNumber(props, 'Helper outstanding (£)'),
    helperBoost: propNumber(props, 'Helper boost (£)'),
    helperPayout: propNumber(props, 'Helper payout (£)'),
    helperAdjustment: propNumber(props, 'Helper adjustment (£)'),
    paymentRef: propNumber(props, 'Payment ref'),
    paymentAllocationHistory: parseAllocationHistory(propText(props, 'Payment allocation history')) ,
    helperHours: propNumber(props, 'Helper hours'),
    notes: propText(props, 'Notes'),
    shiftTime: propText(props, 'Shift time'),
    shiftDuration: propText(props, 'Shift duration')
  };
}

function parseAllocationHistory(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => item && item.reference != null && Number(item.amount) > 0) : [];
  } catch { return []; }
}

function allocationsForRow(row) {
  if (Array.isArray(row.paymentAllocationHistory) && row.paymentAllocationHistory.length) {
    return row.paymentAllocationHistory.map(item => ({
      reference: String(item.reference), date: dateOnly(item.date) || row.paidDate || '',
      amount: roundMoney(Number(item.amount) || 0)
    })).filter(item => item.amount > 0);
  }
  // Backward-compatible legacy data: old rows only stored the latest ref/date and cumulative paid amount.
  if ((row.helperPaid || 0) > 0) return [{
    reference: row.paymentRef == null ? 'Not recorded' : String(row.paymentRef),
    date: row.paidDate || '', amount: roundMoney(row.helperPaid)
  }];
  return [];
}

function paymentLabel(day) {
  const label = String(day || '')
    .replace(/\s+[—–-]\s+.*$/, '')
    .trim();
  return label || 'Payment entry';
}

function paymentDetail(row) {
  const time = String(row.shiftTime || '').trim();
  const amount = roundMoney(row.helperPaid).toFixed(2);
  return time ? `${time} · £${amount}` : `£${amount}`;
}

function splitTimes(row) {
  const time = String(row.shiftTime || '').trim();
  const parts = time.split(/\s*[–-]\s*/);
  return {
    start: (parts[0] || '').trim(),
    end: (parts[1] || '').trim()
  };
}

function shiftStartMinutes(row) {
  const start = splitTimes(row).start;
  const match = String(start || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = (match[3] || '').toLowerCase();
  if (minute > 59 || hour > (suffix ? 12 : 23) || hour < (suffix ? 1 : 0)) return null;
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function makeLatestPayment(rows, now = new Date()) {
  const groups = new Map();
  for (const row of rows.filter(row => row.withHelper)) {
    for (const allocation of allocationsForRow(row)) {
      const reference = String(allocation.reference || 'Not recorded');
      const date = allocation.date || row.paidDate || '';
      const key = `${date}|${reference}`;
      if (!groups.has(key)) groups.set(key, { date, reference, rows: [], amount: 0 });
      const group = groups.get(key);
      group.rows.push({ ...row, allocationAmount: allocation.amount });
      group.amount += allocation.amount;
    }
  }
  const ordered = [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || (Number(b.reference) || 0) - (Number(a.reference) || 0));
  const latest = ordered[0], previous = ordered[1];
  if (!latest) return { amount: null, reference: '', date: '', breakdown: [], previousPayment: null };
  const paymentRows = latest.rows.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  return {
    amount: roundMoney(latest.amount), reference: latest.reference, date: displayDate(latest.date),
    breakdown: paymentRows.map(row => ({ label: `${displayDate(row.date)}${row.day ? ` · ${paymentLabel(row.day)}` : ''}`, detail: `${row.shiftTime ? `${row.shiftTime} · ` : ''}£${roundMoney(row.allocationAmount).toFixed(2)}` })),
    previousPayment: previous ? { amount: roundMoney(previous.amount), reference: previous.reference, date: displayDate(previous.date) } : null
  };
}

function makeRecentShift(rows, staffProfileId) {
  const recent = rows
    .filter(row => row.date)
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
      fuelCost: null,
      vehicleInsuranceCost: null,
      netAfterVehicleCosts: null,
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
    fuelCost: recent.miles == null ? null : roundMoney(Number(recent.miles) * 0.30),
    vehicleInsuranceCost: recent.miles == null ? null : roundMoney(Number(recent.miles) * 0.01),
    netAfterVehicleCosts: recent.gross == null || recent.miles == null ? null : roundMoney(Number(recent.gross) - (Number(recent.miles) * 0.30) - (Number(recent.miles) * 0.01)),
    helperTime: recent.withHelper && recent.staffProfileIds.includes(staffProfileId) && recent.helperHours != null
      ? durationText(recent.helperHours)
      : recent.shiftDuration || (recent.helperHours != null ? durationText(recent.helperHours) : ''),
    // Show the final helper entitlement, applying the signed adjustment exactly as stored.
    // Negative adjustments reduce payout; positive adjustments increase it.
    helperPay: recent.helperPayout == null ? null : roundMoney(recent.helperPayout + (recent.helperAdjustment || 0)),
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

function helperEntitlement(row) {
  // One canonical helper-pay calculation for recent shift, weekly totals and payment breakdowns.
  if (row.helperPayout == null) return null;
  return roundMoney(Number(row.helperPayout) + Number(row.helperAdjustment || 0));
}

function weekRowHours(row, staffProfileId) {
  if (row.withHelper && row.staffProfileIds.includes(staffProfileId) && row.helperHours !== null && row.helperHours !== undefined && Number.isFinite(Number(row.helperHours))) {
    return Number(row.helperHours);
  }
  const durationText = String(row.shiftDuration || '').trim();
  const durationMatch = durationText.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?(?:\s*(\d+)\s*m(?:in(?:utes?)?)?)?$/i);
  if (durationMatch && (durationMatch[1] || durationMatch[2])) {
    return Number(durationMatch[1] || 0) + Number(durationMatch[2] || 0) / 60;
  }
  const timeText = String(row.shiftTime || '').trim();
  const parts = timeText.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return 0;
  const toMinutes = value => {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = toMinutes(parts[0]);
  const end = toMinutes(parts[1]);
  if (start === null || end === null) return 0;
  const duration = end >= start ? end - start : (24 * 60 - start + end);
  return duration / 60;
}

function makeCurrentWeek(rows, now, staffProfileId) {
  const { weekStart, weekEnd } = currentWeekRange(now);
  const weekRows = rows.filter(row =>
    row.date &&
    row.date >= weekStart &&
    row.date <= weekEnd &&
    ((row.gross || 0) > 0 || (row.trips || 0) > 0 || (row.helperHours || 0) > 0 || Boolean(row.shiftDuration || row.shiftTime))
  );
  const helperRows = weekRows.filter(row => row.withHelper);
  const soloRows = weekRows.filter(row => !row.withHelper);
  // Personal earnings are based on actual completed-shift Crew members. A helper
  // sees their helper entitlement; the owner/driver sees the retained payout.
  const earned = weekRows.reduce((sum, row) => sum + payoutForStaff(row, staffProfileId), 0);
  const paid = rows
    .filter(row => row.withHelper && row.paidDate && row.paidDate >= weekStart && row.paidDate <= weekEnd)
    .reduce((sum, row) => sum + (row.helperPaid || 0), 0);
  const outstanding = helperRows.reduce((sum, row) => sum + (
    row.helperOutstanding ?? Math.max(0, (helperEntitlement(row) || 0) - (row.helperPaid || 0))
  ), 0);
  const hours = weekRows.reduce((sum, row) => sum + weekRowHours(row, staffProfileId), 0);
  const allAllocations = rows.filter(row => row.withHelper).flatMap(row => allocationsForRow(row).map(item => ({...item, pageId:row.pageId})));
  allAllocations.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')) || (Number(b.reference)||0)-(Number(a.reference)||0));
  const latestAllocationKey = allAllocations.length ? `${allAllocations[0].date}|${allAllocations[0].reference}` : '';
  const shiftCount = weekRows.length;
  const soloCount = soloRows.length;
  const helperCount = helperRows.length;
  const caption = `${displayDate(weekStart)}–${displayDate(weekEnd)} · ${shiftCount} shift${shiftCount === 1 ? '' : 's'} (${soloCount} solo, ${helperCount} helper) · £${earned.toFixed(2)} earned · £${paid.toFixed(2)} helper payments this week · £${outstanding.toFixed(2)} outstanding on helper shifts`;
  return {
    weekStart,
    weekEnd,
    shiftCount,
    soloShiftCount: soloCount,
    helperShiftCount: helperCount,
    hours: roundMoney(hours),
    earned: roundMoney(earned),
    paid: roundMoney(paid),
    outstanding: roundMoney(outstanding),
    shiftBreakdown: weekRows.slice().sort((a, b) => {
      const dateOrder = String(a.date).localeCompare(String(b.date));
      if (dateOrder) return dateOrder;
      const aStart = shiftStartMinutes(a);
      const bStart = shiftStartMinutes(b);
      if (aStart === null && bStart === null) return 0;
      if (aStart === null) return 1;
      if (bStart === null) return -1;
      return aStart - bStart;
    }).map(row => {
      const owed = roundMoney(payoutForStaff(row, staffProfileId));
      const rowAllocations = row.withHelper ? allocationsForRow(row) : [];
      const paidAmount = roundMoney(rowAllocations.reduce((sum,item)=>sum+item.amount,0));
      const remaining = row.withHelper ? (row.settledByConfirmation ? 0 : roundMoney(Math.max(0,owed-paidAmount))) : 0;
      const status = !row.withHelper ? 'Solo shift' : row.settledByConfirmation || (remaining <= 0.005 && paidAmount > 0) ? 'Paid' : paidAmount > 0 ? 'Partially paid' : 'Not paid';
      const latestPaymentAmount = roundMoney(rowAllocations.filter(item=>`${item.date}|${item.reference}`===latestAllocationKey).reduce((sum,item)=>sum+item.amount,0));
      return {
        label: `${displayDate(row.date)}${row.day ? ` · ${paymentLabel(row.day)}` : ''}${String(row.shiftTime || '').trim() ? ` · ${String(row.shiftTime || '').trim()}` : ''}`,
        amount: owed,
        paid: paidAmount,
        remaining,
        status,
        date: row.date,
        dayType: row.withHelper ? 'Helper' : 'Solo',
        gross: row.gross == null ? null : roundMoney(row.gross),
        retained: roundMoney(payoutForStaff(row, staffProfileId)),
        miles: row.miles == null ? null : Number(row.miles),
        fuelCost: row.miles == null ? null : roundMoney(Number(row.miles) * 0.30),
        vehicleInsuranceCost: row.miles == null ? null : roundMoney(Number(row.miles) * 0.01),
        helperPayout: row.withHelper ? (helperEntitlement(row) == null ? null : helperEntitlement(row)) : 0,
        helperPaid: paidAmount,
        hours: roundMoney(weekRowHours(row, staffProfileId)),
        trips: row.trips == null ? null : Number(row.trips),
        latestPaymentAmount: latestAllocationKey === '' ? null : latestPaymentAmount
      };
    }),
    caption
  };
}

function makeYourEarnings(rows, now, staffProfileId) {
  const { weekStart, weekEnd } = currentWeekRange(now);
  const today = ukISODate(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const valid = rows.filter(row => row.date && row.yourPayout !== null && row.yourPayout !== undefined);
  const weekRows = valid.filter(row => row.date >= weekStart && row.date <= weekEnd);
  const monthRows = valid.filter(row => row.date >= monthStart && row.date <= today);
  const sum = list => roundMoney(list.reduce((total, row) => total + payoutForStaff(row, staffProfileId), 0));
  return {
    weekStart, weekEnd, monthStart,
    weekTotal: sum(weekRows),
    monthTotal: sum(monthRows),
    weekShiftCount: weekRows.length,
    monthShiftCount: monthRows.length,
    breakdown: valid.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 12).map(row => ({
      date: row.date,
      label: `${displayDate(row.date)} · ${row.day || 'Shift'}`,
      dayType: row.dayType || (row.withHelper ? 'Helper' : 'Solo'),
      gross: row.gross,
      payout: roundMoney(payoutForStaff(row, staffProfileId))
    })),
    available: valid.length > 0
  };
}

export function buildDashboardData({
  earningsPages = [],
  shiftPages = [],
  completedPages = [],
  staffPages = [],
  outstandingValue = null,
  outstandingError = false,
  shiftError = false,
  earningsError = false,
  completedError = false,
  staffProfileId = null,
  isAdmin = false,
  syncTestActive = false,
  now = new Date()
} = {}) {
  if (earningsError || completedError) return unavailablePayload(now);
  const rows = attachActualCrew((earningsPages || []).map(mapEarningsPage), completedPages);
  const today = ukISODate(now);
  const staffDirectory = (staffPages || []).map(mapStaffPage).filter(x => x.id);
  const staffById = new Map(staffDirectory.map(x => [x.id, x.name]));
  // All dashboard totals are personal: a shift counts only when the authenticated
  // profile appears in the completed shift's actual Crew members relation.
  const personalRows = staffProfileId ? rows.filter(row => row.actualCrewProfileIds.includes(staffProfileId)) : [];
  const ledgerRows = personalRows;
  const earningsRows = personalRows;
  const recentShift = makeRecentShift(personalRows, staffProfileId);
  const outstandingKnown = !outstandingError && outstandingValue !== null && outstandingValue !== undefined;
  // Prefer the live Helper Pay Summary rollup. If it is unavailable, derive the
  // total from the same Earnings Log rows used by Current-week progress rather
  // than showing a blank or a misleading £0.00.
  const earningsOutstandingKnown = ledgerRows.some(row =>
    row.withHelper && row.date && (
      row.helperOutstanding !== null && row.helperOutstanding !== undefined ||
      row.helperPayout !== null && row.helperPayout !== undefined ||
      row.helperPaid !== null && row.helperPaid !== undefined
    )
  );
  const earningsOutstanding = ledgerRows.reduce((sum, row) => {
    if (!row.withHelper || !row.date) return sum;
    const balance = row.helperOutstanding ?? Math.max(0, (helperEntitlement(row) || 0) - (row.helperPaid || 0));
    return sum + Math.max(0, Number(balance) || 0);
  }, 0);
  // A manually confirmed settlement is authoritative for old shifts. Prefer the live row-derived balance over a potentially stale summary rollup whenever any such confirmation exists.
  const hasSettlementConfirmations = ledgerRows.some(row => row.withHelper && row.settledByConfirmation);
  const unallocatedAmount = roundMoney(ledgerRows.reduce((sum, row) => sum + Math.max(0, Number(row.amountStillUnallocated) || 0), 0));
  const rawCurrentlyOwed = earningsOutstandingKnown ? roundMoney(earningsOutstanding) : (personalRows.length ? 0 : null);
  // Amount still unallocated is a payment-level amount: subtract it once from
  // the overall unpaid balance, never once per shift.
  const currentlyOwed = rawCurrentlyOwed === null ? null : roundMoney(Math.max(0, rawCurrentlyOwed - unallocatedAmount));
  // The next payment reference is the next sequential reference after the
  // highest numeric reference already allocated in the Earnings Log.
  const numericPaymentReferences = rows
    .flatMap(row => allocationsForRow(row).map(allocation => Number(allocation.reference)))
    .filter(reference => Number.isSafeInteger(reference) && reference > 0);
  const nextPaymentReference = numericPaymentReferences.length
    ? Math.max(...numericPaymentReferences) + 1
    : null;
  return {
    version: 2,
    updatedAt: now.toISOString(),
    nextShift: shiftError ? shiftUnavailable() : makeLiveNextShift(shiftPages, today, staffById),
    recentShift,
    latestPayment: makeLatestPayment(ledgerRows, now),
    nextPaymentReference,
    currentlyOwed,
    outstandingSyncError: isAdmin ? (!outstandingKnown && !earningsOutstandingKnown) : false,
    paymentDue: (() => {
      const outstandingRows = ledgerRows.filter(row => row.withHelper && row.date).map(row => {
        const entitlement = helperEntitlement(row) ?? 0;
        const allocations = allocationsForRow(row);
        const paid = roundMoney(allocations.reduce((sum, item) => sum + item.amount, 0));
        const remaining = row.settledByConfirmation ? 0 : roundMoney(Math.max(0, entitlement - paid));
        const status = row.settledByConfirmation || (remaining <= 0.005 && paid > 0) ? 'Paid' : paid > 0 ? 'Partially paid' : 'Not paid';
        return { pageId: row.pageId, date: row.date, label: `${displayDate(row.date)}${row.day ? ` · ${paymentLabel(row.day)}` : ''}`, entitlement, paid, remaining, status, reference: allocations.length ? allocations[allocations.length - 1].reference : (row.paymentRef === null ? '' : String(row.paymentRef)), paidDate: row.paidDate };
      }).filter(row => row.remaining > 0.005).sort((a, b) => a.date.localeCompare(b.date));
      return { total: roundMoney(outstandingRows.reduce((sum, row) => sum + row.remaining, 0)), shifts: outstandingRows };
    })(),
    yourEarnings: makeYourEarnings(earningsRows, now, staffProfileId),
    currentWeek: makeCurrentWeek(personalRows, now, staffProfileId),
    upcomingShifts: shiftError ? [] : makeLiveUpcomingShifts(shiftPages, today, staffById),
    adminStaffProfiles: isAdmin ? staffDirectory.filter(x => x.active).map(({id,name}) => ({id,name})) : [],
    crewAttributionWarnings: isAdmin ? rows.filter(row => row.date && !row.actualCrewProfileIds.length).length : 0,
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
    const [earningsResult, shiftResult, completedResult, staffResult, outstandingResult, syncTestActive] = await Promise.all([
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
      queryDataSource(NOTION_COMPLETED_SHIFTS_ID, 'Date', fetchImpl)
        .then(pages => ({ pages, error: false }))
        .catch(error => {
          console.error('Completed shifts sync failed', error?.message || error);
          return { pages: [], error: true };
        }),
      queryDataSource(NOTION_STAFF_PROFILES_ID, null, fetchImpl)
        .then(pages => ({ pages, error: false }))
        .catch(error => {
          console.error('Staff Profiles sync failed', error?.message || error);
          return { pages: [], error: true };
        }),
      readHelperSummaryOutstanding(fetchImpl),
      getSyncTestActive(fetchImpl)
    ]);

    const payload = buildDashboardData({
      earningsPages: earningsResult.pages,
      shiftPages: shiftResult.pages,
      completedPages: completedResult.pages,
      completedError: completedResult.error,
      staffPages: staffResult.pages,
      outstandingValue: outstandingResult.outstandingValue,
      outstandingError: outstandingResult.outstandingError,
      shiftError: shiftResult.error,
      earningsError: earningsResult.error,
      staffProfileId: options.staffProfileId || null,
      isAdmin: Boolean(options.isAdmin),
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
  const auth = await requireStaffSession(req);
  if (!auth.ok) return authFailure(auth);
  const isAdmin = auth.staff.properties?.['Admin Access']?.checkbox === true;
  return Response.json(await loadLiveDashboard({ staffProfileId: auth.staff.id, isAdmin }), {
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
  emptyNextShift,
  mapEarningsPage,
  mapCompletedShiftPage,
  attachActualCrew,
  payoutForStaff,
  makeYourEarnings,
  makeCurrentWeek,
  makeLiveUpcomingShifts
};
