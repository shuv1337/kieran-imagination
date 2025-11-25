-- Migration number: 0003 	 2025-11-24T00:00:00.000Z
CREATE TABLE image_votes (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('hot', 'not')),
  voter_ip TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (image_id) REFERENCES generated_images(id) ON DELETE CASCADE
);

CREATE INDEX idx_image_votes_image_id ON image_votes(image_id);
CREATE INDEX idx_image_votes_voter_ip ON image_votes(voter_ip);
CREATE UNIQUE INDEX idx_image_votes_unique ON image_votes(image_id, voter_ip);
