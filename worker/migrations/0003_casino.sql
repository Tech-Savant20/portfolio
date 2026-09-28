-- The casino (/casino): blackjack for aura points. The Worker deals and scores
-- every hand, so none of this is ever written by the browser.

-- A player is a nickname plus a session token (only its hash is kept), and the
-- player's own shoe of cards, reshuffled when it runs low.
CREATE TABLE IF NOT EXISTS casino_players (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  nickname     TEXT NOT NULL,
  nickname_key TEXT NOT NULL UNIQUE, -- lower-cased, so names are unique ignoring case
  shoe         TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL
);

-- Aura per player per weekly season (keyed by the Monday it starts, India time).
CREATE TABLE IF NOT EXISTS casino_scores (
  season     TEXT    NOT NULL,
  player_id  TEXT    NOT NULL,
  aura       INTEGER NOT NULL,
  hands      INTEGER NOT NULL DEFAULT 0,
  best       INTEGER NOT NULL,
  refill_day TEXT,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (season, player_id)
);
CREATE INDEX IF NOT EXISTS casino_scores_board ON casino_scores (season, aura DESC);

-- Hands: the one in play (done = 0) and recent finished ones.
CREATE TABLE IF NOT EXISTS casino_hands (
  id         TEXT    PRIMARY KEY,
  player_id  TEXT    NOT NULL,
  season     TEXT    NOT NULL,
  state      TEXT    NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS casino_hands_open ON casino_hands (player_id, done);

-- Each finished season's winner.
CREATE TABLE IF NOT EXISTS casino_champions (
  season   TEXT    PRIMARY KEY,
  nickname TEXT    NOT NULL,
  aura     INTEGER NOT NULL
);
