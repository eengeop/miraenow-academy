const noticeIdPattern = /^[A-Za-z0-9_-]{16,64}$/;
const digestPattern = /^[a-f0-9]{64}$/;

export function validateNoticeId(id) {
  if (!noticeIdPattern.test(id)) throw new Error('Invalid notice ID');
  return id;
}

export function revokeSql(id) {
  return `UPDATE links SET active = 0 WHERE notice_id = '${validateNoticeId(id)}' AND active = 1`;
}

export function issueSql(id, digest, issuedAt, expiresAt) {
  validateNoticeId(id);
  if (!digestPattern.test(digest)) throw new Error('Invalid token digest');
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) {
    throw new Error('Invalid link lifetime');
  }
  return `${revokeSql(id)};
INSERT INTO links (digest, notice_id, active, issued_at, expires_at)
SELECT '${digest}', id, 1, ${issuedAt}, ${expiresAt}
FROM notices WHERE id = '${id}' AND expires_at > ${issuedAt}`;
}
