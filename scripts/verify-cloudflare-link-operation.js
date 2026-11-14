import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [action, id] = process.argv.slice(2);
const baseUrl = process.env.CLOUDFLARE_DEMO_URL;
if (!['revoked', 'reissued'].includes(action) || !id || !baseUrl) {
  throw new Error('Usage: CLOUDFLARE_DEMO_URL=<url> node scripts/verify-cloudflare-link-operation.js <revoked|reissued> <notice-id>');
}

const demoLinks = JSON.parse(await readFile('private/cloudflare-demo-links.json', 'utf8'));
const oldPath = demoLinks.find((item) => item.id === id)?.path;
assert.ok(oldPath, 'Unknown fictional notice ID');
for (const suffix of ['', '/asset', '/download']) {
  const response = await fetch(new URL(`${oldPath}${suffix}`, baseUrl));
  assert.equal(response.status, 404, `old link ${suffix || 'page'}`);
}
console.log('Revoked fictional link denies page, asset, and download');

if (action === 'reissued') {
  const entries = (await readFile('private/cloudflare-issued-links.jsonl', 'utf8'))
    .trim().split('\n').map((line) => JSON.parse(line));
  const replacement = entries.findLast((item) => item.id === id);
  assert.ok(replacement, 'No replacement link saved');
  const manifest = JSON.parse(await readFile('tmp/cloudflare-demo/manifest.json', 'utf8'));
  const file = manifest.find((item) => item.id === id)?.file;
  assert.ok(file, 'No fictional file found');
  const page = await fetch(new URL(replacement.path, baseUrl));
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes(`${replacement.path}/asset`));
  for (const suffix of ['/asset', '/download']) {
    const response = await fetch(new URL(`${replacement.path}${suffix}`, baseUrl));
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(file));
  }
  console.log('Replacement fictional link serves only its original notice');
}
