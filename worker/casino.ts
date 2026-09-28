import {
  MIN_BET,
  REFILL_AURA,
  RESHUFFLE_BELOW,
  START_AURA,
  dealerPlays,
  freshDeck,
  handValue,
  isBlackjack,
  isBust,
  settle,
  shuffle,
  validBet,
  type Card,
  type Outcome,
} from "../src/lib/blackjack";
import { hostnames, json, methodNotAllowed, readBody, sameSite, str, verifyTurnstile } from "./http";

/**
 * The casino API. Every card is dealt here, from a per-player shoe shuffled
 * with crypto randomness, and every result is scored here; the browser only
 * sends a bet and hit / stand / double. Aura is just for fun: there is nothing
 * to buy and nothing to win.
 *
 *   GET  /api/casino/me      your aura, rank and any hand in play (or player: null)
 *   GET  /api/casino/board   this week's top 10 and last week's champion
 *   POST /api/casino/join    { nickname, token }  (Turnstile) → session cookie
 *   POST /api/casino/deal    { bet }
 *   POST /api/casino/act     { action: "hit" | "stand" | "double" }
 *   POST /api/casino/refill  once a day, when you can't cover the minimum bet
 */

const COOKIE = "aura";
const MAX_BODY = 2 * 1024;
const NICK = /^[A-Za-z0-9 _-]{3,16}$/;
// A short list of words that shouldn't sit on a public leaderboard.
const BLOCKED = /fuck|shit|cunt|nigg|fag|bitch|rape|nazi|hitler|chutiya|madarchod|bhenchod|randi|gandu/i;

interface Player {
  id: string;
  nickname: string;
  shoe: string;
}

interface Score {
  aura: number;
  hands: number;
  best: number;
  refill_day: string | null;
}

interface HandState {
  bet: number;
  player: Card[];
  dealer: Card[];
  doubled: boolean;
  outcome?: Outcome;
  payout?: number;
}

// ------------------------------------------------------------------- time and ids

/** India time, as the site uses everywhere. */
const ist = (ms = Date.now()) => new Date(ms + 5.5 * 3600_000);
const istDay = (ms = Date.now()) => ist(ms).toISOString().slice(0, 10);
/** The Monday a week's season starts on, e.g. "2026-09-28". */
function seasonOf(ms = Date.now()): string {
  const d = ist(ms);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400_000).toISOString().slice(0, 10);
}
const prevSeason = (season: string) =>
  new Date(Date.parse(`${season}T00:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** Unbiased integer in [0, n), from crypto randomness. */
function randomInt(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

// ------------------------------------------------------------------------ routing

export async function casino(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const route = url.pathname.slice("/api/casino/".length);
  const get = request.method === "GET" || request.method === "HEAD";

  if (route === "board") return get ? board(request, env, ctx) : methodNotAllowed("GET");
  if (route === "me") return get ? me(request, env) : methodNotAllowed("GET");

  if (!["join", "deal", "act", "refill"].includes(route)) return json({ ok: false, error: "not_found" }, 404);
  if (request.method !== "POST") return methodNotAllowed("POST");
  // Cookie-authenticated writes: only from the site's own pages.
  if (!sameSite(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.CASINO_LIMITER.limit({ key: ip });
  if (!success) return json({ ok: false, error: "rate_limited" }, 429);

  const body = await readBody(request, MAX_BODY);
  if (body === null) return json({ ok: false, error: "too_large" }, 413);
  let data: Record<string, unknown> = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (route === "join") return join(request, env, data, ip);
  const player = await playerFrom(request, env);
  if (!player) return json({ ok: false, error: "no_session" }, 401);
  if (route === "deal") return deal(env, player, data.bet);
  if (route === "act") return act(env, player, str(data.action));
  return refill(env, player);
}

// ------------------------------------------------------------------------ players

async function playerFrom(request: Request, env: Env): Promise<Player | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`))?.[1];
  if (!token) return null;
  return env.UPTIME.prepare("SELECT id, nickname, shoe FROM casino_players WHERE token_hash = ?1")
    .bind(await sha256(token))
    .first<Player>();
}

