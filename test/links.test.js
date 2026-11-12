import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { issueLink, revokeLink } from '../lib/links.js';
import { createApp } from '../server.js';

const directory = await mkdtemp(join(tmpdir(), 'miraenow-links-'));
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

test('two links serve only their own server-held sample image', async () => {
  const tokenA = await issueLink('sample-a', registryPath);
  const tokenB = await issueLink('sample-b', registryPath);
  assert.notEqual(tokenA, tokenB);
  assert.match(tokenA, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(await readFile(registryPath, 'utf8'), new RegExp(tokenA));

  for (const [token, own, other] of [
    [tokenA, '샘플 A', '샘플 B'],
    [tokenB, '샘플 B', '샘플 A'],
  ]) {
    const page = await fetch(`${origin}/n/${token}`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(page.headers.get('cache-control'), 'private, no-store');
    assert.match(await page.text(), new RegExp(`/n/${token}/asset`));

    const image = await fetch(`${origin}/n/${token}/asset`);
    const svg = await image.text();
    assert.equal(image.status, 200);
    assert.match(svg, new RegExp(own));
    assert.doesNotMatch(svg, new RegExp(other));
  }

  assert.equal((await fetch(`${origin}/samples/notice-a.svg`)).status, 404);
  assert.equal((await fetch(`${origin}/samples/notice-b.svg`)).status, 404);
});

test('unknown, revoked and replaced links reveal no notice', async () => {
  const unknown = 'A'.repeat(43);
  assert.equal((await fetch(`${origin}/n/${unknown}`)).status, 404);
  assert.equal((await fetch(`${origin}/n/${unknown}/asset`)).status, 404);

  const oldToken = await issueLink('sample-a', registryPath);
  assert.equal((await fetch(`${origin}/n/${oldToken}/asset`)).status, 200);
  assert.equal(await revokeLink('sample-a', registryPath), true);
  assert.equal((await fetch(`${origin}/n/${oldToken}`)).status, 404);
  assert.equal((await fetch(`${origin}/n/${oldToken}/asset`)).status, 404);

  const currentToken = await issueLink('sample-a', registryPath);
  assert.notEqual(currentToken, oldToken);
  assert.equal((await fetch(`${origin}/n/${currentToken}/asset`)).status, 200);
  const replacementToken = await issueLink('sample-a', registryPath);
  assert.equal((await fetch(`${origin}/n/${currentToken}/asset`)).status, 404);
  assert.equal((await fetch(`${origin}/n/${replacementToken}/asset`)).status, 200);
});
