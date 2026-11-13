import { resolveLink } from './link-store.js';
import { purgeExpiredNotices } from './retention.js';

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
  const route = pathname.match(/^\/n\/([A-Za-z0-9_-]{43})(?:\/(asset|download))?$/);
  if (!route || !['GET', 'HEAD'].includes(request.method)) return notFound();

  try {
    const notice = await resolveLink(env.DB, route[1], now);
    const extension = extensionByMime[notice?.mimeType];
    if (!extension) return notFound();
    const object = route[2]
      ? await env.NOTICES.get(notice.objectKey)
      : await env.NOTICES.head(notice.objectKey);
    if (!object) return notFound();

    const headers = new Headers(privateHeaders);
    if (!route[2]) {
      const templatePath = notice.mimeType === 'application/pdf' ? '/pdf.html' : '/';
      const template = await env.ASSETS.fetch(new Request(new URL(templatePath, request.url)));
      if (!template.ok) throw new Error('Missing notice template');
      const assetUrl = `/n/${route[1]}/asset`;
      const downloadUrl = `/n/${route[1]}/download`;
      let html = await template.text();
      if (notice.mimeType === 'application/pdf') {
        html = html
          .replace('__PDF_ASSET__', assetUrl)
          .replace('__PDF_DOWNLOAD__', downloadUrl)
          .replaceAll('샘플 PDF 안내장', 'PDF 안내장')
          .replace('실제 학생 정보가 없는 PDF 화면 검증용 샘플입니다.', '안내장을 확인하세요.');
      } else {
        html = html
          .replace('src="/sample-notice.svg"', `src="${assetUrl}"`)
          .replace('href="/sample-notice.svg"', `href="${downloadUrl}"`)
          .replaceAll('샘플 안내장', '안내장')
          .replace('SVG 저장', notice.mimeType === 'image/jpeg' ? 'JPG 저장' : 'PNG 저장')
          .replace('실제 학생 정보가 없는 화면 검증용 샘플입니다.', '안내장을 위아래로 스크롤해 읽으세요.')
          .replace('제목과 여러 개의 예시 구역이 세로로 이어진 긴 이미지', '긴 이미지')
          .replace(/\s+width="720"\s+height="3000"/, '');
      }
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'");
      return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
    }

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
  fetch(request, env) {
    return handleRequest(request, env);
  },
  scheduled(event, env, context) {
    context.waitUntil(purgeExpiredNotices(env.DB, env.NOTICES, event.scheduledTime));
  },
};
