/**
 * X-ray mode (type `xray` in the terminal): outlines each part of the page with
 * the component that renders it and what it runs, and a panel with the page's
 * real weight, read from the browser's own resource timing.
 */

const TARGETS: [string, string, string][] = [
  [".nav", "Nav.astro", "fixed · role switcher"],
  ["[data-hero]", "Hero.astro", "static HTML · scroll + pointer motion"],
  ["[data-section='homelab']", "HomelabSection.astro", "Three.js loads when near · live /api/status"],
  ["[data-section='work']", "WorkStack.astro", "static HTML · 3D deck on scroll"],
  ["[data-section='small']", "SmallBuilds.astro", "static HTML · hover marquee"],
  ["[data-section='skills']", "Skills.astro", "static HTML"],
  ["[data-section='credentials']", "Credentials.astro", "deck.ts · hands.ts · watch.ts · aliens on demand"],
  ["[data-section='contact']", "Contact.astro", "form → Worker → Supabase + email"],
  ["article.cs", "work/[slug].astro", "case study · static HTML"],
  ["[data-playground]", "RatePlayground.astro", "LastMile's rate engine, client-side"],
  ["[data-uptime]", "status.astro", "live /api/status · 30 days from D1 via /api/uptime"],
  ["[data-footer]", "Footer.astro", "sticky curtain · ASCII canvas"],
];

const CSS = `
.xray-box{position:fixed;z-index:65;pointer-events:none;border:1.5px dashed #43f24b;border-radius:6px;box-shadow:inset 0 0 0 9999px rgb(67 242 75 / .035)}
.xray-tag{position:absolute;top:6px;left:6px;max-width:calc(100% - 12px);padding:3px 8px;border-radius:6px;background:#06200a;color:#b9f7bd;font:500 11px/1.4 var(--font-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xray-tag b{color:#43f24b;font-weight:700}
.xray-panel{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:66;width:min(20rem,calc(100% - 32px));padding:14px 16px;border-radius:12px;background:#06200a;color:#d8ffd9;border:1px solid #1f6b26;font:12px/1.6 var(--font-mono);box-shadow:0 20px 40px -20px #000}
.xray-panel h2{font:700 12px/1 var(--font-mono);letter-spacing:.14em;color:#43f24b;margin:0 0 10px;display:flex;justify-content:space-between}
.xray-panel button{background:none;border:1px solid #1f6b26;color:#b9f7bd;border-radius:6px;font:inherit;font-size:11px;padding:0 6px;cursor:pointer}
.xray-panel dl{display:grid;grid-template-columns:1fr auto;gap:2px 12px;margin:0}
.xray-panel dt{color:#8fd996}.xray-panel dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.xray-panel .tot{border-top:1px solid #1f6b26;padding-top:4px;margin-top:4px;color:#43f24b;font-weight:700}
.xray-panel p{margin:10px 0 0;color:#8fd996}
`;

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

export function initXray() {
  let on = false;
  let frame = 0;
  let layer: HTMLElement | null = null;
  const boxes: { el: HTMLElement; box: HTMLElement }[] = [];

  const weight = () => {
    const groups: Record<string, number> = { html: 0, js: 0, css: 0, fonts: 0, images: 0, data: 0 };
    const size = (e: PerformanceResourceTiming) => e.transferSize || e.encodedBodySize || 0;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceResourceTiming | undefined;
    if (nav) groups.html += size(nav);
    let count = nav ? 1 : 0;
    for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      count++;
      const u = e.name.split("?")[0];
      const key = /\.(m?js)$/.test(u) || e.initiatorType === "script" ? "js"
        : /\.css$/.test(u) ? "css"
        : /\.(woff2?|ttf|otf)$/.test(u) ? "fonts"
        : /\.(png|jpe?g|webp|avif|svg|gif)$/.test(u) || e.initiatorType === "img" ? "images"
        : "data";
      groups[key] += size(e);
    }
    return { groups, count };
  };

  const panel = () => {
    const { groups, count } = weight();
    const total = Object.values(groups).reduce((a, b) => a + b, 0);
    const rows = Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<dt>${k}</dt><dd>${kb(v)}</dd>`)
      .join("");
    const el = document.createElement("aside");
    el.className = "xray-panel";
    el.setAttribute("aria-label", "X-ray: page weight");
    el.innerHTML = `<h2>X-RAY <button type="button" data-xray-off>close</button></h2>
      <dl>${rows}<dt class="tot">total</dt><dd class="tot">${kb(total)}</dd></dl>
      <p>${count} requests · ${document.getElementsByTagName("*").length} DOM nodes<br>
      Static HTML from Astro; no UI framework shipped. Sizes are what this visit transferred (cached files may show less).</p>`;
    el.querySelector("[data-xray-off]")?.addEventListener("click", toggle);
    return el;
  };

  const main = document.querySelector("main");
  const place = () => {
    // The curtain footer sits fixed behind <main>; only the part main has
    // uncovered is really on screen.
    const mainBottom = main?.getBoundingClientRect().bottom ?? 0;
    for (const { el, box } of boxes) {
      const r = el.getBoundingClientRect();
      const top = Math.max(2, r.top, main && !main.contains(el) && el.matches("[data-footer]") ? mainBottom : 0);
      const bottom = Math.min(innerHeight - 4, r.bottom);
      const visible = bottom - top > 24 && r.width > 0;
      box.style.display = visible ? "block" : "none";
      if (!visible) continue;
      box.style.left = `${Math.max(2, r.left)}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.min(innerWidth - 4, r.right) - Math.max(2, r.left)}px`;
      box.style.height = `${bottom - top}px`;
    }
    frame = requestAnimationFrame(place);
  };

  function toggle() {
    on = !on;
    if (!on) {
      cancelAnimationFrame(frame);
      layer?.remove();
      layer = null;
      boxes.length = 0;
      return;
    }
    layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `<style>${CSS}</style>`;
    for (const [sel, name, what] of TARGETS) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        const box = document.createElement("div");
        box.className = "xray-box";
        box.innerHTML = `<span class="xray-tag"><b>${name}</b> · ${what} · ${el.getElementsByTagName("*").length} nodes</span>`;
        layer!.append(box);
        boxes.push({ el, box });
      });
    }
    document.body.append(layer);
    const p = panel();
    layer.append(p);
    // The panel itself is readable by screen readers even though the outlines aren't.
    layer.removeAttribute("aria-hidden");
    boxes.forEach(({ box }) => box.setAttribute("aria-hidden", "true"));
    place();
  }

  addEventListener("xray:toggle", toggle);
}
