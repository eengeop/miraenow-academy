export async function purgeExpiredNotices(db, bucket, now = Date.now(), limit = 100) {
  const { results } = await db.prepare(
    'SELECT id, object_key AS objectKey FROM notices WHERE expires_at <= ? ORDER BY expires_at LIMIT ?',
  ).bind(now, limit).all();

  for (const notice of results) {
    await bucket.delete(notice.objectKey);
    await db.batch([
      db.prepare('DELETE FROM links WHERE notice_id = ?').bind(notice.id),
      db.prepare('DELETE FROM notices WHERE id = ? AND expires_at <= ?').bind(notice.id, now),
    ]);
  }
  return results.length;
}
