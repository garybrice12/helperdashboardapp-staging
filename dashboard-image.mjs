// Serve the current-shift graphic from the specifically labelled "Shift graphic" toggle
// in Notion's Graphic Control page. Do not select images by page-wide ordinal: reference
// images above it change the order and can make the dashboard show the wrong graphic.
const NOTION_PAGE_ID = process.env.NOTION_GRAPHIC_CONTROL_PAGE_ID || '3eef475c-d2eb-812d-ace1-c978b4ec3b73';

const plainText = items => (items || []).map(item => item.plain_text || item.text?.content || '').join('').trim();

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
    if (!response.ok) throw new Error(`Notion API ${response.status}: ${(await response.text()).slice(0, 160)}`);
    const data = await response.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : '';
  } while (cursor);
  return all;
}

function imageUrl(block) {
  const image = block.image || {};
  return image.type === 'file' ? image.file?.url : image.type === 'external' ? image.external?.url : null;
}

async function findNamedGraphic(blocks, targetLabel) {
  for (const block of blocks || []) {
    const typeData = block[block.type] || {};
    const label = plainText(typeData.rich_text || typeData.title || []);
    if (block.type === 'toggle' && new RegExp('^' + targetLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i').test(label)) {
      const nested = await notionChildren(block.id);
      for (const child of nested) {
        if (child.type === 'image') {
          const url = imageUrl(child);
          if (url) return url;
        }
        if (child.has_children) {
          const url = await findFirstImageInChildren(child.id);
          if (url) return url;
        }
      }
    }
    if (block.has_children) {
      const nested = await notionChildren(block.id);
      const url = await findNamedGraphic(nested, targetLabel);
      if (url) return url;
    }
  }
  return null;
}

async function findFirstImageInChildren(blockId) {
  const blocks = await notionChildren(blockId);
  for (const block of blocks) {
    const url = block.type === 'image' ? imageUrl(block) : null;
    if (url) return url;
    if (block.has_children) {
      const nested = await findFirstImageInChildren(block.id);
      if (nested) return nested;
    }
  }
  return null;
}

export default async (request) => {
  try {
    const asset = new URL(request.url).searchParams.get('asset') === 'logo' ? 'Dashboard logo' : 'Shift graphic';
    const sourceUrl = await findNamedGraphic(await notionChildren(NOTION_PAGE_ID), asset);
    if (!sourceUrl) return new Response(`No image found inside the ${asset} control.`, { status: 404 });
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
    console.error('Graphic Control image sync failed', error?.message || error);
    return new Response('Graphic Control image unavailable.', { status: 503 });
  }
};

export const config = { path: '/api/dashboard-image', method: ['GET'] };
