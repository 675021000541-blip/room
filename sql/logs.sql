CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username_attempt VARCHAR(100),
  event_type VARCHAR(50) NOT NULL,
  resource VARCHAR(200),
  resource_id VARCHAR(50),
  result VARCHAR(10) NOT NULL,
  ip VARCHAR(64),
  detail TEXT
);
CREATE INDEX idx_logs_created ON audit_logs(created_at);
CREATE INDEX idx_logs_user ON audit_logs(user_id);
CREATE INDEX idx_logs_event ON audit_logs(event_type);