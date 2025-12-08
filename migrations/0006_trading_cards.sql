-- Trading card metadata
CREATE TABLE trading_cards (
  id TEXT PRIMARY KEY,
  generated_image_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  rarity TEXT NOT NULL,
  card_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  stats JSON,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (generated_image_id) REFERENCES generated_images(id)
);

CREATE INDEX idx_trading_cards_theme ON trading_cards(theme);
CREATE INDEX idx_trading_cards_created_at ON trading_cards(created_at DESC);
