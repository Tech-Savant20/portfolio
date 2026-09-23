-- One row per service per day (IST). Every status push adds 1 to `total` and,
-- if the service was up, 1 to `up`. The row server '_', name 'reports' counts
-- the pushes themselves, so a day with the home server offline shows as a gap.
CREATE TABLE IF NOT EXISTS uptime_daily (
  day    TEXT    NOT NULL, -- YYYY-MM-DD in Asia/Kolkata
  server TEXT    NOT NULL,
  name   TEXT    NOT NULL,
  up     INTEGER NOT NULL DEFAULT 0,
  total  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, server, name)
) WITHOUT ROWID;
