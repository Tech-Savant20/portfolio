import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * The footer sits behind the page (CSS does that with position: sticky) and is
 * uncovered as the last section scrolls away. This file does the rest:
 * the portrait redrawn as ASCII, characters lighting up under the pointer, and
 * the name and columns rising once the footer comes out.
 */

/** Sparse to dense. Which end a cell takes depends on the theme. */
const RAMP = " .:-=+*#%@";
const COLS = 56;
/** Below this the source pixel is outside the cut-out portrait. */
const ALPHA_FLOOR = 40;
const LIT_MS = 320;
const CLUSTER = 9;
/** How near the pointer has to be, in cells, to light anything. */
const REACH = 5;

interface Cell {
  col: number;
  row: number;
  /** 0 (black) to 1 (white) in the source image. */
  level: number;
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

  const cells: Cell[] = [];
  const at = new Map<string, Cell>();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < COLS; col++) {
      const o = (row * COLS + col) * 4;
      if (data[o + 3] < ALPHA_FLOOR) continue;
      const level = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
      const cell: Cell = { col, row, level, lit: 0 };
      cells.push(cell);
      at.set(`${col},${row}`, cell);
    }
  }
  if (!cells.length) return;
  canvas.style.aspectRatio = `${COLS} / ${rows}`;

  let colors = theme();
  let size = 0;

  const measure = () => {
    const width = canvas.clientWidth;
    if (!width) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    size = width / COLS;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(size * rows * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${(size * 1.2).toFixed(2)}px "Geist Mono Variable", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    return true;
  };

  /** Draws one frame and reports whether any cell is still lit. */
  const draw = () => {
    const now = performance.now();
    let busy = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of cells) {
      const lit = c.lit > now;
      busy ||= lit;
      // Dark theme: bright pixels get the heavy characters. Light theme: the opposite.
      const t = colors.dark ? c.level : 1 - c.level;
      const char = RAMP[Math.round(t * (RAMP.length - 1))];
      const x = c.col * size;
      const y = c.row * size;
      if (lit) {
        ctx.fillStyle = colors.accent;
        ctx.fillRect(x, y, size, size);
      }
      ctx.fillStyle = lit ? colors.onAccent : colors.ink;
      ctx.fillText(char, x + size / 2, y + size / 2);
    }
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

  footer.addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (now - last < 33) return;
    last = now;

    const box = footer.getBoundingClientRect();
    driftX?.((e.clientX - (box.left + box.width / 2)) * 0.02);
    driftY?.((e.clientY - (box.top + box.height / 2)) * 0.03);

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
  return {
    dark: s.colorScheme.includes("dark"),
    ink: s.getPropertyValue("--fg-muted").trim() || "#888",
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

  const chars = name ? SplitText.create(name, { type: "chars", mask: "chars" }).chars : [];
  if (chars.length) gsap.set(chars, { yPercent: 120 });
  if (lines.length) gsap.set(lines, { yPercent: 110 });
  if (art) gsap.set(art, { autoAlpha: 0, xPercent: 12 });

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

  ScrollTrigger.create({ trigger: main, start: "bottom bottom-=8%", onEnter: show, onLeaveBack: hide });
  // Pages that open already scrolled to the end never cross that line.
  if (main.getBoundingClientRect().bottom <= innerHeight * 0.92) show();
}
