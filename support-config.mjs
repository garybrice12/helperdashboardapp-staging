const DEFAULT_SUPPORT_URL = 'https://chat.whatsapp.com/GlhBIZwKo2kKAooHMiSbpq?s=cl&p=a&mlu=4&ilr=4&iam=2';
function isAllowedWhatsAppGroupUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'chat.whatsapp.com' && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname);
  } catch { return false; }
}
export default async () => {
  const configured = typeof process.env.WHATSAPP_SUPPORT_URL === 'string' ? process.env.WHATSAPP_SUPPORT_URL.trim() : '';
  // Only accept group-invite links here. An old wa.me business-number setting must not override support-group routing.
  const supportUrl = isAllowedWhatsAppGroupUrl(configured) ? configured : DEFAULT_SUPPORT_URL;
  return Response.json({ supportUrl }, { headers: { 'Cache-Control': 'no-store' } });
};
export const config = { path: '/.netlify/functions/support-config', method: ['GET'] };
