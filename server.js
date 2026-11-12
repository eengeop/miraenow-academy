import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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

export function createApp({ registryPath = defaultRegistryPath } = {}) {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = files.get(pathname);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end('Not found');
      return;
    }

    const linkedRoute = pathname.match(/^\/n\/([A-Za-z0-9_-]{43})(\/asset)?$/);
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
        const assetUrl = `/n/${linkedRoute[1]}/asset`;
        const body = linkedRoute[2]
          ? notice.type === 'pdf' ? makeSamplePdf() : await readFile(notice.file)
          : notice.type === 'pdf'
            ? (await readFile(fileURLToPath(new URL('src/pdf.html', import.meta.url)), 'utf8'))
                .replace('__PDF_ASSET__', assetUrl)
            : (await readFile(fileURLToPath(new URL('src/index.html', import.meta.url)), 'utf8'))
                .replace('src="/sample-notice.svg"', `src="${assetUrl}"`);
        response.writeHead(200, {
          'Content-Type': linkedRoute[2]
            ? notice.type === 'pdf' ? 'application/pdf' : 'image/svg+xml'
            : 'text/html; charset=utf-8',
        });
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch {
        response.writeHead(500).end('Unable to load notice');
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
  createApp().listen(port, () => console.log(`Sample viewer: http://localhost:${port}`));
}
