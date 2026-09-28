// Screenshots of the live site for the README tour video (video/index.html).
// Usage: node video/capture.mjs [baseUrl]
import puppeteer from "puppeteer-core";
import { copyFile, mkdir } from "node:fs/promises";

const base = process.argv[2] ?? "https://abhyudaytomar.com";
const here = new URL(".", import.meta.url);
const out = new URL("assets/shots/", here);
const fonts = new URL("assets/fonts/", here);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
await mkdir(out, { recursive: true });
await mkdir(fonts, { recursive: true });

// The composition uses Geist and Geist Mono from the site's own font packages.
for (const [pkg, file] of [
  ["geist", "geist-latin-wght-normal.woff2"],
  ["geist-mono", "geist-mono-latin-wght-normal.woff2"],
]) {
  await copyFile(new URL(`../node_modules/@fontsource-variable/${pkg}/files/${file}`, here), new URL(file, fonts));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open({ width = 1440, height = 900, dark = false, mobile = false, dpr = 1.5 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "no-preference" },
    { name: "prefers-color-scheme", value: dark ? "dark" : "light" },
  ]);
  return page;
}
// The preloader plays once per session on home pages, so give each page time to settle.
const visit = async (page, path, ms = 6000) => {
  await page.goto(base + path, { waitUntil: "networkidle0", timeout: 60000 });
  await wait(ms);
};
const scrollTo = async (page, selector, offset = 0, ms = 2000) => {
  await page.evaluate(
    (sel, off) => {
      const el = document.querySelector(sel);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + off, behavior: "instant" });
    },
    selector,
    offset,
  );
  await wait(ms);
};
const shot = async (page, name) => {
  await page.screenshot({ path: new URL(`${name}.jpg`, out), type: "jpeg", quality: 90 });
  console.log("shot", name);
};

// Light: hero, work, journey, credentials, terminal.
let page = await open();
await visit(page, "/");
await shot(page, "hero-light");
await scrollTo(page, "#work", 300);
await shot(page, "work-1");
await scrollTo(page, "#journey", 3200, 3500);
await shot(page, "journey-3");
await scrollTo(page, "#credentials", 0, 12000);
await shot(page, "creds-2");
await page.evaluate(() => window.scrollTo(0, 0));
await wait(1200);
await page.keyboard.press("Backquote");
await wait(900);
for (const cmd of ["help", "ping jarvis"]) {
  await page.keyboard.type(cmd, { delay: 40 });
  await page.keyboard.press("Enter");
  await wait(2000);
}
await shot(page, "terminal");
await page.close();

// Dark: the cloud and AI views, homelab, a case study, status.
page = await open({ dark: true });
await visit(page, "/cloud");
await shot(page, "hero-dark-cloud");
await scrollTo(page, "#homelab", 60, 5000);
await shot(page, "homelab-dark");
await visit(page, "/ai", 4000);
await shot(page, "hero-dark-ai");
await visit(page, "/work/lastmile-iq", 2500);
await shot(page, "case-top");
await visit(page, "/status", 3000);
await shot(page, "status");
await page.close();

// Game mode and the casino. Game mode is remembered, so the phone shot below has it too.
page = await open();
await visit(page, "/");
await page.click("[data-game-toggle]");
await wait(3500);
await shot(page, "game-mode");
await visit(page, "/casino", 3500);
await shot(page, "casino");
await page.close();

page = await open({ width: 390, height: 844, mobile: true, dpr: 3 });
await visit(page, "/");
await shot(page, "m-hero");
await page.close();

await browser.close();
