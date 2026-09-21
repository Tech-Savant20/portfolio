// Captures screenshots of the live LastMile IQ demo for the portfolio.
// Usage: node scripts/capture-lastmile.mjs <outDir>
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const BASE = "https://last-mile-delivery-tracker-mocha-three.vercel.app";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const out = process.argv[2] ?? "screens";
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

const settle = () => new Promise((r) => setTimeout(r, 1500));
// The demo's database can be cold; wait until loading placeholders are gone.
const loaded = () =>
  page
    .waitForFunction(() => !/Loading shipments|Fetching real-time|Loading\.\.\./i.test(document.body.innerText), {
      timeout: 45_000,
    })
    .catch(() => console.warn("  still loading after 45s"));
const shot = async (name) => {
  await loaded();
  await settle();
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("captured", name);
};
const login = async (roleKey) => {
  const res = await page.evaluate(async (key) => {
    const r = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleKey: key }),
    });
    return r.status;
  }, roleKey);
  console.log("demo login", roleKey, res);
};

await page.goto(BASE, { waitUntil: "networkidle2", timeout: 90_000 });
await shot("home");

await login("admin");
await page.goto(BASE, { waitUntil: "networkidle2" });
await shot("admin");
await page.evaluate(() => window.scrollTo(0, 700));
await shot("admin-scrolled");

await page.goto(`${BASE}/track/TRK-984210`, { waitUntil: "networkidle2" });
await shot("tracking");

await login("customer_b2c");
await page.goto(BASE, { waitUntil: "networkidle2" });
await shot("customer");

await login("agent_north");
await page.goto(BASE, { waitUntil: "networkidle2" });
await shot("agent");

await browser.close();
