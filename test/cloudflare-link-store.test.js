import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { hashToken, issueLink, linkLifetimeMs, resolveLink, revokeLink } from '../cloudflare/link-store.js';

const schema = await readFile(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8');

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(schema);
  const bind = (sql, args) => ({
    first: async () => sqlite.prepare(sql).get(...args) || null,
    run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
    execute: () => sqlite.prepare(sql).run(...args),
  });
  return {
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
    addNotice: (id, now, expiresAt) => sqlite.prepare(
      'INSERT INTO notices (id, object_key, mime_type, registered_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, `fake/${id}.png`, 'image/png', now, expiresAt),
    rows: () => sqlite.prepare('SELECT digest, notice_id, active, expires_at FROM links').all(),
    close: () => sqlite.close(),
  };
}

test('D1 links isolate notices, reissue, revoke, and store only token digests', async () => {
  const db = database();
  try {
    const now = Date.UTC(2026, 0, 1);
    db.addNotice('fake-a', now, now + linkLifetimeMs);
    db.addNotice('fake-b', now, now + linkLifetimeMs);
    const a = await issueLink(db, 'fake-a', now);
    const b = await issueLink(db, 'fake-b', now);
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
    assert.equal((await resolveLink(db, a, now))?.id, 'fake-a');
    assert.equal((await resolveLink(db, b, now))?.id, 'fake-b');
    assert.equal(db.rows()[0].digest, await hashToken(a));
    assert.ok(!JSON.stringify(db.rows()).includes(a));

    const nextA = await issueLink(db, 'fake-a', now + 1000);
    assert.equal(await resolveLink(db, a, now + 1000), null);
    assert.equal((await resolveLink(db, nextA, now + 1000))?.id, 'fake-a');
    assert.equal((await resolveLink(db, b, now + 1000))?.id, 'fake-b');
    assert.equal(await revokeLink(db, 'fake-a'), true);
    assert.equal(await resolveLink(db, nextA, now + 1000), null);
    assert.equal(await revokeLink(db, 'fake-a'), false);
    assert.equal(await resolveLink(db, 'invalid', now), null);
  } finally {
    db.close();
  }
});

test('D1 links stop at the notice retention deadline even after reissue', async () => {
  const db = database();
  try {
    const now = Date.UTC(2026, 0, 1);
    const deadline = now + linkLifetimeMs;
    db.addNotice('fake-a', now, deadline);
    const token = await issueLink(db, 'fake-a', now + linkLifetimeMs - 1000);
    assert.equal(db.rows()[0].expires_at, deadline);
    assert.ok(await resolveLink(db, token, deadline - 1));
    assert.equal(await resolveLink(db, token, deadline), null);
    await assert.rejects(issueLink(db, 'fake-a', deadline), /expired notice/);
    await assert.rejects(issueLink(db, 'missing', now), /Unknown/);
    assert.throws(() => db.addNotice('too-long', now, deadline + 1), /CHECK constraint/);
  } finally {
    db.close();
  }
});
