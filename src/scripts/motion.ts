import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

/**
 * Site-wide motion. Everything here is skipped when the visitor asks for
 * reduced motion; the page is complete without it.
 */
export const motionAllowed = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => matchMedia("(pointer: fine)").matches;

let lenis: Lenis | null = null;

/** Inertial scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync. */
export function initSmoothScroll() {
  if (!motionAllowed() || lenis) return;
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, anchors: { offset: -80 }, autoRaf: false });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/**
 * Runs setup steps one per task, so page start-up is a string of short tasks
 * instead of one long one that blocks input (Total Blocking Time).
 */
export function inTasks(steps: (() => unknown)[]) {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  const yieldNow = () => (s?.yield ? s.yield() : new Promise<void>((r) => setTimeout(r, 0)));
  void (async () => {
    for (const step of steps) {
      try {
        step();
      } catch (err) {
        console.error(err);
      }
      await yieldNow();
    }
  })();
}

/**
 * Headlines rise word by word out of a line mask when they scroll into view.
 * Splitting measures every line, so each headline is split only when it comes
 * within a screen of the viewport, not all of them at load.
 */
export function initSplitReveals(root: ParentNode = document) {
  if (!motionAllowed()) return;
  const split = (el: HTMLElement) =>
    SplitText.create(el, {
      type: "lines,words",
      mask: "lines",
      linesClass: "split-line",
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.words, {
          yPercent: 115,
          rotate: 4,
          duration: 1.15,
          ease: "expo.out",
          stagger: 0.045,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        }),
    });
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        split(e.target as HTMLElement);
      }
    },
    { rootMargin: "0px 0px 100% 0px" },
  );
  root.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
    // The fade-up reveal would fight this one.
    el.removeAttribute("data-reveal");
    el.classList.add("is-in");
    io.observe(el);
  });
}

/** The hero drifts apart as you scroll away from it: name up, portrait slower, copy fades. */
export function initHeroScroll() {
  if (!motionAllowed()) return;
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  const tl = gsap.timeline({
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 },
  });
  // Children, not the elements with CSS intro animations: a finished animation
  // with fill-mode "both" would override inline transforms on the parent.
  tl.to(hero.querySelector(".name"), { yPercent: -35, ease: "none" }, 0)
    .to(hero.querySelector(".portrait img"), { yPercent: 10, scale: 0.95, ease: "none" }, 0)
    .to(hero.querySelectorAll(".foot > *"), { y: -60, opacity: 0, ease: "none", stagger: 0.04 }, 0);
}

/** Numbers count up from zero the first time they are seen. Suffixes and prefixes stay put. */
export function initCountUps(root: ParentNode = document) {
  if (!motionAllowed()) return;
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const text = el.textContent?.trim() ?? "";
    // Only plain figures: "16", "76.5%", "20+", "₹0", "3,662", "0.76".
    const m = /^([₹]?)(\d[\d,]*\.?\d*)([%+]?)$/.exec(text);
    if (!m) return;
    const [, pre, num, post] = m;
    const target = parseFloat(num.replace(/,/g, ""));
    if (!target) return;
    const decimals = num.includes(".") ? num.split(".")[1].length : 0;
    const commas = num.includes(",");
    const fmt = (v: number) => {
      const s = v.toFixed(decimals);
      return commas ? Number(s).toLocaleString("en-US", { minimumFractionDigits: decimals }) : s;
    };
    const state = { v: 0 };
    el.textContent = `${pre}${fmt(0)}${post}`;
    gsap.to(state, {
      v: target,
      duration: 1.6,
      ease: "power3.out",
      onUpdate: () => (el.textContent = `${pre}${fmt(state.v)}${post}`),
      onComplete: () => (el.textContent = text),
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  });
}

/** Buttons lean toward the pointer a little, and spring back when it leaves. */
export function initMagnetic(root: ParentNode = document) {
  if (!motionAllowed() || !finePointer()) return;
  root.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
    const x = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
    const y = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.28);
      y((e.clientY - (r.top + r.height / 2)) * 0.4);
    });
    el.addEventListener("pointerleave", () => {
      x(0);
      y(0);
    });
  });
}

/** Images wipe in from the bottom, then keep a slow zoom while they cross the screen. */
export function initMediaReveals(root: ParentNode = document) {
  if (!motionAllowed()) return;
  root.querySelectorAll<HTMLElement>("[data-media]").forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: "inset(18% 0% 0% 0%)", opacity: 0.2 },
      {
        clipPath: "inset(0% 0% 0% 0%)",
        opacity: 1,
        duration: 1.3,
        ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
      },
    );
    const img = el.querySelector("img");
    if (img) {
      gsap.fromTo(
        img,
        { scale: 1.08 },
        { scale: 1, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } },
      );
    }
  });
}

