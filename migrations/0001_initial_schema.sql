-- Migration number: 0001 	 2025-11-22T00:00:00.000Z
CREATE TABLE generated_images (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  metadata TEXT
);
