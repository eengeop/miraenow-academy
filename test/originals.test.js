import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { confirmOriginalDeleted, listOriginals, recordOriginal } from '../lib/originals.js';

test('private original record shows 30-day due date and requires manual deletion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miraenow-originals-'));
  try {
    const uploads = join(root, 'uploads');
    const source = join(uploads, 'fictional.png');
    const ledger = join(root, 'private', 'originals.jsonl');
    await mkdir(uploads);
    await writeFile(source, 'fictional data');
    const registeredAt = '2026-11-14T00:00:00.000Z';
    const expiresAt = '2026-12-14T00:00:00.000Z';
    await recordOriginal({ id: 'fictional-notice-id', registeredAt, expiresAt }, source, uploads, ledger);
    assert.equal((await listOriginals(ledger, Date.parse(expiresAt) - 1))[0].due, false);
    assert.equal((await listOriginals(ledger, Date.parse(expiresAt)))[0].due, true);
    await assert.rejects(confirmOriginalDeleted('fictional-notice-id', uploads, ledger), /still exists/);
    assert.equal(await readFile(source, 'utf8'), 'fictional data');
    await unlink(source);
    await confirmOriginalDeleted('fictional-notice-id', uploads, ledger);
    assert.deepEqual(await listOriginals(ledger), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('original record rejects a duplicate open source and a path outside uploads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miraenow-originals-'));
  try {
    const uploads = join(root, 'uploads');
    const ledger = join(root, 'private', 'originals.jsonl');
    const notice = { id: 'a', registeredAt: '2026-11-14T00:00:00Z', expiresAt: '2026-12-14T00:00:00Z' };
    await recordOriginal(notice, join(uploads, 'fictional.png'), uploads, ledger);
    await assert.rejects(recordOriginal({ ...notice, id: 'b' }, join(uploads, 'fictional.png'), uploads, ledger), /already has/);
    await assert.rejects(recordOriginal({ ...notice, id: 'c' }, join(root, 'outside.png'), uploads, ledger), /inside uploads/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
