-- Visits to the site, one row per day (India time). A visit is one browser
-- session that ran the page's scripts; see worker/visits.ts.
CREATE TABLE visits_daily (
  day TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0
);
