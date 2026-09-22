/**
 * abhyudaytomar.com API. Static pages are served by Workers static assets;
 * only /api/* reaches this code.
 *
 *   GET  /api/status   latest homelab status, for the live map
 *   POST /api/status   the home server pushes a new status (bearer token)
 *   POST /api/contact  contact form: Turnstile check, archive in Supabase, email to me
 */

const STATUS_KEY = "homelab:status";
const MAX_STATUS_BYTES = 64 * 1024;
const MAX_CONTACT_BYTES = 16 * 1024;

interface ServiceStatus {
  name: string;
  server: string;
  up: boolean;
}

interface StoredStatus {
  updatedAt: string;
  services: ServiceStatus[];
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/status") {
        if (request.method === "GET" || request.method === "HEAD") return await getStatus(env);
        if (request.method === "POST") return await putStatus(request, env);
        return methodNotAllowed("GET, POST");
      }
      if (url.pathname === "/api/contact") {
        if (request.method === "POST") return await contact(request, env);
        return methodNotAllowed("POST");
      }
      if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "not_found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error("unhandled", err);
      return json({ ok: false, error: "server" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------- status

async function getStatus(env: Env): Promise<Response> {
  const stored = await env.STATUS.get<StoredStatus>(STATUS_KEY, { type: "json", cacheTtl: 60 });
  const headers = { "cache-control": "public, max-age=30" };
  if (!stored) return json({ available: false }, 200, headers);
  const up = stored.services.filter((s) => s.up).length;
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(stored.updatedAt)) / 1000));
  return json(
    {
      available: true,
      updatedAt: stored.updatedAt,
      ageSeconds,
      summary: { up, total: stored.services.length },
      services: stored.services,
    },
    200,
    headers,
  );
}

async function putStatus(request: Request, env: Env): Promise<Response> {
  if (!env.STATUS_TOKEN || !(await bearerMatches(request, env.STATUS_TOKEN))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const body = await readBody(request, MAX_STATUS_BYTES);
  if (body === null) return json({ ok: false, error: "too_large" }, 413);

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const services = parseServices(data);
  if (!services) return json({ ok: false, error: "invalid_payload" }, 422);

  // The Worker stamps the time itself rather than trusting the server's clock.
  const stored: StoredStatus = { updatedAt: new Date().toISOString(), services };
  await env.STATUS.put(STATUS_KEY, JSON.stringify(stored));
  return new Response(null, { status: 204 });
}

function parseServices(data: unknown): ServiceStatus[] | null {
  if (!data || typeof data !== "object" || !Array.isArray((data as { services?: unknown }).services)) return null;
  const list = (data as { services: unknown[] }).services;
  if (list.length === 0 || list.length > 200) return null;
  const out: ServiceStatus[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") return null;
    const { name, server, up } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof server !== "string" || typeof up !== "boolean") return null;
    const cleanName = name.trim().slice(0, 64);
    const cleanServer = server.trim().toLowerCase().slice(0, 32);
    if (!cleanName || !/^[a-z0-9-]+$/.test(cleanServer)) return null;
    out.push({ name: cleanName, server: cleanServer, up });
  }
  return out;
}

// --------------------------------------------------------------------------- contact

interface ContactInput {
  name: string;
  email: string;
  message: string;
  company: string;
  token: string;
}

/**
 * Supabase, where every submission is kept. Both are Worker secrets
 * (`wrangler secret put`); without them the form still works and still emails.
 */
interface SupabaseEnv {
  SUPABASE_URL?: string;
  /** A secret key (sb_secret_...) or a legacy service_role key. */
  SUPABASE_SECRET_KEY?: string;
}

