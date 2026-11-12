import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defaultRegistryPath, notices, resolveLink } from './lib/links.js';
import { makeSamplePdf } from './lib/sample-pdf.js';

const files = new Map([
  ['/', ['src/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['src/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['src/app.js', 'text/javascript; charset=utf-8']],
  ['/sample-notice.svg', ['src/sample-notice.svg', 'image/svg+xml']],
  ['/pdf-viewer.js', ['src/pdf-viewer.js', 'text/javascript; charset=utf-8']],
  ['/vendor/pdf.mjs', ['node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'text/javascript; charset=utf-8']],
  ['/vendor/pdf.worker.mjs', ['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'text/javascript; charset=utf-8']],
]);

export function createApp({ registryPath = defaultRegistryPath, localImageFile = notices.get('local-image').file } = {}) {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = files.get(pathname);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end('Not found');
      return;
    }

    const linkedRoute = pathname.match(/^\/n\/([A-Za-z0-9_-]{43})(?:\/(asset|download))?$/);
    if (linkedRoute) {
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'");
      try {
        const id = await resolveLink(linkedRoute[1], registryPath);
        if (!id) {
          response.writeHead(404).end('Not found');
          return;
        }
        const notice = notices.get(id);
        const noticeFile = id === 'local-image' ? localImageFile : notice.file;
        if (id === 'local-image') await access(noticeFile);
        const assetUrl = `/n/${linkedRoute[1]}/asset`;
        const downloadUrl = `/n/${linkedRoute[1]}/download`;
        let body;
        let contentType = 'text/html; charset=utf-8';
        if (linkedRoute[2]) {
          body = notice.type === 'pdf' ? makeSamplePdf() : await readFile(noticeFile);
          contentType = notice.type === 'pdf' ? 'application/pdf' : notice.mime || 'image/svg+xml';
          if (linkedRoute[2] === 'download') {
            const extension = {
              'application/pdf': 'pdf',
              'image/png': 'png',
              'image/jpeg': 'jpg',
              'image/svg+xml': 'svg',
            }[contentType];
            response.setHeader('Content-Disposition', `attachment; filename="notice.${extension}"`);
          }
        } else if (notice.type === 'pdf') {
          body = (await readFile(fileURLToPath(new URL('src/pdf.html', import.meta.url)), 'utf8'))
            .replace('__PDF_ASSET__', assetUrl)
            .replace('__PDF_DOWNLOAD__', downloadUrl);
        } else {
          body = (await readFile(fileURLToPath(new URL('src/index.html', import.meta.url)), 'utf8'))
            .replace('src="/sample-notice.svg"', `src="${assetUrl}"`)
            .replace('href="/sample-notice.svg"', `href="${downloadUrl}"`);
          if (id === 'local-image') {
            body = body
              .replaceAll('샘플 안내장', '안내장')
              .replace('실제 학생 정보가 없는 화면 검증용 샘플입니다.', '안내장을 위아래로 스크롤해 읽으세요.')
              .replace('제목과 여러 개의 예시 구역이 세로로 이어진 긴 이미지', '긴 이미지')
              .replace(/\s+width="720"\s+height="3000"/, '');
          }
        }
        response.writeHead(200, { 'Content-Type': contentType });
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Unable to load notice');
      }
      return;
    }

    if (!file) {
      response.writeHead(404).end('Not found');
      return;
    }

    try {
      const body = await readFile(fileURLToPath(new URL(file[0], import.meta.url)));
      response.writeHead(200, { 'Content-Type': file[1] });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500).end('Unable to load sample');
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => console.log(`Sample viewer: http://${host}:${port}`));
}
