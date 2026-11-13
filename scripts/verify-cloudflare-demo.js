import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.CLOUDFLARE_DEMO_URL;
if (!baseUrl) throw new Error('Set CLOUDFLARE_DEMO_URL');
const manifest = JSON.parse(await readFile('tmp/cloudflare-demo/manifest.json', 'utf8'));
const links = JSON.parse(await readFile('private/cloudflare-demo-links.json', 'utf8'));
const records = manifest.map((item) => ({ ...item, path: links.find((link) => link.id === item.id)?.path }));
assert.equal(records.length, 3);

for (const [index, record] of records.entries()) {
  assert.ok(record.path);
  const page = await fetch(new URL(record.path, baseUrl));
  assert.equal(page.status, 200, `notice ${index + 1} page`);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store');
  const html = await page.text();
  assert.ok(html.includes(`${record.path}/asset`));
  assert.ok(html.includes(`${record.path}/download`));
  assert.equal(html.includes(records[(index + 1) % records.length].path), false);

  const asset = await fetch(new URL(`${record.path}/asset`, baseUrl));
  assert.equal(asset.status, 200, `notice ${index + 1} asset`);
  assert.equal(asset.headers.get('Content-Type'), record.mimeType);
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), await readFile(record.file));

  const download = await fetch(new URL(`${record.path}/download`, baseUrl));
  assert.equal(download.status, 200, `notice ${index + 1} download`);
  assert.match(download.headers.get('Content-Disposition'), /^attachment; filename="notice\.(png|pdf)"$/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), await readFile(record.file));
  console.log(`Fictional notice ${index + 1}: page, asset, and download passed`);
}

const missing = await fetch(new URL(`/n/${'A'.repeat(43)}`, baseUrl));
assert.equal(missing.status, 404);
assert.equal((await fetch(new URL(`/n/${'A'.repeat(43)}/asset`, baseUrl))).status, 404);
assert.equal((await fetch(new URL(`/n/${'A'.repeat(43)}/download`, baseUrl))).status, 404);
assert.equal((await fetch(new URL(`/${records[0].objectKey}`, baseUrl))).status, 404);
console.log('Unknown notice link: page and asset denied');

for (const path of ['/styles.css', '/app.js', '/pdf-viewer.js', '/vendor/pdf.mjs', '/vendor/pdf.worker.mjs']) {
  assert.equal((await fetch(new URL(path, baseUrl))).status, 200, `${path} static asset`);
}
console.log('Mobile image and PDF viewer assets passed');
