import { requireStaffSession, authFailure } from './session-auth.mjs';
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
    const response = await fetch(new URL('/api/dashboard-data', origin), { headers: { 'Cache-Control': 'no-cache', cookie: req.headers.get('cookie') || '' } });
    if (!response.ok) throw new Error(`Dashboard data returned ${response.status}`);
    const data = await response.json();
    if (data?.dataUnavailable || data?.earningsSyncError) throw new Error('Live dashboard data unavailable');
    return data;
  } catch (error) {
    console.error('Helper AI live data read failed', error?.message || error);
    return null;
  }
}

function authenticatedStaffName(staff) {
  const properties = staff?.properties || {};
  const value = properties.Name || properties['Staff Name'];
  const parts = value?.type === 'title' ? value.title : value?.type === 'rich_text' ? value.rich_text : [];
  return (parts || []).map(part => part.plain_text || part.text?.content || '').join('').trim().slice(0, 80);
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

async function logUnansweredQuestion(question, staffName, reason) {
  try {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error('NOTION_TOKEN is not configured');
    const feedback = `Unanswered AI question\nStaff: ${staffName || 'Not supplied'}\nQuestion: ${question}\nReason: ${reason}\nLogged at: ${new Date().toISOString()}`.slice(0, 3000);
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent: { data_source_id: '34e1bc20-8f43-4b45-84a1-0cf9de860264' },
        properties: {
          Name: { title: [{ text: { content: `Unanswered AI question — ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}` } }] },
          Feedback: { rich_text: [{ text: { content: feedback } }] },
          'Feedback type': { select: { name: 'Other' } },
          'App area': { select: { name: 'Ask AI' } },
          'Review status': { status: { name: 'New' } }
        }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Unanswered AI question log failed', response.status, result?.code || 'unknown');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Unanswered AI question log failed', error?.message || error);
    return false;
  }
}

function supportResponse(logged) {
  const response = { answer: logged ? 'I can’t confirm the answer to that yet. Your question has been logged for Gary to review. Please contact the Helper Support WhatsApp group if you need help now.' : 'I can’t confirm the answer to that yet, and I couldn’t save the question for review automatically. Please use the support ticket in Tools so Gary can review it.', mode: 'unanswered', logged };
  const supportText = '❗ HELPER SUPPORT REQUEST\n\nPlease describe the issue you need help with.';
  const defaultSupportUrl = 'https://chat.whatsapp.com/GlhBIZwKo2kKAooHMiSbpq?s=cl&p=a&mlu=4&ilr=4&iam=2';
  const configuredSupportUrl = (process.env.WHATSAPP_SUPPORT_URL || '').trim();
  try {
    const parsed = new URL(configuredSupportUrl);
    if (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'chat.whatsapp.com' && /^\/[A-Za-z0-9]+\/?$/.test(parsed.pathname)) response.supportUrl = configuredSupportUrl;
    else response.supportUrl = defaultSupportUrl;
  } catch { response.supportUrl = defaultSupportUrl; }
  return Response.json(response);
}

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error:'Please send a question from the dashboard.' }, { status:405 });
  const auth = await requireStaffSession(req);
  if (!auth.ok) return authFailure(auth);
  let body; try { body = await req.json(); } catch { return Response.json({ error:'That question could not be read.' }, { status:400 }); }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const staffName = authenticatedStaffName(auth.staff);
  if (!question || question.length > 500) return Response.json({ error:'Please enter a question of up to 500 characters.' }, { status:400 });
  const data = await getSafeData(req);
  if (!data) {
    const answer = fallback(question, null);
    if (answer) return Response.json({ answer, mode:'safe-fallback' });
    return supportResponse(await logUnansweredQuestion(question, staffName, 'Live dashboard data unavailable; no approved fallback answer.'));
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const approvedContext = `You are Helper Assistant inside Gary Brice's Helper Dashboard. Answer the exact question asked. Use only the live dashboard data supplied below and general explanations of how the dashboard works. Never invent shifts, response deadlines, pay, Quest values or commitments. If a value is missing, say it is not recorded instead of guessing or reporting £0. Gary makes final shift changes, attendance confirmations and payment decisions. For shift questions, treat the live dashboard fields as authoritative: use the shift date, start/end times and location supplied in the live data, not any older or duplicated text in a shift title. Never repeat a date, time or location twice in the same shift description. If the live fields conflict, say the record needs checking rather than choosing one. For pay questions distinguish earned helper pay before adjustments from actual payment and outstanding balance after adjustments. If the question cannot be answered accurately from the supplied data and approved general guidance, respond with exactly the single word UNANSWERED and nothing else. DASHBOARD DATA: ${JSON.stringify(data)}`;
  if (!apiKey) {
    const answer = fallback(question, data);
    if (answer) return Response.json({ answer, mode:'approved-fallback' });
    return supportResponse(await logUnansweredQuestion(question, staffName, 'No API key and no approved fallback answer.'));
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
      return supportResponse(await logUnansweredQuestion(question, staffName, `AI provider returned HTTP ${response.status}; no approved fallback answer.`));
    }
    const answer = result.output_text || (result.output || []).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('\n').trim();
    if (!answer || /^UNANSWERED[.!]?$/i.test(answer.trim())) return supportResponse(await logUnansweredQuestion(question, staffName, 'AI marked the question as not answerable from approved context.'));
    return Response.json({ answer });
  } catch (error) {
    console.error('Helper Assistant request failed', error?.message || error);
    const approved = fallback(question, data);
    if (approved) return Response.json({ answer: approved, mode:'approved-fallback' });
    return supportResponse(await logUnansweredQuestion(question, staffName, 'AI request failed and no approved fallback answer was available.'));
  }
};

export const config = { path: '/.netlify/functions/ask-ai', method: ['POST'] };
