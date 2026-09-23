// Runs after `astro build`. Writes dist/_headers for Workers static assets:
// security headers, a Content-Security-Policy whose script-src lists the
// SHA-256 of every inline script in the built pages, and long caching for
// fingerprinted assets.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

// Executable inline scripts only: no src, and a JS type (or none).
const INLINE = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
const hashes = new Set();
let pages = 0;
for await (const file of htmlFiles(DIST)) {
  pages++;
  const html = await readFile(file, "utf8");
  for (const [, attrs, body] of html.matchAll(INLINE)) {
    const type = /\btype=["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== "module" && type !== "text/javascript") continue;
    if (!body.trim()) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].join(" ")} https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
  // Inline style attributes carry per-element CSS variables and Shiki colours.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/og/*
  Cache-Control: public, max-age=86400

/llms.txt
  Content-Type: text/plain; charset=utf-8
`;

await writeFile(join(DIST, "_headers"), headers);
console.log(`postbuild: _headers written (${pages} pages, ${hashes.size} inline script hash${hashes.size === 1 ? "" : "es"})`);
