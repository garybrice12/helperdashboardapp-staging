// Keep the two graphics tied to their actual Notion source pages.
// News remains in Graphic Control; the live Shift graphic is embedded in
// Helper availability & confirmations under the named "Shift graphic" toggle.
const GRAPHIC_CONTROL_PAGE_ID = process.env.NOTION_GRAPHIC_CONTROL_PAGE_ID || '3eef475c-d2eb-812d-ace1-c978b4ec3b73';
const HELPER_AVAILABILITY_PAGE_ID = process.env.NOTION_HELPER_AVAILABILITY_PAGE_ID || 'fee09b1f-97c9-409c-9a68-cf947c6ef566';
// Exact image block for the Helper Preparation Shift Reminder already stored
// inside Graphic Control → Home announcement image. Never substitute by order.
const HELPER_PREPARATION_IMAGE_BLOCK_ID = '407f475c-d2eb-805b-99cc-fc17a4e77c7a';

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
    if (!response.ok) throw new Error(`Notion API ${response.status} for block ${blockId}`);
    const data = await response.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : '';
  } while (cursor);
  return all;
}

function blockText(block) {
  const data = block?.[block?.type] || {};
  const parts = data.rich_text || data.title || [];
  return parts.map(part => part.plain_text || part.text?.content || '').join('').trim();
}

function imageUrl(block) {
  const image = block?.image || {};
  return image.type === 'file' ? image.file?.url
    : image.type === 'external' ? image.external?.url : null;
}

// Notion synced blocks can expose the visible children through the original
// synced block ID rather than the reference block's own ID. Follow that link
// explicitly; the toggle and image are still matched by their exact names.
async function childrenForTraversal(block) {
  if (!block) return [];
  if (block.type === 'synced_block' && block.synced_block?.synced_from?.block_id) {
    return notionChildren(block.synced_block.synced_from.block_id);
  }
  if (block.type === 'synced_block_reference' && block.synced_block_reference?.synced_block_id) {
    return notionChildren(block.synced_block_reference.synced_block_id);
  }
  return block.has_children ? notionChildren(block.id) : [];
}

async function firstImageInSubtree(blocks, visited = new Set()) {
  for (const block of blocks) {
    const url = imageUrl(block);
    if (block.type === 'image' && url) return url;
    const childId = block.type === 'synced_block_reference'
      ? block.synced_block_reference?.synced_block_id
      : block.type === 'synced_block'
        ? (block.synced_block?.synced_from?.block_id || block.id) : block.id;
    const canTraverse = block.has_children || (block.type === 'synced_block_reference' && block.synced_block_reference?.synced_block_id) || (block.type === 'synced_block' && block.synced_block?.synced_from?.block_id);
    if (canTraverse && childId && !visited.has(childId)) {
      visited.add(childId);
      const found = await firstImageInSubtree(await childrenForTraversal(block), visited);
      if (found) return found;
    }
  }
  return null;
}


async function findImageByBlockId(blocks, targetBlockId, visited = new Set()) {
  for (const block of blocks) {
    if (block.type === 'image' && block.id === targetBlockId) return imageUrl(block);
    const childId = block.type === 'synced_block_reference'
      ? block.synced_block_reference?.synced_block_id
      : block.type === 'synced_block'
        ? (block.synced_block?.synced_from?.block_id || block.id) : block.id;
    const canTraverse = block.has_children || (block.type === 'synced_block_reference' && block.synced_block_reference?.synced_block_id) || (block.type === 'synced_block' && block.synced_block?.synced_from?.block_id);
    if (canTraverse && childId && !visited.has(childId)) {
      visited.add(childId);
      const found = await findImageByBlockId(await childrenForTraversal(block), targetBlockId, visited);
      if (found) return found;
    }
  }
  return null;
}

async function findNamedImage(blocks, targetName, visited = new Set()) {
  for (const block of blocks) {
    if (block.type === 'toggle' && blockText(block).toLowerCase() === targetName.toLowerCase()) {
      if (!block.has_children) return null;
      return firstImageInSubtree(await notionChildren(block.id));
    }
    const childId = block.type === 'synced_block_reference'
      ? block.synced_block_reference?.synced_block_id
      : block.type === 'synced_block'
        ? (block.synced_block?.synced_from?.block_id || block.id) : block.id;
    const canTraverse = block.has_children || (block.type === 'synced_block_reference' && block.synced_block_reference?.synced_block_id) || (block.type === 'synced_block' && block.synced_block?.synced_from?.block_id);
    if (canTraverse && childId && !visited.has(childId)) {
      visited.add(childId);
      const found = await findNamedImage(await childrenForTraversal(block), targetName, visited);
      if (found) return found;
    }
  }
  return null;
}

export default async (req) => {
  try {
    const slot = (new URL(req.url).searchParams.get('slot') || '').trim().toLowerCase();
    const source = slot === 'news'
      ? { pageId: GRAPHIC_CONTROL_PAGE_ID, toggle: 'News image', label: 'Graphic Control' }
      : slot === 'announcement'
        ? { pageId: GRAPHIC_CONTROL_PAGE_ID, toggle: 'Home announcement image', label: 'Graphic Control' }
      : slot === 'announcement-preparation'
        ? { pageId: GRAPHIC_CONTROL_PAGE_ID, toggle: 'Home announcement image', label: 'Graphic Control', imageBlockId: HELPER_PREPARATION_IMAGE_BLOCK_ID }
      : slot === 'shift'
        ? { pageId: HELPER_AVAILABILITY_PAGE_ID, toggle: 'Shift graphic', label: 'Helper availability & confirmations' }
        : null;
    if (!source) return new Response('Unknown image slot. Use slot=news, slot=announcement, slot=announcement-preparation or slot=shift.', { status: 400 });

    const pageBlocks = await notionChildren(source.pageId);
    const sourceUrl = source.imageBlockId
      ? await (async () => {
          const toggle = pageBlocks.find(block => block.type === 'toggle' && blockText(block).toLowerCase() === source.toggle.toLowerCase());
          return toggle?.has_children ? findImageByBlockId(await notionChildren(toggle.id), source.imageBlockId) : null;
        })()
      : await findNamedImage(pageBlocks, source.toggle);
    if (!sourceUrl) return new Response(`No image found in ${source.label}: ${source.toggle}.`, { status: 404 });

    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) return new Response(`Notion image could not be fetched for ${source.toggle}.`, { status: 502 });
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
