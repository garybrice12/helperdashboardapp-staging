const FEEDBACK_DATA_SOURCE_ID = '34e1bc20-8f43-4b45-84a1-0cf9de860264';

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2025-09-03',
    'Content-Type': 'application/json'
  };
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Use the feedback form to submit feedback.' }, { status: 405 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'The feedback form could not be read.' }, { status: 400 }); }

  const name = cleanText(body.name, 80);
  const feedback = cleanText(body.feedback, 3000);
  const type = cleanText(body.type, 40);
  const area = cleanText(body.area, 40);
  const allowedTypes = new Set(['Suggestion', 'Problem', 'Compliment', 'Other']);
  const allowedAreas = new Set(['Overview', 'Shifts', 'Pay', 'Ask AI', 'Help & support', 'Other']);
  if (!name || !feedback) return Response.json({ error: 'Please enter your name and feedback.' }, { status: 400 });
  if (!allowedTypes.has(type) || !allowedAreas.has(area)) return Response.json({ error: 'Please choose a valid feedback type and app section.' }, { status: 400 });

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { data_source_id: FEEDBACK_DATA_SOURCE_ID },
        properties: {
          Name: { title: [{ text: { content: name } }] },
          Feedback: { rich_text: [{ text: { content: feedback } }] },
          'Feedback type': { select: { name: type } },
          'App area': { select: { name: area } },
          'Review status': { status: { name: 'New' } }
        }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Notion feedback write failed', response.status, result?.code || 'unknown');
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return Response.json({ error: 'The feedback inbox is not accessible to the dashboard connection yet. Please contact Gary on WhatsApp while this is fixed.' }, { status: 503 });
      }
      return Response.json({ error: 'Feedback could not be saved to Notion. Please try again or contact Gary on WhatsApp.' }, { status: 502 });
    }
    return Response.json({ ok: true, feedbackId: result.id });
  } catch (error) {
    console.error('Feedback submission failed', error?.message || error);
    return Response.json({ error: 'Feedback could not be saved. Please try again or contact Gary on WhatsApp.' }, { status: 502 });
  }
};

export const config = {
  path: '/.netlify/functions/submit-feedback',
  method: ['POST'],
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 5 }
};
