import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Globe } from "./journey-globe";

gsap.registerPlugin(ScrollTrigger);

/**
 * "My journey" (Journey.astro). The land dots are drawn everywhere. On wide
 * screens with motion allowed the section pins and one scrubbed timeline runs:
 *   1. the globe turns to India and zooms in,
 *   2. the track slides to the dot map,
 *   3. an orb travels the route, lighting each city as it arrives,
 *   4. the track slides through the milestones, whose line the orb rides.
 * Everything else sees the stacked layout (CSS keys off html.journey-h).
 */

interface Geo {
  globe: number[];
  globeIndia: number[];
  region: {
    cols: number;
    rows: number;
    /** Land dots outside India, then inside it, as column/row pairs. */
    cells: number[];
    india: number[];
    /** India's official boundary and its states, as SVG paths in grid units. */
    border: string;
    states: string;
  };
}

interface Sample {
  l: number;
  x: number;
  y: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function initJourney() {
  const section = document.querySelector<HTMLElement>("[data-journey]");
  if (!section) return;
  const root = document.documentElement;
  const wide = matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
  const horizontal = wide.matches;
  root.classList.toggle("journey-h", horizontal);

  let geo: Promise<Geo | null> | null = null;
  const loadGeo = () =>
    (geo ??= fetch("/journey/geo.json")
      .then((r) => (r.ok ? (r.json() as Promise<Geo>) : null))
      .catch(() => null));

  // Draw the map's land dots once the section is near, in any layout.
  new IntersectionObserver(
    async ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const g = await loadGeo();
      if (!g) return;
      const dots = (c: number[]) => {
        let d = "";
        for (let i = 0; i < c.length; i += 2) d += `M${c[i]} ${c[i + 1]}h0`;
        return d;
      };
      const set = (sel: string, d: string) => section.querySelector(sel)?.setAttribute("d", d);
      set("[data-journey-land]", dots(g.region.cells));
      set("[data-journey-india]", dots(g.region.india));
      set("[data-journey-states]", g.region.states);
      set("[data-journey-border]", g.region.border);
    },
    { rootMargin: "120% 0px" },
  ).observe(section);

  if (!horizontal) return;
  setupHorizontal(section, loadGeo);
}

