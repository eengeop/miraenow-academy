import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { issueLink, resolveLink } from '../lib/links.js';
import {
  getManagedNotice,
  managedLifetimeMs,
  purgeManagedNotices,
  registerManagedNotice,
} from '../lib/managed-notices.js';
import { makeSamplePdf } from '../lib/sample-pdf.js';
import { createApp } from '../server.js';

const directory = await mkdtemp(join(tmpdir(), 'miraenow-managed-'));
const managedRoot = join(directory, 'managed');
const registryPath = join(directory, 'links.json');
const imageSource = join(directory, 'source.png');
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64',
);
const app = createApp({ registryPath, managedRoot });
let origin;

before(async () => {
  await writeFile(imageSource, image);
  await new Promise((resolve) => app.listen(0, resolve));
  origin = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((resolve) => app.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

test('managed PNG expires and only its copy is deleted', async () => {
  const registeredAt = Date.now();
  const { id, expiresAt } = await registerManagedNotice(imageSource, managedRoot, registeredAt);
  assert.equal(Date.parse(expiresAt), registeredAt + managedLifetimeMs);
  const notice = await getManagedNotice(id, managedRoot, registeredAt);
  assert.deepEqual(await readFile(notice.file), image);
  assert.doesNotMatch(await readFile(join(managedRoot, 'notices.json'), 'utf8'), /source\.png/);

  const token = await issueLink(id, registryPath, registeredAt, managedRoot);
  const page = await fetch(`${origin}/n/${token}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /PNG 저장/);
  const download = await fetch(`${origin}/n/${token}/download`);
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="notice.png"');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), image);
  assert.equal((await fetch(`${origin}/private/managed/files/${id}.png`)).status, 404);

  const lateToken = await issueLink(id, registryPath, registeredAt + managedLifetimeMs - 1000, managedRoot);
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  assert.equal(registry.links.at(-1).expiresAt, expiresAt);
  assert.equal(await resolveLink(lateToken, registryPath, registeredAt + managedLifetimeMs, managedRoot), null);
  assert.equal(await getManagedNotice(id, managedRoot, registeredAt + managedLifetimeMs), null);
  assert.equal(await purgeManagedNotices(managedRoot, registeredAt + managedLifetimeMs - 1), 0);
  assert.equal(await purgeManagedNotices(managedRoot, registeredAt + managedLifetimeMs), 1);
  assert.equal(await getManagedNotice(id, managedRoot, registeredAt), null);
  await assert.rejects(readFile(notice.file), { code: 'ENOENT' });
  assert.deepEqual(await readFile(imageSource), image);
  assert.equal((await fetch(`${origin}/n/${lateToken}/download`)).status, 404);
});

test('managed PDF is read and downloaded from its private copy', async () => {
  const source = join(directory, 'source.pdf');
  const bytes = makeSamplePdf();
  await writeFile(source, bytes);
  const { id } = await registerManagedNotice(source, managedRoot);
  const token = await issueLink(id, registryPath, Date.now(), managedRoot);
  const page = await fetch(`${origin}/n/${token}`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /PDF 안내장/);
  assert.doesNotMatch(html, /실제 학생 정보가 없는/);
  const download = await fetch(`${origin}/n/${token}/download`);
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="notice.pdf"');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
});

test('unsupported files are not registered', async () => {
  const source = join(directory, 'unsupported.txt');
  await writeFile(source, 'not a notice');
  await assert.rejects(registerManagedNotice(source, managedRoot), /Only PNG, JPG and PDF/);
});
