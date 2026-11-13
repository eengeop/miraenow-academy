import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../cloudflare/worker.js';
import { purgeExpiredNotices } from '../cloudflare/retention.js';

const schema = await readFile(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8');
const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 31);

function fixtures({ deleteFails = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(schema);
  const objects = new Set(['private/expired.png', 'private/current.pdf']);
  const deleted = [];
  const bind = (sql, args) => ({
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => sqlite.prepare(sql).run(...args),
    execute: () => sqlite.prepare(sql).run(...args),
  });
  const db = {
    prepare: (sql) => ({ bind: (...args) => bind(sql, args) }),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const bucket = {
    delete: async (key) => {
      if (deleteFails) throw new Error('R2 unavailable');
      deleted.push(key);
      objects.delete(key);
    },
  };
  const insertNotice = sqlite.prepare(
    'INSERT INTO notices (id, object_key, mime_type, registered_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  );
  insertNotice.run('expired', 'private/expired.png', 'image/png', now - 30 * day, now);
  insertNotice.run('current', 'private/current.pdf', 'application/pdf', now - 29 * day, now + day);
  sqlite.prepare(
    'INSERT INTO links (digest, notice_id, active, issued_at, expires_at) VALUES (?, ?, 1, ?, ?)',
  ).run('expired-digest', 'expired', now - day, now);
  return {
    db, bucket, objects, deleted,
    noticeIds: () => sqlite.prepare('SELECT id FROM notices ORDER BY id').all().map((row) => row.id),
    linkIds: () => sqlite.prepare('SELECT notice_id FROM links').all().map((row) => row.notice_id),
    close: () => sqlite.close(),
  };
}

test('scheduled retention deletes only expired managed copies and their D1 rows', async () => {
  const data = fixtures();
  try {
    let task;
    worker.scheduled({ scheduledTime: now }, { DB: data.db, NOTICES: data.bucket }, {
      waitUntil: (promise) => { task = promise; },
    });
    await task;
    assert.deepEqual(data.deleted, ['private/expired.png']);
    assert.deepEqual([...data.objects], ['private/current.pdf']);
    assert.deepEqual(data.noticeIds(), ['current']);
    assert.deepEqual(data.linkIds(), []);
  } finally {
    data.close();
  }
});

test('failed R2 deletion keeps metadata for the next cleanup attempt', async () => {
  const data = fixtures({ deleteFails: true });
  try {
    await assert.rejects(purgeExpiredNotices(data.db, data.bucket, now), /R2 unavailable/);
    assert.deepEqual(data.noticeIds(), ['current', 'expired']);
    assert.deepEqual(data.linkIds(), ['expired']);
    assert.equal(data.objects.has('private/expired.png'), true);
  } finally {
    data.close();
  }
});

test('cleanup respects expiry boundary and batch limit', async () => {
  const data = fixtures();
  try {
    assert.equal(await purgeExpiredNotices(data.db, data.bucket, now - 1), 0);
    assert.equal(await purgeExpiredNotices(data.db, data.bucket, now, 0), 0);
    assert.equal(await purgeExpiredNotices(data.db, data.bucket, now), 1);
  } finally {
    data.close();
  }
});
