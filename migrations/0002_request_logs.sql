-- Migration number: 0002 	 2025-11-24T00:00:00.000Z
CREATE TABLE request_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER,
  prompt TEXT,
  error_message TEXT,
  user_agent TEXT,
  rate_limited INTEGER DEFAULT 0,
  generated_image_id TEXT,
  FOREIGN KEY (generated_image_id) REFERENCES generated_images(id)
);

CREATE INDEX idx_request_logs_timestamp ON request_logs(timestamp DESC);
CREATE INDEX idx_request_logs_ip_address ON request_logs(ip_address);
CREATE INDEX idx_request_logs_endpoint ON request_logs(endpoint);
