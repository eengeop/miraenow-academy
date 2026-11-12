import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { issueLink, revokeLink } from '../lib/links.js';
import { createApp } from '../server.js';

const directory = await mkdtemp(join(tmpdir(), 'miraenow-local-image-'));
const registryPath = join(directory, 'links.json');
const localImageFile = join(directory, 'notice.png');
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64',
);
const app = createApp({ registryPath, localImageFile });
let origin;

before(async () => {
  await writeFile(localImageFile, image);
  await new Promise((resolve) => app.listen(0, resolve));
  origin = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((resolve) => app.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

test('local PNG is only served through its active link', async () => {
  const token = await issueLink('local-image', registryPath);
  const page = await fetch(`${origin}/n/${token}`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, new RegExp(`/n/${token}/asset`));
  assert.match(html, new RegExp(`/n/${token}/download`));
  assert.match(html, /PNG 저장/);
  assert.doesNotMatch(html, /실제 학생 정보가 없는/);

  const asset = await fetch(`${origin}/n/${token}/asset`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'image/png');
  assert.equal(asset.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), image);
  const download = await fetch(`${origin}/n/${token}/download`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="notice.png"');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), image);
  assert.equal((await fetch(`${origin}/uploads/testImage2.png`)).status, 404);

  await revokeLink('local-image', registryPath);
  assert.equal((await fetch(`${origin}/n/${token}`)).status, 404);
  assert.equal((await fetch(`${origin}/n/${token}/asset`)).status, 404);
  assert.equal((await fetch(`${origin}/n/${token}/download`)).status, 404);
});