async function contact(request: Request, env: Env): Promise<Response> {
  const allowedHosts = hostnames(env);
  const origin = request.headers.get("origin");
  if (!origin || !allowedHosts.has(safeHost(origin))) return json({ ok: false, error: "forbidden" }, 403);

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success: underLimit } = await env.CONTACT_LIMITER.limit({ key: ip });
  if (!underLimit) return json({ ok: false, error: "rate_limited" }, 429);

  const body = await readBody(request, MAX_CONTACT_BYTES);
  if (body === null) return json({ ok: false, error: "too_large" }, 413);

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const input: ContactInput = {
    name: str(raw.name).trim(),
    email: str(raw.email).trim(),
    message: str(raw.message).trim(),
    company: str(raw.company),
    token: str(raw.token),
  };

  // Honeypot: bots fill every field. Pretend it worked and send nothing.
  if (input.company) return json({ ok: true });

  const fields: Record<string, string> = {};
  if (!input.name || input.name.length > 100) fields.name = "Please add your name (up to 100 characters).";
  if (input.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    fields.email = "That email address doesn't look right.";
  if (input.message.length < 10 || input.message.length > 4000)
    fields.message = "Messages need 10 to 4,000 characters.";
  if (Object.keys(fields).length) return json({ ok: false, error: "invalid", fields }, 422);

  const verified = await verifyTurnstile(input.token, ip, env, allowedHosts);
  if (!verified) return json({ ok: false, error: "verification" }, 403);

  // Archive first: if the mail hop fails, the message is still on record.
  await archive(env, input, request);

  const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ");
  try {
    await env.EMAIL.send({
      to: env.CONTACT_TO,
      from: { email: env.CONTACT_FROM, name: "abhyudaytomar.com" },
      replyTo: { email: input.email, name: oneLine(input.name) },
      subject: `Portfolio message from ${oneLine(input.name).slice(0, 80)}`,
      text: `${input.message}\n\n--\nFrom: ${input.name} <${input.email}>\nSent from the contact form on abhyudaytomar.com`,
      html: `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p><hr><p>From: ${escapeHtml(input.name)} &lt;${escapeHtml(input.email)}&gt;<br>Sent from the contact form on abhyudaytomar.com</p>`,
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? "unknown";
    console.error("email send failed", code);
    return json({ ok: false, error: "send" }, 502);
  }
  return json({ ok: true });
}

/**
 * Writes the message to Supabase with the secret key, which bypasses row level
 * security (the table grants nobody else anything). Delivery is the email's
 * job, so a failure here is logged and the visitor still gets an "ok".
 */
async function archive(env: Env, input: ContactInput, request: Request): Promise<void> {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = env as Env & SupabaseEnv;
  if (!url || !key) return;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/contact_messages`, {
      method: "POST",
      headers: {
        apikey: key,
        // New sb_secret_ keys aren't JWTs and belong in apikey alone; a legacy
        // service_role JWT also goes in Authorization.
        ...(key.startsWith("sb_") ? {} : { authorization: `Bearer ${key}` }),
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        message: input.message,
        country: request.cf?.country ?? null,
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("supabase insert failed", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("supabase insert failed", err);
  }
}

/** Canonical Turnstile siteverify. Fails closed on any error. */
async function verifyTurnstile(token: string, ip: string, env: Env, allowedHosts: Set<string>): Promise<boolean> {
  if (!token || token.length > 2048 || !env.TURNSTILE_SECRET || allowedHosts.size === 0) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const result = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
      metadata?: { result_with_testing_key?: boolean };
    };
    // Cloudflare's test keys report no action. Accept them only where
    // TURNSTILE_ALLOW_TEST_KEYS is set, which is .dev.vars and never production.
    const testKey = env.TURNSTILE_ALLOW_TEST_KEYS === "true" && result.metadata?.result_with_testing_key === true;
    return result.success === true && (result.action === "contact" || testKey) && allowedHosts.has(result.hostname ?? "");
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------- helpers

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...headers },
  });
}

function methodNotAllowed(allow: string): Response {
  return json({ ok: false, error: "method_not_allowed" }, 405, { allow });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function hostnames(env: Env): Set<string> {
  return new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h: string) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function safeHost(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Reads the body as text, refusing anything over the limit. */
async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).byteLength > limit ? null : text;
}

async function bearerMatches(request: Request, expected: string): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Hash both sides so the comparison is constant-time regardless of length.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b) && given.length > 0;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
