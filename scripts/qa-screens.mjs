// Visual QA: screenshots of the built site in several modes, plus console errors.
// Usage: node scripts/qa-screens.mjs [baseUrl] [outDir]
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const out = process.argv[3] ?? "qa";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open({ width, height, dark = false, motion = true, mobile = false }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: motion ? "no-preference" : "reduce" },
    { name: "prefers-color-scheme", value: dark ? "dark" : "light" },
  ]);
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return page;
}
const scrollTo = async (page, selector, offset = 0) => {
  await page.evaluate(
    (sel, off) => {
      const el = document.querySelector(sel);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + off, behavior: "instant" });
    },
    selector,
    offset,
  );
  await wait(1200);
};
const shot = async (page, name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
};

// Desktop, light, full motion.
let page = await open({ width: 1440, height: 900 });
await page.goto(base + "/", { waitUntil: "networkidle0" });
await wait(1800);
await shot(page, "d-light-hero");
await scrollTo(page, "#work", 700);
await shot(page, "d-light-stack-1");
await scrollTo(page, "#work", 1700);
await shot(page, "d-light-stack-2");
await scrollTo(page, "#homelab", 60);
await wait(2500);
await shot(page, "d-light-homelab");
const has3d = await page.evaluate(() => document.querySelector("[data-homelab]")?.classList.contains("has-3d"));
console.log("3D active:", has3d);

// Role switch to cloud without a page load.
await page.evaluate(() => window.scrollTo(0, 0));
await wait(400);
await page.click('[data-role-switcher] a[data-role="cloud"]');
await wait(1600);
const afterSwitch = await page.evaluate(() => ({
  path: location.pathname,
  title: document.title,
  line: document.querySelector("[data-hero-title]")?.textContent,
  order: [...document.querySelectorAll("main > section")].map((s) => s.id || s.dataset.section || "hero"),
  skills: [...document.querySelectorAll("[data-skill-group]")].map((c) => c.dataset.skillGroup),
  canonical: document.querySelector("link[rel=canonical]")?.getAttribute("href"),
}));
console.log("after switch:", JSON.stringify(afterSwitch));
await shot(page, "d-light-cloud-hero");
await page.goBack();
await wait(1200);
console.log("after back:", await page.evaluate(() => [location.pathname, document.querySelector("[data-hero-title]")?.textContent].join(" ")));
await page.close();

// Desktop, dark.
page = await open({ width: 1440, height: 900, dark: true });
await page.goto(base + "/", { waitUntil: "networkidle0" });
await wait(1800);
await shot(page, "d-dark-hero");
await scrollTo(page, "#homelab", 60);
await wait(2500);
await shot(page, "d-dark-homelab");
await scrollTo(page, "#skills", 0);
await shot(page, "d-dark-skills");
await page.goto(base + "/work/retinopathy", { waitUntil: "networkidle0" });
await scrollTo(page, ".charts", -120);
await shot(page, "d-dark-charts");
await page.close();

// Phone, light.
page = await open({ width: 390, height: 844, mobile: true });
await page.goto(base + "/", { waitUntil: "networkidle0" });
await wait(1800);
await shot(page, "m-hero");
await scrollTo(page, "#work", 0);
await shot(page, "m-work");
await scrollTo(page, "#homelab", 0);
await shot(page, "m-homelab");
await scrollTo(page, "#contact", 0);
await shot(page, "m-contact");
await page.goto(base + "/work/lastmile-iq", { waitUntil: "networkidle0" });
await wait(800);
await shot(page, "m-case");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("mobile horizontal overflow (case study):", overflow);
await page.goto(base + "/", { waitUntil: "networkidle0" });
console.log(
  "mobile horizontal overflow (home):",
  await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
);
await page.close();

await browser.close();
console.log(errors.length ? `\nconsole errors/warnings:\n${[...new Set(errors)].join("\n")}` : "\nno console errors");