function setupHorizontal(section: HTMLElement, loadGeo: () => Promise<Geo | null>) {
  const root = document.documentElement;
  const pin = section.querySelector<HTMLElement>("[data-journey-pin]")!;
  const track = section.querySelector<HTMLElement>("[data-journey-track]")!;
  const globeBox = section.querySelector<HTMLElement>("[data-journey-globe]")!;
  const route = section.querySelector<SVGPathElement>("[data-journey-route]")!;
  const orb = section.querySelector<SVGGElement>("[data-journey-orb]")!;
  // In place order (the SVG draws them last place first).
  const pinDots = [...section.querySelectorAll<SVGCircleElement>("[data-pin]")].sort(
    (a, b) => Number(a.dataset.pin) - Number(b.dataset.pin),
  );
  const labels = [...section.querySelectorAll<HTMLElement>("[data-label]")];
  const log = [...section.querySelectorAll<HTMLElement>("[data-log]")];
  const steps = section.querySelector<HTMLElement>("[data-journey-steps]")!;
  const lineBase = section.querySelector<SVGPathElement>("[data-journey-line-base]")!;
  const line = section.querySelector<SVGPathElement>("[data-journey-line]")!;
  const nodesG = section.querySelector<SVGGElement>("[data-journey-nodes]")!;
  const cards = [...section.querySelectorAll<HTMLElement>("[data-journey-card]")];
  const stepOrb = section.querySelector<HTMLElement>("[data-journey-step-orb]")!;

  // ---- the route on the map ----
  const routeLen = route.getTotalLength();
  route.style.strokeDasharray = `${routeLen} ${routeLen}`;
  route.style.strokeDashoffset = String(routeLen);
  // Length along the route at which the orb reaches each pin.
  const pinLengths = (() => {
    const samples: Sample[] = [];
    for (let l = 0; l <= routeLen; l += routeLen / 400) {
      const p = route.getPointAtLength(l);
      samples.push({ l, x: p.x, y: p.y });
    }
    let from = 0;
    return pinDots.map((dot) => {
      const cx = Number(dot.getAttribute("cx"));
      const cy = Number(dot.getAttribute("cy"));
      let best = from;
      let bestD = Infinity;
      for (let i = from; i < samples.length; i++) {
        const d = (samples[i].x - cx) ** 2 + (samples[i].y - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      from = best;
      return samples[best].l;
    });
  })();

  const route$ = { p: 0 };
  const renderRoute = () => {
    const l = route$.p * routeLen;
    const pt = route.getPointAtLength(l);
    orb.setAttribute("transform", `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)})`);
    route.style.strokeDashoffset = String(routeLen - l);
    let current = -1;
    pinLengths.forEach((pl, i) => {
      const reached = l >= pl - 0.4;
      pinDots[i].classList.toggle("is-lit", reached);
      log[i]?.classList.toggle("is-lit", reached);
      if (reached) current = i;
    });
    labels.forEach((el, i) => el.classList.toggle("is-current", i === current));
  };
  renderRoute();

  // ---- the milestone line: a gentle wave between the cards above and below ----
  let samples: Sample[] = [];
  let lineLen = 0;
  let nodeXs: number[] = [];
  const nodes: SVGCircleElement[] = [];
  const buildLine = () => {
    const box = steps.getBoundingClientRect();
    const mid = box.height / 2;
    const A = Math.min(34, box.height * 0.04);
    const pts = [{ x: 0, y: mid }];
    nodeXs = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return r.left - box.left + 22;
    });
    nodeXs.forEach((x, i) => pts.push({ x, y: mid + (cards[i].classList.contains("low") ? A : -A) }));
    pts.push({ x: box.width, y: mid });
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const k = (b.x - a.x) / 2;
      d += ` C${a.x + k} ${a.y} ${b.x - k} ${b.y} ${b.x} ${b.y}`;
    }
    lineBase.setAttribute("d", d);
    line.setAttribute("d", d);
    lineLen = line.getTotalLength();
    line.style.strokeDasharray = `${lineLen} ${lineLen}`;
    samples = [];
    for (let l = 0; l <= lineLen; l += 6) {
      const p = line.getPointAtLength(l);
      samples.push({ l, x: p.x, y: p.y });
    }
    nodesG.replaceChildren();
    nodes.length = 0;
    pts.slice(1, -1).forEach((p) => {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("class", "node");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "6");
      nodesG.append(c);
      nodes.push(c);
    });
  };

  /** The sample on the line at x (x only ever increases along it). */
  const atX = (x: number) => {
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (samples[m].x < x) lo = m + 1;
      else hi = m;
    }
    return samples[lo];
  };

  const renderSteps = () => {
    if (!samples.length) return;
    const x = -Number(gsap.getProperty(track, "x")) + innerWidth / 2 - steps.offsetLeft;
    const inside = x > 0 && x < steps.offsetWidth;
    stepOrb.style.opacity = inside ? "1" : "0";
    const s = atX(Math.max(0, Math.min(steps.offsetWidth, x)));
    const top = steps.getBoundingClientRect().top - pin.getBoundingClientRect().top;
    stepOrb.style.transform = `translateY(${(top + s.y).toFixed(1)}px)`;
    line.style.strokeDashoffset = String(lineLen - (inside ? s.l : x <= 0 ? 0 : lineLen));
    nodeXs.forEach((nx, i) => {
      const lit = x >= nx - 2;
      nodes[i]?.classList.toggle("is-lit", lit);
      cards[i].classList.toggle("is-lit", lit);
    });
  };

  // ---- the globe, loaded when the section is near ----
  let globe: Globe | null = null;
  const globe$ = { p: 0 };
  new IntersectionObserver(
    async ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const [g, mod] = await Promise.all([loadGeo(), import("./journey-globe")]);
      if (!g) return;
      const places = JSON.parse(section.dataset.places ?? "[]") as { lon: number; lat: number }[];
      globe = mod.createGlobe(globeBox, { land: g.globe, india: g.globeIndia, places, focus: { lon: 79, lat: 22 } });
      globe.setProgress(globe$.p);
      addEventListener("themechange", () => requestAnimationFrame(() => globe?.setColors()));
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => globe?.setColors());
    },
    { rootMargin: "100% 0px" },
  ).observe(section);

  // ---- one pinned, scrubbed timeline ----
  const slideTo = (el: HTMLElement) => () => -el.offsetLeft;
  const places = section.querySelector<HTMLElement>(".panel.places")!;
  // Scroll spent crossing the milestones, in screens, so it reads at the same pace as the rest.
  const stepsDuration = Math.max(2, (track.scrollWidth - places.offsetLeft - innerWidth) / innerWidth) * 1.1;
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: section,
      pin,
      start: "top top",
      end: () => `+=${Math.round(tl.duration() * innerHeight * 0.8)}`,
      scrub: 0.8,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      onToggle: (self) => root.classList.toggle("journey-pinned", self.isActive),
    },
  });
  tl.to(globe$, { p: 1, duration: 1.4, onUpdate: () => globe?.setProgress(globe$.p) })
    .to(track, { x: slideTo(places), duration: 1, ease: "power1.inOut" })
    .to(route$, { p: 1, duration: Math.max(2, pinDots.length * 0.5), onUpdate: renderRoute })
    .to(track, { x: () => -(track.scrollWidth - innerWidth), duration: stepsDuration, onUpdate: renderSteps });

  const rebuild = () => {
    buildLine();
    renderSteps();
    globe?.resize();
  };
  buildLine();
  ScrollTrigger.addEventListener("refresh", rebuild);

  // Sections above change height after load (the certificate deck grows when it
  // deals), which would leave the pin starting early. Re-measure when the
  // journey actually moves.
  let lastTop = -1;
  let timer = 0;
  const main = document.querySelector("main");
  if (main) {
    new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const top = Math.round(section.getBoundingClientRect().top + scrollY);
        if (top !== lastTop) {
          lastTop = top;
          ScrollTrigger.refresh();
        }
      }, 200);
    }).observe(main);
  }
}
