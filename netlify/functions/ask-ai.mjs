import { getStore } from '@netlify/blobs';

const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';

const DEFAULT_DATA = {
  nextShift: { date:'2026-09-16', day:'Wed 16 Sep', location:'Exmouth', start:'5:00pm', end:'9:00pm', status:'Confirmation pending', responseDeadline:'4pm', finalConfirmation:'4:30pm', targetGross:60, targetTrips:12, estimatedHelperPay:25, plannedHours:4, quest:'Not currently confirmed' },
  recentShift: { date:'2026-09-15', day:'Tue 15 Sep', location:'Exmouth', start:'5:00pm', end:'8:38pm', gross:48.80, trips:10, helperTime:'3h 38m', helperPay:17.30 },
  latestPayment: { amount:47.49, reference:'40', date:'13 September' }
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
  if (/next|when|shift|work/.test(q)) return `The next planned helper shift is ${n.day} in ${n.location}, from ${n.start} to ${n.end}. It is currently ${n.status.toLowerCase()}.`;
  if (/respond|deadline|confirm|availability|lock/.test(q)) return `Please submit or update availability by ${n.responseDeadline}. Final confirmation is sent at ${n.finalConfirmation}.`;
  if (/calculate|calculated|pay|split|boost/.test(q)) return `Planned helper pay is calculated using the current Helper Day Pay Agreement. The dashboard's current estimate for the next shift is £${Number(n.estimatedHelperPay).toFixed(2)}.`;
  if (/quest/.test(q)) return `Quest status for the next shift: ${n.quest}.`;
  if (/owed|outstanding/.test(q)) return `The dashboard currently shows £${Number(r.helperPay).toFixed(2)} from the most recent completed helper shift.`;
  if (/latest payment|paid|reference/.test(q)) return `The latest recorded payment is £${Number(data.latestPayment?.amount || DEFAULT_DATA.latestPayment.amount).toFixed(2)}, reference ${data.latestPayment?.reference || DEFAULT_DATA.latestPayment.reference}.`;
  if (/trip/.test(q)) return `The next shift has a target of ${n.targetTrips} trips.`;
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
