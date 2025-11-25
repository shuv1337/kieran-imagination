-- LLM request logging table
CREATE TABLE llm_requests (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  request_type TEXT NOT NULL,  -- 'generate', 'edit', 'upscale', 'suggestions', 'improve-prompt'
  model TEXT NOT NULL,
  prompt TEXT,
  has_input_image INTEGER DEFAULT 0,
  duration_ms INTEGER,
  success INTEGER NOT NULL,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  generated_image_id TEXT,
  FOREIGN KEY (generated_image_id) REFERENCES generated_images(id)
);

CREATE INDEX idx_llm_requests_timestamp ON llm_requests(timestamp DESC);
CREATE INDEX idx_llm_requests_request_type ON llm_requests(request_type);
CREATE INDEX idx_llm_requests_model ON llm_requests(model);
CREATE INDEX idx_llm_requests_ip ON llm_requests(ip_address);
