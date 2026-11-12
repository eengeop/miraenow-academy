import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const files = new Map([
  ['/', ['src/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['src/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['src/app.js', 'text/javascript; charset=utf-8']],
  ['/sample-notice.svg', ['src/sample-notice.svg', 'image/svg+xml']],
]);

export function createApp() {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = files.get(pathname);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!file || !['GET', 'HEAD'].includes(request.method)) {
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
