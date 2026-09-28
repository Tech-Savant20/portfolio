/** Small request/response helpers shared by the Worker's routes. */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...headers },
  });
}

export function methodNotAllowed(allow: string): Response {
  return json({ ok: false, error: "method_not_allowed" }, 405, { allow });
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The site's own hostnames: where Turnstile tokens and browser POSTs may come from. */
export function hostnames(env: Env): Set<string> {
  return new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h: string) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function safeHost(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** True when a browser request says it comes from one of the site's own pages. */
export function sameSite(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  return !!origin && hostnames(env).has(safeHost(origin));
}

/** Reads the body as text, refusing anything over the limit. */
export async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).byteLength > limit ? null : text;
}

/**
 * Canonical Turnstile siteverify. Fails closed on any error. `action` is the
 * widget's action ("contact", "casino"), so a token from one form can't be
 * spent on the other.
 */
export async function verifyTurnstile(
  token: string,
  ip: string,
  env: Env,
  allowedHosts: Set<string>,
  action: string,
): Promise<boolean> {
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
    return result.success === true && (result.action === action || testKey) && allowedHosts.has(result.hostname ?? "");
  } catch {
    return false;
  }
}
