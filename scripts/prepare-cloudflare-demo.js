import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { hashToken, linkLifetimeMs } from '../cloudflare/link-store.js';
import { makeSamplePdf } from '../lib/sample-pdf.js';

const output = 'tmp/cloudflare-demo';
await mkdir('tmp', { recursive: true });
await mkdir(output);
await mkdir('private', { recursive: true });

const registeredAt = Date.now();
const expiresAt = registeredAt + linkLifetimeMs;
const samples = [
  { source: 'samples/notice-a.svg', mimeType: 'image/png', extension: 'png' },
  { source: 'samples/notice-b.svg', mimeType: 'image/png', extension: 'png' },
  { mimeType: 'application/pdf', extension: 'pdf' },
];
const manifest = [];
const links = [];
const statements = [];

for (const sample of samples) {
  const id = randomBytes(16).toString('hex');
  const token = randomBytes(32).toString('base64url');
  const objectKey = `demo/${id}.${sample.extension}`;
  const file = `${output}/${id}.${sample.extension}`;
  let bytes;
  if (sample.source) {
    const image = await loadImage(await readFile(sample.source));
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    bytes = canvas.toBuffer('image/png');
  } else {
    bytes = makeSamplePdf();
  }
  await writeFile(file, bytes);
  manifest.push({ id, objectKey, file, mimeType: sample.mimeType });
  links.push({ id, path: `/n/${token}` });
  statements.push(`INSERT INTO notices (id, object_key, mime_type, registered_at, expires_at) VALUES ('${id}', '${objectKey}', '${sample.mimeType}', ${registeredAt}, ${expiresAt});`);
  statements.push(`INSERT INTO links (digest, notice_id, active, issued_at, expires_at) VALUES ('${await hashToken(token)}', '${id}', 1, ${registeredAt}, ${expiresAt});`);
}

await writeFile(`${output}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(`${output}/seed.sql`, `${statements.join('\n')}\n`);
await writeFile('private/cloudflare-demo-links.json', `${JSON.stringify(links, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Prepared ${samples.length} fictional notices in ${output}/`);
console.log('Link paths are stored only in private/cloudflare-demo-links.json');
