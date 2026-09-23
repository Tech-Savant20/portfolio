-- The latest report from each server that pushes status (Jarvis, vault-server).
-- GET /api/status merges the fresh ones. This replaces the single KV key, which
-- couldn't take two pushers inside the free plan's 1,000 KV writes a day.
CREATE TABLE IF NOT EXISTS latest_status (
  source     TEXT PRIMARY KEY, -- which server sent it, e.g. jarvis
  updated_at TEXT NOT NULL,    -- ISO time, stamped by the Worker
  services   TEXT NOT NULL     -- JSON: [{ name, server, up }]
);
