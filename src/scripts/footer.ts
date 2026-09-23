import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * The footer sits behind the page (CSS does that with position: sticky) and is
 * uncovered as the last section scrolls away. This file does the rest:
 * the portrait redrawn as ASCII that tilts toward the pointer in 3D (with its
 * bright parts standing out in relief), characters lighting up under it, and
 * the name and columns rising once the footer comes out.
 */

/** Sparse to dense. Which end a cell takes depends on the theme. No space:
 *  every cell inside the cut-out prints something, so the outline stays whole. */
const RAMP = ".:-=+*#%@";
const COLS = 78;
/** Share of the rows at the bottom that fade out, so the photo's crop line dissolves. */
const FADE_ROWS = 0.24;
/** Below this the source pixel is outside the cut-out portrait. */
const ALPHA_FLOOR = 40;
const LIT_MS = 320;
const CLUSTER = 9;
/** How near the pointer has to be, in cells, to light anything. */
const REACH = 5;

interface Cell {
  col: number;
  row: number;
  /** 0 (darkest in the portrait) to 1 (brightest), after contrast shaping. */
  level: number;
  /** Opacity: lower at the soft edges and across the bottom fade. */
  alpha: number;
  /** Timestamp this cell stops being lit. */
  lit: number;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => matchMedia("(pointer: fine)").matches;

export function initFooter() {
  const footer = document.querySelector<HTMLElement>("[data-footer]");
  if (!footer) return;
  void ascii(footer);
  if (!reduced()) reveal(footer);
}

async function ascii(footer: HTMLElement) {
  const canvas = footer.querySelector<HTMLCanvasElement>("[data-ascii]");
  const src = canvas?.dataset.src;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !src || !ctx) return;

  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return;
  }

  // Sample the portrait down to one pixel per character cell.
  const rows = Math.max(1, Math.round((COLS * img.naturalHeight) / img.naturalWidth));
  const small = document.createElement("canvas");
  small.width = COLS;
  small.height = rows;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return;
  sctx.drawImage(img, 0, 0, COLS, rows);
  const { data } = sctx.getImageData(0, 0, COLS, rows);

  // Luminance per cell, NaN outside the cut-out.
  const lum = new Float32Array(COLS * rows).fill(NaN);
  for (let i = 0; i < COLS * rows; i++) {
    const o = i * 4;
    if (data[o + 3] >= ALPHA_FLOOR) lum[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
  }
  const inside = [...lum].filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  if (!inside.length) return;

  // The photo is mostly dark shirt and mid-tone skin, which uses only a few
  // characters of the ramp. Rank each cell among the others (histogram
  // equalisation) so the whole ramp gets used, then sharpen against the
  // neighbours so the eyes, brows and moustache read at this size.
  const rank = (v: number) => {
    let lo = 0;
    let hi = inside.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (inside[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / (inside.length - 1 || 1);
  };
  const lowV = inside[Math.floor(inside.length * 0.02)];
  const highV = inside[Math.floor(inside.length * 0.98)];
  const shaped = new Float32Array(COLS * rows).fill(NaN);
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i];
    if (Number.isNaN(v)) continue;
    const stretched = Math.min(1, Math.max(0, (v - lowV) / (highV - lowV || 1)));
    shaped[i] = 0.6 * rank(v) + 0.4 * stretched;
  }

  const cells: Cell[] = [];
  const at = new Map<string, Cell>();
  const fadeFrom = rows * (1 - FADE_ROWS);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const v = shaped[i];
      if (Number.isNaN(v)) continue;
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = col + dx;
          const y = row + dy;
          if (x < 0 || y < 0 || x >= COLS || y >= rows) continue;
          const w = shaped[y * COLS + x];
          if (Number.isNaN(w)) continue;
          sum += w;
          n++;
        }
      }
      // Stray specks along the cut-out's edge have almost no neighbours.
      if (n < 4) continue;
      const level = Math.min(1, Math.max(0, v + 0.9 * (v - sum / n)));
      const edge = Math.min(1, data[i * 4 + 3] / 200);
      const fade = row < fadeFrom ? 1 : Math.max(0, 1 - (row - fadeFrom) / (rows - fadeFrom)) ** 1.4;
      if (fade < 0.04) continue;
      const cell: Cell = { col, row, level, alpha: edge * fade, lit: 0 };
      cells.push(cell);
      at.set(`${col},${row}`, cell);
    }
  }
  if (!cells.length) return;
  canvas.style.aspectRatio = `${COLS} / ${rows}`;

  let colors = theme();
  let size = 0;
  /** Where the pointer is over the footer, -1 to 1 on each axis, smoothed. */
  const view = { x: 0, y: 0 };

  const measure = () => {
    const width = canvas.clientWidth;
    if (!width) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    size = width / COLS;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(size * rows * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${(size * 1.35).toFixed(2)}px "Geist Mono Variable", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    return true;
  };

  /** Draws one frame and reports whether any cell is still lit. */
  const draw = () => {
    const now = performance.now();
    let busy = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Relief: the brighter a cell (forehead, nose, cheekbones), the nearer it
    // sits, so it shifts further with the pointer than the shadows do.
    const depth = size * 1.8;
    for (const c of cells) {
      const lit = c.lit > now;
      busy ||= lit;
      // Dark theme: bright pixels get the heavy characters. Light theme: the
      // opposite, lifted so the skin's midtones still get real characters
      // rather than dots (otherwise only the dark shirt reads).
      const t = colors.dark ? c.level : Math.pow(1 - c.level, 0.62);
      const char = RAMP[Math.round(t * (RAMP.length - 1))];
      const near = c.level - 0.5;
      const x = c.col * size + view.x * depth * near;
      const y = c.row * size + view.y * depth * near;
      if (lit) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.accent;
        ctx.fillRect(x, y, size, size);
      }
      // Dark theme: denser characters also print stronger, which adds depth.
      // Light theme: the densest (the shirt) print softer, so the face leads.
      ctx.globalAlpha = lit ? 1 : c.alpha * (colors.dark ? 0.55 + 0.45 * t : 0.95 - 0.35 * t);
      ctx.fillStyle = lit ? colors.onAccent : colors.ink;
      ctx.fillText(char, x + size / 2, y + size / 2);
    }
    ctx.globalAlpha = 1;
    return busy;
  };

  let running = false;
  const frame = () => {
    running = draw();
    if (running) requestAnimationFrame(frame);
  };
  const paint = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  };

  await document.fonts.ready;
  if (!measure()) return;
  paint();

  new ResizeObserver(() => {
    if (measure()) paint();
  }).observe(canvas);

  // Both ways the theme can change: the toggle, and the system setting.
  const repaint = () => {
    colors = theme();
    paint();
  };
  new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", repaint);

  if (reduced() || !finePointer()) return;

  /** Lights a cell and walks a short random path out of it. */
  const light = (start: Cell) => {
    const now = performance.now();
    start.lit = now + LIT_MS;
    const seen = new Set<Cell>([start]);
    let cur = start;
    const steps = 1 + Math.floor(Math.random() * CLUSTER);
    for (let s = 0; s < steps; s++) {
      const near: Cell[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = at.get(`${cur.col + dx},${cur.row + dy}`);
          if (n && !seen.has(n)) near.push(n);
        }
      }
      if (!near.length) break;
      cur = near[Math.floor(Math.random() * near.length)];
      seen.add(cur);
      cur.lit = now + LIT_MS + s * 12;
    }
  };

  let last = 0;
  const wrap = footer.querySelector<HTMLElement>("[data-ascii-wrap]");
  const driftX = wrap ? gsap.quickTo(wrap, "x", { duration: 0.9, ease: "power3.out" }) : null;
  const driftY = wrap ? gsap.quickTo(wrap, "y", { duration: 0.9, ease: "power3.out" }) : null;

  // 3D: the portrait turns toward the pointer, and the relief in draw() moves
  // with the same smoothed position.
  gsap.set(canvas, { transformPerspective: 900, transformOrigin: "50% 55%" });
  const tiltY = gsap.quickTo(canvas, "rotationY", { duration: 0.9, ease: "power3.out" });
  const tiltX = gsap.quickTo(canvas, "rotationX", { duration: 0.9, ease: "power3.out" });
  const viewX = gsap.quickTo(view, "x", { duration: 0.9, ease: "power3.out", onUpdate: () => void paint() });
  const viewY = gsap.quickTo(view, "y", { duration: 0.9, ease: "power3.out", onUpdate: () => void paint() });
  const look = (nx: number, ny: number) => {
    tiltY(nx * 14);
    tiltX(-ny * 9);
    viewX(nx);
    viewY(ny);
  };
  footer.addEventListener("pointerleave", () => {
    look(0, 0);
    driftX?.(0);
    driftY?.(0);
  });

  footer.addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (now - last < 33) return;
    last = now;

    const box = footer.getBoundingClientRect();
    driftX?.((e.clientX - (box.left + box.width / 2)) * 0.02);
    driftY?.((e.clientY - (box.top + box.height / 2)) * 0.03);
    const art = canvas.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    look(
      clamp((e.clientX - (art.left + art.width / 2)) / (box.width / 2)),
      clamp((e.clientY - (art.top + art.height / 2)) / (box.height / 2)),
    );

    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const col = ((e.clientX - r.left) / r.width) * COLS;
    const row = ((e.clientY - r.top) / r.height) * rows;
    let best: Cell | null = null;
    let bestDist = REACH * REACH;
    for (const c of cells) {
      const d = (col - c.col) ** 2 + (row - c.row) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (best) {
      light(best);
      paint();
    }
  });
}