/**
 * Smaller builds: a band of the project's tools slides over the row from
 * whichever edge the pointer crossed, and leaves the same way.
 */
export function initHoverMarquee(root: ParentNode = document) {
  if (!motionAllowed() || !finePointer()) return;
  root.querySelectorAll<HTMLElement>("[data-marquee-row]").forEach((row) => {
    const line = row.querySelector<HTMLElement>(".line");
    const band = row.querySelector<HTMLElement>("[data-band]");
    const inner = row.querySelector<HTMLElement>("[data-band-inner]");
    if (!line || !band || !inner) return;

    // The band starts hidden in CSS, in percent. Restate it here as GSAP's own
    // percentage, or GSAP reads the resolved pixels and keeps them underneath.
    gsap.set(band, { yPercent: 101, y: 0 });
    gsap.set(inner, { yPercent: -101, y: 0 });

    const defaults = { duration: 0.6, ease: "expo.out" };
    // Which edge of the row the pointer is nearest, as a percentage offset.
    const edge = (e: PointerEvent) => {
      const r = line.getBoundingClientRect();
      return e.clientY - r.top < r.height / 2 ? -101 : 101;
    };

    line.addEventListener("pointerenter", (e) => {
      const from = edge(e);
      row.classList.add("is-hover");
      // The inner track slides the opposite way, so the text stays upright
      // instead of riding in with the band.
      gsap
        .timeline({ defaults })
        .set(band, { yPercent: from }, 0)
        .set(inner, { yPercent: -from }, 0)
        .to([band, inner], { yPercent: 0 }, 0);
    });

    line.addEventListener("pointerleave", (e) => {
      const to = edge(e);
      gsap
        .timeline({ defaults, onComplete: () => row.classList.remove("is-hover") })
        .to(band, { yPercent: to }, 0)
        .to(inner, { yPercent: -to }, 0);
    });
  });
}

/** One marquee: it drifts on its own and speeds up and tilts with scroll velocity. */
export function initMarquee() {
  const track = document.querySelector<HTMLElement>("[data-marquee-track]");
  if (!track || !motionAllowed()) return;
  // The track holds the list twice, so shifting by half its width loops seamlessly.
  let half = track.scrollWidth / 2;
  new ResizeObserver(() => (half = track.scrollWidth / 2)).observe(track);
  let x = 0;
  let boost = 0;
  let skew = 0;
  let skewTarget = 0;
  let running = false;
  new IntersectionObserver(([e]) => (running = e.isIntersecting)).observe(track);
  ScrollTrigger.create({
    trigger: track,
    start: "top bottom",
    end: "bottom top",
    onUpdate: (self) => {
      const v = self.getVelocity();
      boost = Math.max(-20, Math.min(20, v / 110));
      skewTarget = Math.max(-7, Math.min(7, -v / 320));
    },
  });
  gsap.ticker.add((_t, dt) => {
    if (!running) return;
    boost *= 0.93;
    skewTarget *= 0.9;
    skew += (skewTarget - skew) * 0.12;
    x -= (0.045 + Math.abs(boost) * 0.035) * dt;
    if (half > 0 && -x >= half) x += half;
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
  });
}

// No "<", ">" or "&": the plugin writes innerHTML.
const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789/_#";
const noise = (text: string) =>
  text.replace(/\S/g, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);

/**
 * Monospace labels decode out of noise the first time they are seen, and
 * again when the pointer enters their card. The font is monospace, so the
 * line never changes width while it scrambles.
 */
export function initScramble(root: ParentNode = document) {
  if (!motionAllowed()) return;
  root.querySelectorAll<HTMLElement>("[data-scramble]").forEach((el) => {
    const text = el.textContent?.trim() ?? "";
    if (!text) return;
    // Screen readers get the real text; only a hidden copy scrambles.
    const real = document.createElement("span");
    real.className = "sr-only";
    real.textContent = text;
    const shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    shown.textContent = noise(text);
    el.replaceChildren(real, shown);

    const play = (duration: number) =>
      gsap.to(shown, {
        duration,
        ease: "none",
        overwrite: true,
        scrambleText: { text, chars: GLYPHS, speed: 0.5, revealDelay: duration * 0.3 },
      });

    // An observer, not a ScrollTrigger: it sees the label where it actually is,
    // including inside the pinned, transformed work stack.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        play(Math.min(1.2, 0.5 + text.length * 0.02));
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);

    if (finePointer()) {
      const card = el.closest<HTMLElement>("article, li") ?? el;
      card.addEventListener("pointerenter", () => play(0.6));
    }
  });
}

