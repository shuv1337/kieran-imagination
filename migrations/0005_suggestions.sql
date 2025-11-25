-- Migration number: 0005 	 2025-11-24T00:00:00.000Z
CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL UNIQUE,
  serve_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Track which suggestions have been served to which IPs
CREATE TABLE suggestion_serves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  served_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id),
  UNIQUE(suggestion_id, ip_hash)
);

CREATE INDEX idx_suggestions_serve_count ON suggestions(serve_count);
CREATE INDEX idx_suggestion_serves_ip ON suggestion_serves(ip_hash);
