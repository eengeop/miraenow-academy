import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { issueSql, revokeSql } from '../cloudflare/operator-sql.js';

const schema = await readFile(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8');
const id = 'a'.repeat(32);
const oldDigest = 'b'.repeat(64);
const newDigest = 'c'.repeat(64);
const now = Date.UTC(2026, 0, 1);
const deadline = now + 30 * 24 * 60 * 60 * 1000;

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);
  db.prepare('INSERT INTO notices VALUES (?, ?, ?, ?, ?)')
    .run(id, `demo/${id}.png`, 'image/png', now, deadline);
  db.prepare('INSERT INTO links VALUES (?, ?, ?, ?, ?)')
    .run(oldDigest, id, 1, now, deadline);
  return db;
}

test('operator reissue revokes the old link and keeps the original notice deadline', () => {
  const db = database();
  try {
    db.exec(issueSql(id, newDigest, now + 1000, deadline));
    const links = db.prepare('SELECT digest, active, expires_at FROM links ORDER BY digest')
      .all().map((row) => ({ ...row }));
    assert.deepEqual(links, [
      { digest: oldDigest, active: 0, expires_at: deadline },
      { digest: newDigest, active: 1, expires_at: deadline },
    ]);
    db.exec(revokeSql(id));
    assert.equal(db.prepare('SELECT active FROM links WHERE digest = ?').get(newDigest).active, 0);
  } finally {
    db.close();
  }
});

test('operator SQL rejects malformed IDs, digests, and expired link lifetimes', () => {
  assert.throws(() => revokeSql("a'; DELETE FROM notices; --"), /Invalid notice ID/);
  assert.throws(() => issueSql(id, 'bad', now, deadline), /Invalid token digest/);
  assert.throws(() => issueSql(id, newDigest, deadline, deadline), /Invalid link lifetime/);
});
