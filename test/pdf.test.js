import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { issueLink, revokeLink } from '../lib/links.js';
import { createApp } from '../server.js';

const directory = await mkdtemp(join(tmpdir(), 'miraenow-pdf-'));
const registryPath = join(directory, 'links.json');
const app = createApp({ registryPath });
let origin;

before(async () => {
  await new Promise((resolve) => app.listen(0, resolve));
  origin = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((resolve) => app.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

test('valid link serves a two-page PDF and browser renderer', async () => {
  const token = await issueLink('sample-pdf', registryPath);
  const page = await fetch(`${origin}/n/${token}`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /pdf-viewer\.js/);
  assert.match(html, new RegExp(`/n/${token}/asset`));

  const asset = await fetch(`${origin}/n/${token}/asset`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'application/pdf');
  assert.equal(asset.headers.get('cache-control'), 'private, no-store');
  const bytes = new Uint8Array(await asset.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), '%PDF-1.4');
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  assert.equal(pdf.numPages, 2);
  await loadingTask.destroy();

  assert.equal((await fetch(`${origin}/pdf-viewer.js`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${origin}/vendor/pdf.mjs`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${origin}/vendor/pdf.worker.mjs`, { method: 'HEAD' })).status, 200);
});

test('revoked PDF link exposes neither page nor document', async () => {
  const token = await issueLink('sample-pdf', registryPath);
  await revokeLink('sample-pdf', registryPath);
  assert.equal((await fetch(`${origin}/n/${token}`)).status, 404);
  assert.equal((await fetch(`${origin}/n/${token}/asset`)).status, 404);
});