/**
 * Architecture diagrams and the homelab wires draw themselves in the first
 * time they are seen: boxes row by row, each edge after the row it leaves.
 * Edges are revealed through a solid mask copy ([data-draw]) with
 * pathLength=1, so no lengths need measuring and resizes cannot break it.
 */
export function initDrawIns(root: ParentNode = document) {
  if (!motionAllowed()) return;
  root.querySelectorAll<SVGSVGElement>("[data-diagram] svg, [data-wires]").forEach((svg) => {
    const draws = [...svg.querySelectorAll<SVGPathElement>("[data-draw]")];
    if (!draws.length) return;
    const parts = [...svg.querySelectorAll<SVGGElement>("[data-step]")];
    const nodes = parts.filter((p) => !p.classList.contains("edge-label"));
    const labels = parts.filter((p) => p.classList.contains("edge-label"));
    const at = (el: Element, key: "step" | "draw") => Number((el as HTMLElement).dataset[key] || 0) * 0.35;

    draws.forEach((p) => p.setAttribute("pathLength", "1"));
    gsap.set(draws, { strokeDasharray: "1 1", strokeDashoffset: 1 });
    if (nodes.length) gsap.set(nodes, { opacity: 0, y: 14 });
    if (labels.length) gsap.set(labels, { opacity: 0 });

    const tl = gsap.timeline({
      paused: true,
      // Hand the paths back to plain CSS once drawn.
      onComplete: () => gsap.set(draws, { clearProps: "strokeDasharray,strokeDashoffset" }),
    });
    nodes.forEach((n, i) => tl.to(n, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, at(n, "step") + (i % 4) * 0.06));
    draws.forEach((p, i) =>
      tl.to(p, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, at(p, "draw") + 0.3 + (i % 3) * 0.08),
    );
    labels.forEach((l) => tl.to(l, { opacity: 1, duration: 0.4 }, at(l, "step") + 0.9));

    ScrollTrigger.create({ trigger: svg, start: "top 80%", once: true, onEnter: () => tl.play() });
  });
}

/**
 * A sample request travelling through each architecture diagram: a glowing
 * dot runs along the edges in order, and a line under the diagram says which
 * hop it is on. Runs only while the diagram is on screen.
 */
export function initPackets(root: ParentNode = document) {
  if (!motionAllowed()) return;
  root.querySelectorAll<HTMLElement>("[data-diagram]").forEach((fig) => {
    const svg = fig.querySelector<SVGSVGElement>("svg");
    const readout = fig.querySelector<HTMLElement>("[data-packet-readout]");
    const edges = [...fig.querySelectorAll<SVGPathElement>("path.edge")]
      .map((p, i) => ({ p, i, step: Number(p.dataset.step || 0), label: p.dataset.label || "" }))
      .sort((a, b) => a.step - b.step || a.i - b.i);
    if (!svg || !readout || !edges.length) return;
    readout.textContent = "sample request · ready";

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", "5");
    dot.setAttribute("fill", "var(--accent)");
    dot.style.filter = "drop-shadow(0 0 5px var(--accent))";
    dot.style.opacity = "0";
    svg.append(dot);

    const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1.2 });
    edges.forEach((e, k) => {
      const len = e.p.getTotalLength();
      const at = { t: 0 };
      tl.call(() => {
        readout.textContent = `sample request · hop ${k + 1} of ${edges.length}${e.label ? ` · ${e.label}` : ""}`;
      })
        .set(dot, { opacity: 1 })
        .fromTo(
          at,
          { t: 0 },
          {
            t: 1,
            duration: Math.min(0.9, 0.25 + len / 600),
            ease: "power1.inOut",
            onUpdate: () => {
              const pt = e.p.getPointAtLength(at.t * len);
              dot.setAttribute("cx", String(pt.x));
              dot.setAttribute("cy", String(pt.y));
            },
          },
        )
        .to({}, { duration: 0.08 });
    });
    tl.call(() => {
      readout.textContent = `sample request · ${edges.length} hops, done`;
    }).set(dot, { opacity: 0 });

    // Start once the diagram has drawn itself in; pause whenever it's off screen.
    let started = false;
    new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return void tl.pause();
        if (started) return void tl.resume();
        started = true;
        gsap.delayedCall(2.2, () => tl.play());
      },
      { threshold: 0.3 },
    ).observe(fig);
  });
}

/** Thin accent bar under the nav that fills as you read a case study. */
export function initReadProgress() {
  const bar = document.querySelector<HTMLElement>(".progress");
  if (!bar || !motionAllowed()) return;
  gsap.to(bar, {
    scaleX: 1,
    ease: "none",
    scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
  });
}

export function refreshScroll() {
  ScrollTrigger.refresh();
}

export { ScrollTrigger };
