import { getStore } from '@netlify/blobs';

const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';

const DEFAULT_DATA = {
  nextShift: { date:'', day:'No upcoming helper shift', location:'No confirmed helper shift', start:'', end:'', status:'No upcoming helper shift', responseDeadline:'', finalConfirmation:'', targetGross:null, targetTrips:null, estimatedHelperPay:null, plannedHours:null, quest:'No upcoming confirmed Quest shift' },
  recentShift: null,
  latestPayment: null,
  currentlyOwed: null
};

async function getData() {
  const value = await getStore(STORE_NAME, { consistency:'strong' }).get(KEY, { type:'json' });
  return value || DEFAULT_DATA;
}

async function getSafeData() {
  try {
    return await getData();
  } catch (error) {
    console.error('Helper dashboard data read failed; using approved defaults', error?.message || error);
    return DEFAULT_DATA;
  }
}

function fallback(question, data) {
  const q = question.toLowerCase();
  const n = data.nextShift || DEFAULT_DATA.nextShift;
  const r = data.recentShift || DEFAULT_DATA.recentShift;
  if (/next|when|shift|work/.test(q)) return n.date ? `The next planned helper shift is ${n.day} in ${n.location}, from ${n.start} to ${n.end}. It is currently ${n.status.toLowerCase()}.` : 'There is no upcoming confirmed helper shift in the live Work Planner.';
  if (/respond|deadline|confirm|availability|lock/.test(q)) return n.date ? `Please submit or update availability by ${n.responseDeadline}. Final confirmation is sent at ${n.finalConfirmation}.` : 'There is no upcoming confirmed helper shift to confirm in the live Work Planner.';
  if (/calculate|calculated|pay|split|boost/.test(q)) return n.date ? `Planned helper pay is calculated using the current Helper Day Pay Agreement. The dashboard's current estimate for the next shift is £${Number(n.estimatedHelperPay || 0).toFixed(2)}.` : 'There is no upcoming confirmed helper shift with an estimated helper payment in the live Work Planner.';
  if (/quest/.test(q)) return `Quest status for the next shift: ${n.quest}.`;
  if (/owed|outstanding/.test(q)) return Number.isFinite(Number(data.currentlyOwed)) ? `The Helper Pay Summary currently reports £${Number(data.currentlyOwed).toFixed(2)} outstanding.` : 'The current outstanding balance is unavailable because the live Helper Pay Summary has not loaded.';
  if (/latest payment|paid|reference/.test(q)) return data.latestPayment ? `The latest recorded payment is £${Number(data.latestPayment.amount || 0).toFixed(2)}, reference ${data.latestPayment.reference || 'not recorded'}.` : 'Latest payment information is unavailable from the live data.';
  if (/trip/.test(q)) return n.date ? `The next shift has a target of ${n.targetTrips} trips.` : 'There is no upcoming confirmed helper shift with a trip target in the live Work Planner.';
  if (/delivery counter|counter/.test(q)) return 'The Delivery Counter is the live shift estimator. Final records use confirmed session and mileage records.';
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error:'Please send a question from the dashboard.' }, { status:405 });
  let body; try { body = await req.json(); } catch { return Response.json({ error:'That question could not be read.' }, { status:400 }); }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 500) return Response.json({ error:'Please enter a question of up to 500 characters.' }, { status:400 });
  const data = await getSafeData();
  const apiKey = process.env.OPENAI_API_KEY;
  const approvedContext = `You are Helper Assistant inside Gary Brice's Helper Dashboard. Use only the dashboard data supplied below and general explanations of how the dashboard works. Never invent shifts, pay, Quest values or commitments. Gary makes final shift changes, attendance confirmations and payment decisions. DASHBOARD DATA: ${JSON.stringify(data)}`;
  if (!apiKey) {
    const answer = fallback(question, data);
    return answer ? Response.json({ answer, mode:'approved-fallback' }) : Response.json({ error:'I do not have that confirmed information. Please ask Gary.' }, { status:503 });
  }
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({ model:process.env.OPENAI_MODEL || 'gpt-4.1-mini', instructions:approvedContext, input:question, max_output_tokens:260 })
    });
    const result = await response.json();
    if (!response.ok) {
      const approved = fallback(question, data);
      if (approved) return Response.json({ answer: approved, mode:'approved-fallback' });
      return Response.json({ error:'The assistant could not answer right now. Please try again shortly.' }, { status:502 });
    }
    const answer = result.output_text || (result.output || []).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('\n').trim();
    if (!answer) return Response.json({ error:'The assistant returned an empty answer. Please try again.' }, { status:502 });
    return Response.json({ answer });
  } catch (error) {
    console.error('Helper Assistant request failed', error?.message || error);
    const approved = fallback(question, data);
    if (approved) return Response.json({ answer: approved, mode:'approved-fallback' });
    return Response.json({ error:'The assistant is temporarily unavailable. Please try again shortly.' }, { status:502 });
  }
};

export const config = { path: '/.netlify/functions/ask-ai', method: ['POST'] };
