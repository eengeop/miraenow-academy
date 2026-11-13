CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'application/pdf')),
  registered_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > registered_at AND expires_at <= registered_at + 2592000000)
);

CREATE TABLE IF NOT EXISTS links (
  digest TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS links_notice_active ON links(notice_id, active);
