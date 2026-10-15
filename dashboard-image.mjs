const NOTION_PAGE_ID = process.env.NOTION_DASHBOARD_PAGE_ID || 'c5ea7d91-f11c-4e2d-9822-b98b0d42bcf5';

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
    if (!response.ok) throw new Error(`Notion API ${response.status}`);
    const data = await response.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : '';
  } while (cursor);
  return all;
}

async function findImages(items, out = []) {
  for (const block of items) {
    if (block.type === 'image') {
      const image = block.image || {};
      const url = image.type === 'file' ? image.file?.url : image.type === 'external' ? image.external?.url : null;
      if (url) out.push(url);
    }
    if (block.has_children) await findImages(await notionChildren(block.id), out);
  }
  return out;
}

export default async (req) => {
  try {
    const index = Math.max(0, Number(new URL(req.url).searchParams.get('index') || 0));
    const images = await findImages(await notionChildren(NOTION_PAGE_ID));
    const sourceUrl = images[index] || images[images.length - 1];
    if (!sourceUrl) return new Response(`No dashboard image found.`, { status: 404 });

    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) return new Response('Notion image could not be fetched.', { status: 502 });
    return new Response(imageResponse.body, {
      status: 200,
      headers: {
        'Content-Type': imageResponse.headers.get('content-type') || 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache'
      }
    });
  } catch (error) {
    console.error('Dashboard image sync failed', error?.message || error);
    return new Response('Dashboard image unavailable.', { status: 503 });
  }
};

export const config = { path: '/api/dashboard-image', method: ['GET'] };
