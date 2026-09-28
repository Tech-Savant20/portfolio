import { json, methodNotAllowed, sameSite } from "./http";

/**
 * The visit counter behind the terminal's `visits` command.
 *
 *   POST /api/visits  count one visit (a page sends it once per browser session)
 *   GET  /api/visits  { total, today, since }, cached at the edge for a minute
 *
 * A visit is a browser session that ran the page's scripts, so crawlers that
 * don't run JavaScript aren't counted. Only the day's total is stored: no IP,
 * no cookie, nothing about the visitor. Posts must come from the site's own
 * pages and are rate limited per IP, so the number is hard to pump by hand.
 */

const istDay = (ms = Date.now()) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
const CACHE_S = 60;

export async function visits(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "POST") return count(request, env);
  if (request.method === "GET" || request.method === "HEAD") return totals(request, env, ctx);
  return methodNotAllowed("GET, POST");
}

async function count(request: Request, env: Env): Promise<Response> {
  if (!sameSite(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.VISIT_LIMITER.limit({ key: ip });
  if (!success) return new Response(null, { status: 204 });
  await env.UPTIME.prepare(
    "INSERT INTO visits_daily (day, visits) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET visits = visits + 1",
  )
    .bind(istDay())
    .run();
  return new Response(null, { status: 204 });
}

async function totals(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(new URL("/api/visits", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const row = await env.UPTIME.prepare(
    "SELECT COALESCE(SUM(visits), 0) AS total, MIN(day) AS since, COALESCE(SUM(CASE WHEN day = ?1 THEN visits END), 0) AS today FROM visits_daily",
  )
    .bind(istDay())
    .first<{ total: number; since: string | null; today: number }>();
  const res = json(
    { ok: true, total: row?.total ?? 0, today: row?.today ?? 0, since: row?.since ?? null },
    200,
    { "cache-control": `public, max-age=${CACHE_S}` },
  );
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
