// Renders the Open Graph cards (public/og/*.png) and the Apple touch icon
// from HTML templates, using the site's own fonts and portrait.
// Usage: node scripts/make-images.mjs
import puppeteer from "puppeteer-core";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = resolve(".");
const url = (p) => pathToFileURL(join(root, p)).href;

const fonts = `
@font-face { font-family: Geist; src: url(${url("node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: GeistMono; src: url(${url("node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 900; }
`;

const base = (body, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; }
body { background: #0d0d0e; color: #ededea; font-family: Geist; overflow: hidden; position: relative; }
.pad { position: absolute; inset: 64px 72px; display: flex; flex-direction: column; }
.meta { font-family: GeistMono; font-size: 22px; color: #a6a6aa; letter-spacing: 0.02em; }
.url { font-family: GeistMono; font-size: 22px; color: #a6a6aa; margin-top: auto; }
.url b { color: #ff5a1f; font-weight: 500; }
${extra}
</style></head><body>${body}</body></html>`;

const cards = [];

const roleCards = [
  { key: "backend", title: "Backend engineer", line: "APIs, data models and the business logic between them." },
  { key: "cloud", title: "Cloud engineer", line: "A three-server homelab with 20+ containers, monitored and backed up." },
  { key: "ai", title: "Applied ML engineer", line: "Models evaluated honestly, and LLM features in real apps." },
];
for (const r of roleCards) {
  cards.push({
    name: r.key,
    html: base(
      `<img class="portrait" src="${url("src/assets/portrait.png")}">
       <div class="pad">
         <p class="meta">B.Tech CSE, VIT Bhopal. Graduating 2027</p>
         <h1>Abhyuday<br>Tomar</h1>
         <p class="role">${r.title}</p>
         <p class="line">${r.line}</p>
         <p class="url"><b>abhyudaytomar.com</b></p>
       </div>`,
      `.portrait { position: absolute; right: -10px; bottom: 0; height: 560px; }
       h1 { font-size: 118px; line-height: 0.9; letter-spacing: -0.055em; font-weight: 700; margin-top: 28px; }
       .role { margin-top: 28px; font-size: 40px; font-weight: 600; letter-spacing: -0.03em; color: #ff5a1f; }
       .line { margin-top: 10px; font-size: 26px; color: #a6a6aa; max-width: 560px; line-height: 1.3; }`,
    ),
  });
}

const studies = [
  { slug: "lastmile-iq", name: "LastMile IQ", kind: "Logistics backend", stats: [["16", "API routes"], ["9", "Prisma models"], ["3", "roles"]] },
  { slug: "jarvis-homelab", name: "Jarvis homelab", kind: "Hybrid cloud homelab", stats: [["3", "servers"], ["20+", "containers"], ["₹0", "a month"]] },
  { slug: "docpilot", name: "DocPilot", kind: "Clinic platform, team of six", stats: [["190", "lines of rules"], ["5", "collections"], ["2", "roles"]] },
  { slug: "retinopathy", name: "Retinopathy classifier", kind: "Computer vision", stats: [["76.5%", "accuracy"], ["0.76", "weighted kappa"], ["3,662", "images"]] },
];
for (const s of studies) {
  cards.push({
    name: s.slug,
    html: base(
      `<div class="pad">
         <p class="meta">Case study. ${s.kind}</p>
         <h1>${s.name}</h1>
         <div class="stats">${s.stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
         <p class="url"><b>abhyudaytomar.com</b>/work/${s.slug}</p>
       </div>
       <div class="glow"></div>`,
      `h1 { font-size: ${s.name.length > 14 ? 104 : 132}px; line-height: 0.92; letter-spacing: -0.055em; font-weight: 700; margin-top: 36px; max-width: 1000px; }
       .stats { display: flex; gap: 64px; margin-top: 44px; }
       .stats div { display: flex; flex-direction: column; gap: 6px; border-top: 3px solid #ededea; padding-top: 16px; min-width: 180px; }
       .stats b { font-size: 56px; font-weight: 650; letter-spacing: -0.04em; line-height: 1; }
       .stats span { font-size: 22px; color: #a6a6aa; }
       .glow { position: absolute; right: -180px; top: -220px; width: 620px; height: 620px; border-radius: 50%; background: radial-gradient(circle, rgba(255,90,31,0.35), transparent 65%); }`,
    ),
  });
}

const tmp = join(tmpdir(), "portfolio-og");
await mkdir(tmp, { recursive: true });
await mkdir("public/og", { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

for (const card of cards) {
  const file = join(tmp, `${card.name}.html`);
  await writeFile(file, card.html);
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/og/${card.name}.png` });
  console.log("og", card.name);
}

// Apple touch icon: the monogram, 180x180.
const icon = join(tmp, "icon.html");
await writeFile(
  icon,
  `<!doctype html><html><head><style>${fonts} html,body{margin:0;width:180px;height:180px;background:#0d0d0e;display:grid;place-items:center}
   span{font-family:GeistMono;font-weight:600;font-size:64px;color:#ededea;letter-spacing:0.02em}
   i{position:absolute;right:34px;bottom:34px;width:18px;height:18px;border-radius:50%;background:#ff5a1f}</style></head>
   <body><span>AT</span><i></i></body></html>`,
);
await page.setViewport({ width: 180, height: 180, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(icon).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "public/apple-touch-icon.png" });
console.log("apple-touch-icon");

await browser.close();
await rm(tmp, { recursive: true, force: true });
