// Graphic Control is the single source of truth. The live shift image must come from the named Shift graphic control, never the spec reference image.
const NOTION_PAGE_ID = process.env.NOTION_GRAPHIC_CONTROL_PAGE_ID || '3eef475c-d2eb-812d-ace1-c978b4ec3b73';

async function notionChildren(blockId) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  const all = [];
  let cursor = '';
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' } });
    if (!response.ok) throw new Error(`Notion API ${response.status}`);
    const data = await response.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : '';
  } while (cursor);
  return all;
}

const plainText = items => (items || []).map(item => item.plain_text || item.text?.content || '').join('').trim();
function imageUrl(block) {
  const image = block.image || {};
  return image.type === 'file' ? image.file?.url : image.type === 'external' ? image.external?.url : null;
}
async function findFirstImageInChildren(blockId) {
  for (const block of await notionChildren(blockId)) {
    const url = block.type === 'image' ? imageUrl(block) : null;
    if (url) return url;
    if (block.has_children) { const nested = await findFirstImageInChildren(block.id); if (nested) return nested; }
  }
  return null;
}
async function findNamedGraphic(blocks, targetLabel) {
  for (const block of blocks || []) {
    const data = block[block.type] || {};
    const label = plainText(data.rich_text || data.title || []);
    if (block.type === 'toggle' && label.toLowerCase() === targetLabel.toLowerCase()) {
      for (const child of await notionChildren(block.id)) {
        if (child.type === 'image') { const url = imageUrl(child); if (url) return url; }
        if (child.has_children) { const url = await findFirstImageInChildren(child.id); if (url) return url; }
      }
    }
    if (block.has_children) { const found = await findNamedGraphic(await notionChildren(block.id), targetLabel); if (found) return found; }
  }
  return null;
}
async function findImages(items, out = []) {
  for (const block of items) {
    if (block.type === 'image') { const url = imageUrl(block); if (url) out.push(url); }
    if (block.has_children) await findImages(await notionChildren(block.id), out);
  }
  return out;
}
export default async (req) => {
  try {
    const params = new URL(req.url).searchParams;
    let sourceUrl;
    const blocks = await notionChildren(NOTION_PAGE_ID);
    const asset = params.get('asset');
    if (asset === 'logo') {
      sourceUrl = await findNamedGraphic(blocks, 'Dashboard logo');
      if (!sourceUrl) return new Response('No image found inside the Dashboard logo control.', { status: 404 });
    } else if (asset === 'news') {
      sourceUrl = await findNamedGraphic(blocks, 'News graphic');
      // Until Graphic Control's toggle is renamed, fall back to the existing source label.
      if (!sourceUrl) sourceUrl = await findNamedGraphic(blocks, 'Spec reference image');
      if (!sourceUrl) return new Response('No image found inside the News graphic control.', { status: 404 });
    } else if (asset === 'shift') {
      sourceUrl = await findNamedGraphic(blocks, 'Shift graphic');
      if (!sourceUrl) return new Response('No image found inside the Shift graphic control.', { status: 404 });
    } else {
      // Backwards-compatible fallback for older clients; new app versions use named assets.
      const requestedIndex = params.get('index');
      const index = Math.max(0, Number(requestedIndex ?? 1));
      const images = await findImages(blocks);
      sourceUrl = images[index] || images[1] || images[0] || images[images.length - 1];
      if (!sourceUrl) return new Response('No dashboard image found.', { status: 404 });
    }
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) return new Response('Notion image could not be fetched.', { status: 502 });
    return new Response(imageResponse.body, { status: 200, headers: {
      'Content-Type': imageResponse.headers.get('content-type') || 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache'
    }});
  } catch (error) {
    console.error('Dashboard image sync failed', error?.message || error);
    return new Response('Dashboard image unavailable.', { status: 503 });
  }
};
export const config = { path: '/api/dashboard-image', method: ['GET'] };
