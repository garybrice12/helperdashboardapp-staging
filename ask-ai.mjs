import { getStore } from '@netlify/blobs';

const STORE_NAME = 'helper-dashboard-data';
const KEY = 'current';

const DEFAULT_DATA = {
  nextShift: { date:'2026-09-16', day:'Wed 16 Sep', location:'Exmouth', start:'5:00pm', end:'9:00pm', status:'Confirmation pending', responseDeadline:'4pm', finalConfirmation:'4:30pm', targetGross:60, targetTrips:12, estimatedHelperPay:25, plannedHours:4, quest:'Not currently confirmed' },
  recentShift: { date:'2026-09-15', day:'Tue 15 Sep', location:'Exmouth', start:'5:00pm', end:'8:38pm', gross:48.80, trips:10, helperTime:'3h 38m', helperPay:17.30 },
  latestPayment: { amount:47.49, reference:'40', date:'13 September' }
};

async function getSafeData(req) {
  try {
    const origin = new URL(req.url).origin;
    const response = await fetch(new URL('/api/dashboard-data', origin), { headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) throw new Error(`Dashboard data returned ${response.status}`);
    const data = await response.json();
    if (data?.dataUnavailable || data?.earningsSyncError) throw new Error('Live dashboard data unavailable');
    return data;
  } catch (error) {
    console.error('Helper AI live data read failed', error?.message || error);
    return null;
  }
}

function fallback(question, data) {
  const q = question.toLowerCase();
  const n = data?.nextShift;
  const r = data?.recentShift;
  const money = value => Number.isFinite(Number(value)) ? `£${Number(value).toFixed(2)}` : 'not available';
  // Intent-specific checks must run before generic "when/shift/work" matching.
  // Fixed helper policy deadlines are independent of shift records.
  if (/cancel|cancellation|call off|withdraw.*shift/.test(q)) return 'You can cancel a confirmed helper shift up to 15 minutes before the shift starts. For a 5:00 pm start, the cancellation cutoff is 4:45 pm. Contact Gary directly if something urgent changes after the cutoff.';
  if (/respond|response deadline|deadline|when must i|confirm by|reply by|availability deadline|when do i need to.*(confirm|reply)/.test(q)) return 'Please submit or update your shift request at least 1 hour before the shift starts. Final confirmation is due 30 minutes before the shift starts. For a 5:00 pm start, submit by 4:00 pm and expect final confirmation by 4:30 pm.';
  if (/respond|response deadline|deadline|when must i|confirm by|reply by|availability deadline/.test(q)) {
    if (n?.responseDeadline) return `Please submit or update availability by ${n.responseDeadline}${n.finalConfirmation ? `. Final confirmation is sent at ${n.finalConfirmation}.` : '.'}`;
    return 'The current Work Planner record does not contain a response deadline, so I cannot give you a confirmed time. Check the shift request or confirmation message.';
  }
  if (/calculate|calculated|helper pay|pay split|how.*pay|boost/.test(q)) {
    if (n && Number.isFinite(Number(n.estimatedHelperPay)) && Number(n.estimatedHelperPay) > 0) return `The live Work Planner estimate for the next helper shift is ${money(n.estimatedHelperPay)}. It should follow the Helper Day Pay Agreement: 40% of net after vehicle costs, plus the applicable trip boost. The estimate is not available if the source record has no valid estimate.`;
    return 'I cannot confirm the next shift’s helper-pay estimate from the live record yet. I will not show £0 as if it were a verified calculation. The agreed calculation is 40% of net after vehicle costs, plus the applicable trip boost.';
  }
  if (/owed|outstanding/.test(q)) {
    if (data?.currentlyOwed == null) return 'The live outstanding balance could not be verified. Please check the Helper Pay Summary rollup before relying on a balance.';
    return `The live Helper Pay Summary shows ${money(data.currentlyOwed)} outstanding.`;
  }
  if (/latest payment|paid|reference/.test(q)) {
    const p=data?.latestPayment;
    return p?.amount == null ? 'No verified latest payment is available from the live Earnings Log.' : `The latest recorded payment is ${money(p.amount)}, reference ${p.reference || 'not recorded'}${p.date ? `, dated ${p.date}` : ''}.`;
  }
  if (/next|when|shift|work/.test(q)) {
    if (!n || n.status === 'Shift sync unavailable') return 'I cannot read the live Work Planner right now, so I cannot confirm the next shift.';
    if (!n.date && !n.day) return 'There are no upcoming confirmed or live helper shifts in the Work Planner.';
    return `The next planned helper shift is ${n.day || n.date}${n.location ? ` in ${n.location}` : ''}${n.start || n.end ? `, from ${n.start || 'time not recorded'} to ${n.end || 'time not recorded'}` : ''}. Status: ${n.status || 'not recorded'}.`;
  }
  if (/quest/.test(q)) return n?.quest ? `Quest status for the next shift: ${n.quest}.` : 'Quest status is not available in the live shift record.';
  if (/trip/.test(q)) return n?.targetTrips == null ? 'The live shift record does not include a trip target.' : `The next shift has a target of ${n.targetTrips} trips.`;
  if (/delivery counter|counter/.test(q)) return 'The Delivery Counter is the live shift estimator. Final records use confirmed session and mileage records.';
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error:'Please send a question from the dashboard.' }, { status:405 });
  let body; try { body = await req.json(); } catch { return Response.json({ error:'That question could not be read.' }, { status:400 }); }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 500) return Response.json({ error:'Please enter a question of up to 500 characters.' }, { status:400 });
  const data = await getSafeData(req);
  if (!data) {
    const answer = fallback(question, null);
    return answer ? Response.json({ answer, mode:'safe-fallback' }) : Response.json({ error:'Live dashboard data is unavailable, so I cannot answer that accurately. Please try again after sync is restored.' }, { status:503 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const approvedContext = `You are Helper Assistant inside Gary Brice's Helper Dashboard. Answer the exact question asked. Use only the live dashboard data supplied below and general explanations of how the dashboard works. Never invent shifts, response deadlines, pay, Quest values or commitments. If a value is missing, say it is not recorded instead of guessing or reporting £0. Gary makes final shift changes, attendance confirmations and payment decisions. For pay questions distinguish earned helper pay before adjustments from actual payment and outstanding balance after adjustments. DASHBOARD DATA: ${JSON.stringify(data)}`;
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
