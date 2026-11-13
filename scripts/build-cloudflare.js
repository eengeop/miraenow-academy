import { cp, mkdir, rm } from 'node:fs/promises';

const output = 'cloudflare/dist';
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/vendor`, { recursive: true });

for (const name of ['index.html', 'styles.css', 'app.js', 'sample-notice.svg', 'pdf.html', 'pdf-viewer.js']) {
  await cp(`src/${name}`, `${output}/${name}`);
}
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
  await cp(`node_modules/pdfjs-dist/legacy/build/${name}`, `${output}/vendor/${name}`);
}
console.log('Built fictional Cloudflare viewer assets in cloudflare/dist/');
