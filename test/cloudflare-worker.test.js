import assert from 'node:assert/strict';
import test from 'node:test';
import { hashToken } from '../cloudflare/link-store.js';
import { handleRequest } from '../cloudflare/worker.js';

const now = Date.UTC(2026, 0, 1);
const token = 'A'.repeat(43);
const image = new Uint8Array([137, 80, 78, 71]);

async function bindings({ active = true, file = true, mimeType = 'image/png', body = image } = {}) {
  const digest = await hashToken(token);
  const calls = { reads: [] };
  const env = {
    DB: {
      prepare: () => ({
        bind: (requestedDigest) => ({
          first: async () => active && requestedDigest === digest
            ? { id: 'fake-a', objectKey: 'private/fake-a.png', mimeType }
            : null,
        }),
      }),
    },
    NOTICES: {
      get: async (key) => {
        calls.reads.push(key);
        return file ? { body } : null;
      },
    },
  };
  return { env, calls };
}

const request = (path, method = 'GET') => new Request(`https://example.workers.dev${path}`, { method });

test('Worker serves only the D1-authorized R2 object and preserves its file type', async () => {
  const { env, calls } = await bindings();
  const response = await handleRequest(request(`/n/${token}/asset`), env, now);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
  assert.deepEqual(calls.reads, ['private/fake-a.png']);

  const download = await handleRequest(request(`/n/${token}/download`), env, now);
  assert.equal(download.headers.get('Content-Disposition'), 'attachment; filename="notice.png"');
  const head = await handleRequest(request(`/n/${token}/asset`, 'HEAD'), env, now);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('Worker does not read R2 for unknown, revoked, or malformed links', async () => {
  const { env, calls } = await bindings({ active: false });
  for (const path of [`/n/${token}/asset`, `/n/${'B'.repeat(43)}/download`, '/n/bad/asset']) {
    assert.equal((await handleRequest(request(path), env, now)).status, 404);
  }
  assert.deepEqual(calls.reads, []);
  assert.equal((await handleRequest(request(`/n/${token}/asset`, 'POST'), env, now)).status, 404);
});

test('Worker returns 404 when a private R2 object is missing', async () => {
  const { env } = await bindings({ file: false });
  const response = await handleRequest(request(`/n/${token}/asset`), env, now);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
});

test('Worker returns PDF as PDF and downloads it with a PDF extension', async () => {
  const pdf = new TextEncoder().encode('%PDF-1.4\n');
  const { env } = await bindings({ mimeType: 'application/pdf', body: pdf });
  const view = await handleRequest(request(`/n/${token}/asset`), env, now);
  assert.equal(view.headers.get('Content-Type'), 'application/pdf');
  assert.deepEqual(new Uint8Array(await view.arrayBuffer()), pdf);
  const download = await handleRequest(request(`/n/${token}/download`), env, now);
  assert.equal(download.headers.get('Content-Disposition'), 'attachment; filename="notice.pdf"');
});
