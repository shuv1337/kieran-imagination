-- Migration 0007: Creation platform (jobs, budgets, media, worlds, cards)

-- Household owner is a fixed shared identity for the family access code.
-- Runtime: 'household'

CREATE TABLE IF NOT EXISTS daily_budgets (
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL, -- YYYY-MM-DD (UTC)
  credit_limit INTEGER NOT NULL,
  reserved INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day)
);

CREATE TABLE IF NOT EXISTS creation_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  operation TEXT NOT NULL,
  quality TEXT NOT NULL,
  request_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|cancelled
  stage TEXT NOT NULL DEFAULT 'input', -- input|model|normalize|save
  attempt_count INTEGER NOT NULL DEFAULT 0,
  reserved_credits INTEGER NOT NULL DEFAULT 0,
  charged_credits INTEGER NOT NULL DEFAULT 0,
  budget_state TEXT NOT NULL DEFAULT 'reserved', -- reserved|settled|released
  cancel_requested_at INTEGER,
  result_asset_id TEXT,
  result_revision_id TEXT,
  target_card_id TEXT,
  expected_card_revision_id TEXT,
  result_json TEXT,
  error_category TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_creation_jobs_owner_status ON creation_jobs(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_creation_jobs_world ON creation_jobs(json_extract(request_json, '$.worldId'));

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  role TEXT NOT NULL, -- upload_original|input_normalized|provider_raw|master|preview|print
  visibility TEXT NOT NULL DEFAULT 'private', -- private|public
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  byte_length INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  source_job_id TEXT,
  source_model TEXT,
  normalization_version TEXT,
  parent_asset_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_job ON media_assets(source_job_id);

CREATE TABLE IF NOT EXISTS imagination_worlds (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worlds_owner ON imagination_worlds(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- coloring|card-art|upload|editor
  title TEXT NOT NULL,
  current_revision_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (world_id) REFERENCES imagination_worlds(id)
);

CREATE INDEX IF NOT EXISTS idx_artworks_world ON artworks(world_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS artwork_revisions (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  parent_revision_id TEXT,
  media_asset_id TEXT NOT NULL,
  source_job_id TEXT UNIQUE,
  prompt TEXT,
  instruction TEXT,
  input_revision_ids_json TEXT NOT NULL DEFAULT '[]',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (artwork_id) REFERENCES artworks(id),
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id)
);

CREATE INDEX IF NOT EXISTS idx_artwork_revisions_artwork ON artwork_revisions(artwork_id, created_at DESC);

CREATE TABLE IF NOT EXISTS world_characters (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pinned_revision_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (world_id) REFERENCES imagination_worlds(id)
);

CREATE INDEX IF NOT EXISTS idx_characters_world ON world_characters(world_id);

CREATE TABLE IF NOT EXISTS card_documents (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  title TEXT NOT NULL,
  current_revision_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (world_id) REFERENCES imagination_worlds(id)
);

CREATE INDEX IF NOT EXISTS idx_card_documents_world ON card_documents(world_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS card_revisions (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  parent_revision_id TEXT,
  artwork_revision_id TEXT,
  source_job_id TEXT UNIQUE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (card_id) REFERENCES card_documents(id)
);

CREATE INDEX IF NOT EXISTS idx_card_revisions_card ON card_revisions(card_id, created_at DESC);

-- Daily credit reservation: abort if budget row missing or over limit.
CREATE TRIGGER IF NOT EXISTS trg_creation_jobs_reserve_before
BEFORE INSERT ON creation_jobs
WHEN NEW.budget_state = 'reserved' AND NEW.reserved_credits > 0
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM daily_budgets
      WHERE owner_id = NEW.owner_id
        AND day = strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch')
    )
    THEN RAISE(ABORT, 'budget_missing')
  END;
  SELECT CASE
    WHEN (
      SELECT reserved + used + NEW.reserved_credits
      FROM daily_budgets
      WHERE owner_id = NEW.owner_id
        AND day = strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch')
    ) > (
      SELECT credit_limit FROM daily_budgets
      WHERE owner_id = NEW.owner_id
        AND day = strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch')
    )
    THEN RAISE(ABORT, 'budget_exceeded')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_creation_jobs_reserve_after
AFTER INSERT ON creation_jobs
WHEN NEW.budget_state = 'reserved' AND NEW.reserved_credits > 0
BEGIN
  UPDATE daily_budgets
  SET reserved = reserved + NEW.reserved_credits
  WHERE owner_id = NEW.owner_id
    AND day = strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch');
END;

-- Settlement: move reserved -> used for charged amount; release remainder. Only once.
CREATE TRIGGER IF NOT EXISTS trg_creation_jobs_settle
AFTER UPDATE OF budget_state ON creation_jobs
WHEN OLD.budget_state = 'reserved' AND NEW.budget_state = 'settled'
BEGIN
  UPDATE daily_budgets
  SET
    reserved = MAX(0, reserved - OLD.reserved_credits),
    used = used + NEW.charged_credits
  WHERE owner_id = NEW.owner_id
    AND day = strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch');
END;

-- Full release without charging (known no-charge cancel / invalid before provider)
CREATE TRIGGER IF NOT EXISTS trg_creation_jobs_release
AFTER UPDATE OF budget_state ON creation_jobs
WHEN OLD.budget_state = 'reserved' AND NEW.budget_state = 'released'
BEGIN
  UPDATE daily_budgets
  SET reserved = MAX(0, reserved - OLD.reserved_credits)
  WHERE owner_id = NEW.owner_id
    AND day = strftime('%Y-%m-%d', NEW.created_at / 1000, 'unixepoch');
END;