function theme() {
  const s = getComputedStyle(document.documentElement);
  const dark = s.colorScheme.includes("dark");
  return {
    dark,
    // Light theme uses the full text colour: grey glyphs on a pale ground lose the face.
    ink: s.getPropertyValue(dark ? "--fg-muted" : "--fg").trim() || "#888",
    accent: s.getPropertyValue("--accent").trim() || "#ff5a1f",
    onAccent: s.getPropertyValue("--on-accent").trim() || "#121213",
  };
}

/** The name and the columns rise as the page finishes sliding off the footer. */
function reveal(footer: HTMLElement) {
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return;

  const name = footer.querySelector<HTMLElement>("[data-footer-name]");
  const art = footer.querySelector<HTMLElement>("[data-ascii-wrap]");
  // The links carry icons, so they rise whole inside their own mask rather
  // than being split into lines.
  const lines = [...footer.querySelectorAll<HTMLElement>("[data-footer-rise]")];

  let chars: Element[] = [];

  const show = () => {
    if (chars.length)
      gsap.to(chars, { yPercent: 0, duration: 1, ease: "power3.out", stagger: { each: 0.03, from: "start" }, overwrite: true });
    if (lines.length) gsap.to(lines, { yPercent: 0, duration: 0.9, ease: "power3.out", stagger: 0.06, overwrite: true });
    if (art) gsap.to(art, { autoAlpha: 1, xPercent: 0, duration: 1.1, ease: "power3.out", overwrite: true });
  };

  const hide = () => {
    if (chars.length)
      gsap.to(chars, { yPercent: 120, duration: 0.35, ease: "power2.in", stagger: { each: 0.008, from: "end" }, overwrite: true });
    if (lines.length) gsap.to(lines, { yPercent: 110, duration: 0.35, ease: "power2.in", overwrite: true });
    if (art) gsap.to(art, { autoAlpha: 0, xPercent: 12, duration: 0.35, ease: "power2.in", overwrite: true });
  };

  // Splitting the name and hiding the lines waits until the end of the page is
  // a screen and a half away: the footer is still covered then, and page load
  // doesn't pay for it.
  const setup = () => {
    chars = name ? SplitText.create(name, { type: "chars", mask: "chars" }).chars : [];
    if (chars.length) gsap.set(chars, { yPercent: 120 });
    if (lines.length) gsap.set(lines, { yPercent: 110 });
    if (art) gsap.set(art, { autoAlpha: 0, xPercent: 12 });
    ScrollTrigger.create({ trigger: main, start: "bottom bottom-=8%", onEnter: show, onLeaveBack: hide });
    // Pages that open already scrolled to the end never cross that line.
    if (main.getBoundingClientRect().bottom <= innerHeight * 0.92) show();
  };
  ScrollTrigger.create({ trigger: main, start: () => `bottom bottom+=${Math.round(innerHeight * 1.5)}`, once: true, onEnter: setup });
}
