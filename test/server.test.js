import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../server.js';

const app = createApp();
let origin;

before(async () => {
  await new Promise((resolve) => app.listen(0, resolve));
  origin = `http://127.0.0.1:${app.address().port}`;
});

after(() => app.close());

test('serves the mobile viewer and long sample image', async () => {
  const page = await fetch(origin);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /name="viewport"/);
  assert.match(html, /sample-notice\.svg/);

  const image = await fetch(`${origin}/sample-notice.svg`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await image.text(), /height="3000"/);
});

test('unknown routes do not return the notice', async () => {
  const response = await fetch(`${origin}/missing`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /샘플 안내장/);
});
