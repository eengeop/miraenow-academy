export const linkLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function issueLink(db, noticeId, now = Date.now()) {
  const notice = await db.prepare(
    'SELECT expires_at FROM notices WHERE id = ? AND expires_at > ?',
  ).bind(noticeId, now).first();
  if (!notice) throw new Error('Unknown or expired notice');

  const token = newToken();
  const expiresAt = Math.min(now + linkLifetimeMs, notice.expires_at);
  await db.batch([
    db.prepare('UPDATE links SET active = 0 WHERE notice_id = ? AND active = 1').bind(noticeId),
    db.prepare(
      'INSERT INTO links (digest, notice_id, active, issued_at, expires_at) VALUES (?, ?, 1, ?, ?)',
    ).bind(await hashToken(token), noticeId, now, expiresAt),
  ]);
  return token;
}

export async function revokeLink(db, noticeId) {
  const result = await db.prepare(
    'UPDATE links SET active = 0 WHERE notice_id = ? AND active = 1',
  ).bind(noticeId).run();
  return (result.meta?.changes || 0) > 0;
}

export async function resolveLink(db, token, now = Date.now()) {
  if (!tokenPattern.test(token)) return null;
  const digest = await hashToken(token);
  return await db.prepare(`
    SELECT notices.id, notices.object_key AS objectKey, notices.mime_type AS mimeType,
           notices.expires_at AS noticeExpiresAt
    FROM links JOIN notices ON notices.id = links.notice_id
    WHERE links.digest = ? AND links.active = 1
      AND links.expires_at > ? AND notices.expires_at > ?
  `).bind(digest, now, now).first();
}
