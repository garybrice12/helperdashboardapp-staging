// Serve the current image from a specifically named toggle in Notion Graphic Control.
// The toggle name is the source-of-truth key; never rely on image order/index.
const NOTION_PAGE_ID = process.env.NOTION_GRAPHIC_CONTROL_PAGE_ID || '3eef475c-d2eb-812d-ace1-c978b4ec3b73';
const SLOT_TITLES = {
  'dashboard-logo': 'Dashboard logo',
  'shift-graphic': 'Shift graphic'
};

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

function blockText(block) {
  const payload = block?.[block?.type];
  const richText = payload?.rich_text || payload?.title || [];
  return Array.isArray(richText) ? richText.map(part => part.plain_text || part.text?.content || '').join('').trim() : '';
}

function imageUrl(block) {
  const image = block?.type === 'image' ? block.image : null;
  return image?.type === 'file' ? image.file?.url : image?.type === 'external' ? image.external?.url : null;
}

async function findImageInsideNamedToggle(blocks, wantedTitle) {
  for (const block of blocks) {
    if (block.type === 'toggle' && blockText(block) === wantedTitle) {
      const image = await findFirstImage(await notionChildren(block.id));
      if (image) return image;
      throw new Error(`The “${wantedTitle}” toggle exists but contains no image`);
    }
    if (block.has_children) {
      const nested = await findImageInsideNamedToggle(await notionChildren(block.id), wantedTitle);
      if (nested) return nested;
    }
  }
  return null;
}

async function findFirstImage(blocks) {
  for (const block of blocks) {
    const url = imageUrl(block);
    if (url) return url;
    if (block.has_children) {
      const nested = await findFirstImage(await notionChildren(block.id));
      if (nested) return nested;
    }
  }
  return null;
}

export default async (req) => {
  try {
    const requestUrl = new URL(req.url);
    const slot = requestUrl.searchParams.get('slot') || 'shift-graphic';
    const toggleTitle = SLOT_TITLES[slot];
    if (!toggleTitle) return new Response('Unknown image slot.', { status: 400 });

    const sourceUrl = await findImageInsideNamedToggle(await notionChildren(NOTION_PAGE_ID), toggleTitle);
    if (!sourceUrl) return new Response(`No image found inside the “${toggleTitle}” toggle in Graphic Control.`, { status: 404 });

    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) return new Response('Notion image could not be fetched.', { status: 502 });
    return new Response(imageResponse.body, {
      status: 200,
      headers: {
        'Content-Type': imageResponse.headers.get('content-type') || 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      }
    });
  } catch (error) {
    console.error('Dashboard image sync failed', error?.message || error);
    return new Response('Dashboard image unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/api/dashboard-image', method: ['GET'] };
