import { resolveLink } from './link-store.js';

const extensionByMime = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

function notFound() {
  return new Response('Not found', { status: 404, headers: privateHeaders });
}

export async function handleRequest(request, env, now = Date.now()) {
  const pathname = new URL(request.url).pathname;
  const route = pathname.match(/^\/n\/([A-Za-z0-9_-]{43})\/(asset|download)$/);
  if (!route || !['GET', 'HEAD'].includes(request.method)) return notFound();

  try {
    const notice = await resolveLink(env.DB, route[1], now);
    const extension = extensionByMime[notice?.mimeType];
    if (!extension) return notFound();
    const object = await env.NOTICES.get(notice.objectKey);
    if (!object) return notFound();

    const headers = new Headers(privateHeaders);
    headers.set('Content-Type', notice.mimeType);
    if (route[2] === 'download') {
      headers.set('Content-Disposition', `attachment; filename="notice.${extension}"`);
    }
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  } catch {
    return new Response('Unable to load notice', { status: 500, headers: privateHeaders });
  }
}

export default {
  fetch: handleRequest,
};
