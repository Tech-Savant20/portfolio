// Smoke test for the Worker API and static pages.
// Usage: node scripts/smoke-api.mjs [baseUrl] [statusToken]
//   local:  node scripts/smoke-api.mjs http://127.0.0.1:8787 local-dev-status-token
// Contact checks send real mail unless run against `wrangler dev` (which simulates it).
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const token = process.argv[3] ?? process.env.STATUS_TOKEN ?? "";
const origin = new URL(base).origin;
let failures = 0;

const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};
const req = (path, init = {}) => fetch(base + path, { redirect: "manual", ...init });
const post = (path, body, headers = {}) =>
  req(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

// ---- status ---------------------------------------------------------------------
let r = await post("/api/status", { services: [] });
check("status push without token is rejected", r.status === 401, r.status);
r = await post("/api/status", { services: [] }, { authorization: "Bearer wrong" });
check("status push with wrong token is rejected", r.status === 401, r.status);
if (token) {
  r = await post("/api/status", { services: [{ name: 1 }] }, { authorization: `Bearer ${token}` });
  check("malformed status payload is rejected", r.status === 422, r.status);
  const services = [
    { name: "Nextcloud", server: "jarvis", up: true },
    { name: "Media automation", server: "jarvis", up: true },
    { name: "Vaultwarden", server: "vault-server", up: true },
    { name: "Crafty Controller", server: "oracle-1", up: false },
  ];
  r = await post("/api/status", { source: "smoke!", services }, { authorization: `Bearer ${token}` });
  check("invalid source name is rejected", r.status === 422, r.status);
  // Pushed as "jarvis", like the real cron job; the answer merges every fresh
  // source and is cached for 30 seconds, so only its shape is checked here.
  r = await post("/api/status", { source: "jarvis", services }, { authorization: `Bearer ${token}` });
  check("valid status push is stored", r.status === 204, r.status);
  r = await req("/api/status");
  const s = await r.json();
  check("status reads back", s.available === true && Array.isArray(s.services) && Array.isArray(s.sources), JSON.stringify(s.summary));
  check("status has an age", typeof s.ageSeconds === "number", s.ageSeconds);
}
r = await req("/api/nope");
check("unknown API route is a JSON 404", r.status === 404 && (r.headers.get("content-type") ?? "").includes("json"), r.status);
r = await req("/api/contact");
check("GET on contact is 405", r.status === 405, r.status);

// ---- contact ----------------------------------------------------------------------
const good = { name: "Smoke Test", email: "smoke@example.com", message: "Testing the contact form end to end.", company: "", token: "XXXX.DUMMY.TOKEN.XXXX" };
r = await post("/api/contact", good);
check("contact without Origin is rejected", r.status === 403, r.status);
r = await post("/api/contact", good, { origin: "https://evil.example" });
check("contact from another origin is rejected", r.status === 403, r.status);
r = await post("/api/contact", { ...good, email: "nope", message: "short" }, { origin });
const bad = await r.json();
check("invalid fields come back per field", r.status === 422 && bad.fields?.email && bad.fields?.message, JSON.stringify(bad.fields));
r = await post("/api/contact", { ...good, company: "Spam Inc" }, { origin });
check("honeypot submissions look successful", r.status === 200, r.status);
r = await post("/api/contact", { ...good, token: "" }, { origin });
check("missing Turnstile token is rejected", r.status === 403, r.status);
if (base.includes("127.0.0.1") || base.includes("localhost")) {
  r = await post("/api/contact", good, { origin });
  const ok = await r.json();
  check("valid message is accepted (test key, simulated email)", r.status === 200 && ok.ok === true, `${r.status} ${JSON.stringify(ok)}`);
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) limited = (await post("/api/contact", good, { origin })).status === 429;
  check("contact form is rate limited", limited);
}

// ---- pages ------------------------------------------------------------------------
for (const path of ["/", "/cloud", "/ai", "/work/lastmile-iq", "/work/jarvis-homelab", "/work/docpilot", "/work/retinopathy"]) {
  r = await req(path);
  check(`page ${path}`, r.status === 200 && (r.headers.get("content-type") ?? "").includes("text/html"), r.status);
}
r = await req("/");
check("CSP header is set", (r.headers.get("content-security-policy") ?? "").includes("script-src 'self' 'sha256-"));
check("nosniff header is set", r.headers.get("x-content-type-options") === "nosniff");
r = await req("/definitely-not-here");
check("unknown page is a 404 with the custom page", r.status === 404 && (await r.text()).includes("This page doesn"), r.status);
r = await req("/sitemap-index.xml");
check("sitemap is served", r.status === 200, r.status);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
