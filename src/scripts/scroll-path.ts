import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * The trail in ScrollPath.astro. The path is built from the page's own layout:
 * it starts under the hero, bends to the other side at the top of each section
 * and ends at the bottom of main, staying in the side margins at every bend.
 * The orb is placed by height, not by distance along the path, so it always
 * sits a little below the middle of the screen.
 */

interface Sample {
  l: number;
  x: number;
  y: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const STEP = 6;

export function initScrollPath() {
  const root = document.querySelector<HTMLElement>("[data-scroll-path]");
  const orbRoot = document.querySelector<HTMLElement>("[data-scroll-orb]");
  const main = document.querySelector<HTMLElement>("main");
  if (!root || !orbRoot || !main) return;
  if (!matchMedia("(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;

  const svgs = [root, orbRoot].map((r) => r.querySelector<SVGSVGElement>("svg")!);
  const base = root.querySelector<SVGPathElement>("[data-base]")!;
  const lit = root.querySelector<SVGPathElement>("[data-lit]")!;
  const orb = orbRoot.querySelector<SVGGElement>("[data-orb]")!;
  const nodeLayer = root.querySelector<SVGGElement>("[data-nodes]")!;

  let samples: Sample[] = [];
  let total = 0;
  let startY = 0;
  let endY = 0;
  let nodes: { el: SVGCircleElement; l: number }[] = [];
  const state = { l: 0 };

  const build = () => {
    const mainTop = main.getBoundingClientRect().top + scrollY;
    const W = main.clientWidth;
    const H = main.scrollHeight;
    if (!W || !H) return;
    root.hidden = false;
    orbRoot.hidden = false;
    for (const svg of svgs) {
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.style.height = `${H}px`;
    }

    // Where the content column starts and ends: the trail's bends sit halfway
    // out into the margins on either side.
    const col = main.querySelector<HTMLElement>(".container-x");
    let xL = 28;
    let xR = W - 28;
    if (col) {
      const r = col.getBoundingClientRect();
      const cs = getComputedStyle(col);
      const contentL = r.left + parseFloat(cs.paddingLeft);
      const contentR = r.right - parseFloat(cs.paddingRight);
      xL = Math.max(14, contentL / 2);
      xR = Math.min(W - 14, W - (W - contentR) / 2);
    }

    const hero = main.querySelector<HTMLElement>("[data-hero]");
    startY = hero ? hero.getBoundingClientRect().bottom + scrollY - mainTop + 24 : 80;
    endY = H - 48;
    const ys = [startY];
    main.querySelectorAll<HTMLElement>("[data-section]").forEach((s) => {
      const y = s.getBoundingClientRect().top + scrollY - mainTop + 40;
      if (y > ys[ys.length - 1] + 160 && y < endY - 160) ys.push(y);
    });
    ys.push(endY);

    // An S per section: vertical tangents at each bend keep the height rising
    // steadily, so the orb can be placed by height.
    const pts = ys.map((y, i) => ({ x: i % 2 === 0 ? xR : xL, y }));
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const k = (b.y - a.y) * 0.55;
      d += ` C${a.x},${a.y + k} ${b.x},${b.y - k} ${b.x},${b.y}`;
    }
    base.setAttribute("d", d);
    lit.setAttribute("d", d);

    total = lit.getTotalLength();
    samples = [];
    for (let l = 0; l <= total; l += STEP) {
      const p = lit.getPointAtLength(l);
      samples.push({ l, x: p.x, y: p.y });
    }
    const last = lit.getPointAtLength(total);
    samples.push({ l: total, x: last.x, y: last.y });
    lit.style.strokeDasharray = `${total} ${total}`;

    nodeLayer.replaceChildren();
    nodes = pts.map((p) => {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("class", "node");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "4.5");
      nodeLayer.append(c);
      return { el: c, l: lengthAtY(p.y) };
    });

    state.l = lengthAtY(targetY());
    render();
  };

  /** Path length where the trail reaches height y (the path only ever descends). */
  const lengthAtY = (y: number) => {
    if (!samples.length) return 0;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].y < y) lo = mid + 1;
      else hi = mid;
    }
    const b = samples[lo];
    const a = samples[Math.max(0, lo - 1)];
    const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
    return a.l + (b.l - a.l) * Math.min(1, Math.max(0, t));
  };

  const targetY = () => {
    const mainTop = main.getBoundingClientRect().top + scrollY;
    return Math.min(endY, Math.max(startY, scrollY - mainTop + innerHeight * 0.58));
  };

  const render = () => {
    if (!samples.length) return;
    const l = Math.min(total, Math.max(0, state.l));
    const i = Math.min(samples.length - 2, Math.floor(l / STEP));
    const a = samples[i];
    const b = samples[i + 1];
    const t = (l - a.l) / (b.l - a.l || 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    orb.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    lit.style.strokeDashoffset = String(total - l);
    for (const n of nodes) n.el.classList.toggle("is-lit", n.l <= l + 1);
  };

  const follow = gsap.quickTo(state, "l", { duration: 0.7, ease: "power3.out", onUpdate: render });
  addEventListener("scroll", () => samples.length && follow(lengthAtY(targetY())), { passive: true });

  // The layout moves: fonts load, the deck changes height, pins add spacers.
  let timer = 0;
  const rebuild = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(build, 150);
  };
  new ResizeObserver(rebuild).observe(main);
  ScrollTrigger.addEventListener("refresh", rebuild);
  rebuild();
}