/** This season's score row, created on the first visit of the week. */
async function scoreOf(env: Env, playerId: string, season = seasonOf()): Promise<Score> {
  const row = await env.UPTIME.prepare(
    "SELECT aura, hands, best, refill_day FROM casino_scores WHERE season = ?1 AND player_id = ?2",
  )
    .bind(season, playerId)
    .first<Score>();
  if (row) return row;
  await env.UPTIME.prepare(
    `INSERT INTO casino_scores (season, player_id, aura, hands, best, updated_at) VALUES (?1, ?2, ?3, 0, ?3, ?4)
     ON CONFLICT (season, player_id) DO NOTHING`,
  )
    .bind(season, playerId, START_AURA, new Date().toISOString())
    .run();
  return { aura: START_AURA, hands: 0, best: START_AURA, refill_day: null };
}

async function join(request: Request, env: Env, data: Record<string, unknown>, ip: string): Promise<Response> {
  const nickname = str(data.nickname).trim().replace(/\s+/g, " ");
  if (!NICK.test(nickname) || BLOCKED.test(nickname.replace(/[\s_-]/g, ""))) {
    return json({ ok: false, error: "nickname", message: "3–16 letters, numbers, spaces, - or _, and keep it clean." }, 422);
  }
  if (!(await verifyTurnstile(str(data.token), ip, env, hostnames(env), "casino"))) {
    return json({ ok: false, error: "verification" }, 403);
  }
  const token = randomToken();
  const id = crypto.randomUUID();
  try {
    await env.UPTIME.prepare(
      "INSERT INTO casino_players (id, token_hash, nickname, nickname_key, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
      .bind(id, await sha256(token), nickname, nickname.toLowerCase(), new Date().toISOString())
      .run();
  } catch {
    return json({ ok: false, error: "nickname_taken", message: "That name is taken. Try another." }, 409);
  }
  const res = await me(new Request(request.url, { headers: { cookie: `${COOKIE}=${token}` } }), env);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  res.headers.append(
    "set-cookie",
    `${COOKIE}=${token}; Path=/api/casino; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`,
  );
  return res;
}

// ---------------------------------------------------------------------- the table

/** What the browser may see: the dealer's hole card stays hidden until the hand is over. */
function publicHand(h: HandState, done: boolean) {
  const dealer = done ? h.dealer : [h.dealer[0], null];
  return {
    bet: h.bet,
    player: h.player,
    dealer,
    playerTotal: handValue(h.player).total,
    dealerTotal: done ? handValue(h.dealer).total : handValue([h.dealer[0]]).total,
    done,
    outcome: h.outcome ?? null,
    payout: h.payout ?? null,
    canDouble: !done && h.player.length === 2 && !h.doubled,
  };
}

async function openHand(env: Env, playerId: string) {
  return env.UPTIME.prepare("SELECT id, state FROM casino_hands WHERE player_id = ?1 AND done = 0 LIMIT 1")
    .bind(playerId)
    .first<{ id: string; state: string }>();
}

async function me(request: Request, env: Env): Promise<Response> {
  const player = await playerFrom(request, env);
  const season = seasonOf();
  if (!player) return json({ ok: true, season, player: null }, 200, { "cache-control": "no-store" });
  const score = await scoreOf(env, player.id, season);
  const rank = await env.UPTIME.prepare("SELECT COUNT(*) AS n FROM casino_scores WHERE season = ?1 AND aura > ?2")
    .bind(season, score.aura)
    .first<{ n: number }>();
  const open = await openHand(env, player.id);
  return json(
    {
      ok: true,
      season,
      player: {
        nickname: player.nickname,
        aura: score.aura,
        hands: score.hands,
        best: score.best,
        rank: (rank?.n ?? 0) + 1,
        canRefill: score.aura < MIN_BET && score.refill_day !== istDay() && !open,
      },
      hand: open ? publicHand(JSON.parse(open.state), false) : null,
    },
    200,
    { "cache-control": "no-store" },
  );
}

/** Draws from the player's shoe, reshuffling a fresh deck when it runs low. */
function shoeFrom(raw: string) {
  let cards: Card[] = [];
  try {
    cards = JSON.parse(raw);
  } catch {}
  let shuffled = false;
  if (cards.length < RESHUFFLE_BELOW) {
    cards = shuffle(freshDeck(), randomInt);
    shuffled = true;
  }
  return {
    draw: () => {
      // Never runs dry mid-hand: a hand can't use 15 cards.
      if (!cards.length) cards = shuffle(freshDeck(), randomInt);
      return cards.pop()!;
    },
    save: () => JSON.stringify(cards),
    shuffled,
  };
}

async function deal(env: Env, player: Player, bet: unknown): Promise<Response> {
  const season = seasonOf();
  const open = await openHand(env, player.id);
  if (open) return json({ ok: false, error: "hand_in_progress", hand: publicHand(JSON.parse(open.state), false) }, 409);
  const score = await scoreOf(env, player.id, season);
  if (!validBet(bet, score.aura)) {
    return json({ ok: false, error: "bet", message: `Bets are ${MIN_BET}–500 aura, in 5s, and no more than you have.` }, 422);
  }

  const shoe = shoeFrom(player.shoe);
  const h: HandState = { bet, player: [], dealer: [], doubled: false };
  h.player.push(shoe.draw());
  h.dealer.push(shoe.draw());
  h.player.push(shoe.draw());
  h.dealer.push(shoe.draw());

  // A blackjack on either side ends the hand before anyone acts.
  const done = isBlackjack(h.player) || isBlackjack(h.dealer);
  let aura = score.aura - bet;
  if (done) {
    const r = settle(h.player, h.dealer, h.bet);
    h.outcome = r.outcome;
    h.payout = r.payout;
    aura += r.payout;
  }

  const now = new Date().toISOString();
  await env.UPTIME.batch([
    env.UPTIME.prepare("INSERT INTO casino_hands (id, player_id, season, state, done, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(
      crypto.randomUUID(),
      player.id,
      season,
      JSON.stringify(h),
      done ? 1 : 0,
      now,
    ),
    env.UPTIME.prepare("UPDATE casino_players SET shoe = ?1 WHERE id = ?2").bind(shoe.save(), player.id),
    env.UPTIME.prepare(
      `UPDATE casino_scores SET aura = ?1, hands = hands + ?2, best = MAX(best, ?1), updated_at = ?3
       WHERE season = ?4 AND player_id = ?5`,
    ).bind(aura, done ? 1 : 0, now, season, player.id),
    // Keep a week of finished hands; the rest is noise.
    env.UPTIME.prepare("DELETE FROM casino_hands WHERE player_id = ?1 AND done = 1 AND created_at < ?2").bind(
      player.id,
      new Date(Date.now() - 7 * 86400_000).toISOString(),
    ),
  ]);
  return json({ ok: true, aura, shuffled: shoe.shuffled, hand: publicHand(h, done) });
}

async function act(env: Env, player: Player, action: string): Promise<Response> {
  if (!["hit", "stand", "double"].includes(action)) return json({ ok: false, error: "action" }, 422);
  const open = await openHand(env, player.id);
  if (!open) return json({ ok: false, error: "no_hand" }, 409);
  const season = seasonOf();
  const score = await scoreOf(env, player.id, season);
  const h = JSON.parse(open.state) as HandState;
  const shoe = shoeFrom(player.shoe);
  let aura = score.aura;
  let stand = action === "stand";

  if (action === "double") {
    if (h.player.length !== 2 || h.doubled) return json({ ok: false, error: "cant_double" }, 409);
    if (aura < h.bet) return json({ ok: false, error: "bet", message: "Not enough aura to double." }, 422);
    aura -= h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.player.push(shoe.draw());
    stand = true;
  } else if (action === "hit") {
    h.player.push(shoe.draw());
    // 21 stands by itself; a bust ends the hand.
    if (handValue(h.player).total >= 21) stand = true;
  }

  let done = false;
  if (stand) {
    if (!isBust(h.player)) h.dealer = dealerPlays(h.dealer, shoe.draw);
    const r = settle(h.player, h.dealer, h.bet);
    h.outcome = r.outcome;
    h.payout = r.payout;
    aura += r.payout;
    done = true;
  }

  // Optimistic: only the request that still sees the old state wins.
  const upd = await env.UPTIME.prepare("UPDATE casino_hands SET state = ?1, done = ?2 WHERE id = ?3 AND state = ?4")
    .bind(JSON.stringify(h), done ? 1 : 0, open.id, open.state)
    .run();
  if (!upd.meta.changes) return json({ ok: false, error: "conflict" }, 409);

  const now = new Date().toISOString();
  await env.UPTIME.batch([
    env.UPTIME.prepare("UPDATE casino_players SET shoe = ?1 WHERE id = ?2").bind(shoe.save(), player.id),
    env.UPTIME.prepare(
      `UPDATE casino_scores SET aura = ?1, hands = hands + ?2, best = MAX(best, ?1), updated_at = ?3
       WHERE season = ?4 AND player_id = ?5`,
    ).bind(aura, done ? 1 : 0, now, season, player.id),
  ]);
  return json({ ok: true, aura, hand: publicHand(h, done) });
}

async function refill(env: Env, player: Player): Promise<Response> {
  const season = seasonOf();
  const score = await scoreOf(env, player.id, season);
  const today = istDay();
  if (score.aura >= MIN_BET) return json({ ok: false, error: "not_broke", message: "Refills are for when you're out of aura." }, 409);
  if (score.refill_day === today) return json({ ok: false, error: "refilled", message: "One refill a day. Back tomorrow." }, 409);
  const aura = score.aura + REFILL_AURA;
  await env.UPTIME.prepare(
    "UPDATE casino_scores SET aura = ?1, refill_day = ?2, updated_at = ?3 WHERE season = ?4 AND player_id = ?5",
  )
    .bind(aura, today, new Date().toISOString(), season, player.id)
    .run();
  return json({ ok: true, aura });
}

// --------------------------------------------------------------------- the board

async function board(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(new URL("/api/casino/board", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const season = seasonOf();
  const last = prevSeason(season);
  // The first look at the board in a new week crowns last week's leader.
  let champion = await env.UPTIME.prepare("SELECT nickname, aura FROM casino_champions WHERE season = ?1")
    .bind(last)
    .first<{ nickname: string; aura: number }>();
  if (!champion) {
    const top = await env.UPTIME.prepare(
      `SELECT p.nickname, s.aura FROM casino_scores s JOIN casino_players p ON p.id = s.player_id
       WHERE s.season = ?1 ORDER BY s.aura DESC, s.updated_at ASC LIMIT 1`,
    )
      .bind(last)
      .first<{ nickname: string; aura: number }>();
    if (top) {
      await env.UPTIME.prepare("INSERT OR IGNORE INTO casino_champions (season, nickname, aura) VALUES (?1, ?2, ?3)")
        .bind(last, top.nickname, top.aura)
        .run();
      champion = top;
    }
  }

  const { results } = await env.UPTIME.prepare(
    `SELECT p.nickname, s.aura, s.hands FROM casino_scores s JOIN casino_players p ON p.id = s.player_id
     WHERE s.season = ?1 AND s.hands > 0 ORDER BY s.aura DESC, s.updated_at ASC LIMIT 10`,
  )
    .bind(season)
    .all<{ nickname: string; aura: number; hands: number }>();

  const res = json({ ok: true, season, top: results, champion: champion ?? null }, 200, {
    "cache-control": "public, max-age=15",
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
