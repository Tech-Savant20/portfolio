import { gsap } from "gsap";
import { soundOn } from "./sound-pref";

/**
 * The dealer's watch (a Galaxy Watch 4, like mine): live Pune time, and on a
 * click the face turns into the Omnitrix and projects a hologram of the next
 * alien. The aliens are traced from reference art into three tones (body,
 * mid-tones, highlights) and load from /holo/aliens.json the first time the
 * deck comes near the screen, so they cost the page nothing until then.
 */

interface Alien {
  id: string;
  name: string;
  w: number;
  h: number;
  body: string;
  mid: string;
  light: string;
}

const HOLD = 4;
const SVG_NS = "http://www.w3.org/2000/svg";

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function initWatch(stage: HTMLElement) {
  const btn = stage.querySelector<HTMLButtonElement>("[data-watch-btn]");
  const time = stage.querySelector<SVGTextElement>("[data-watch-time]");
  const sec = stage.querySelector<SVGCircleElement>("[data-watch-sec]");
  const clock = stage.querySelector<SVGGElement>("[data-watch-clock]");
  const dial = stage.querySelector<SVGGElement>("[data-watch-dial]");
  const holo = stage.querySelector<HTMLElement>("[data-holo]");
  const name = stage.querySelector<SVGTextElement>("[data-holo-name]");
  const slot = stage.querySelector<SVGGElement>("[data-holo-aliens]");
  if (!btn || !time || !sec || !clock || !dial || !holo || !name || !slot) return;

  // ---------------------------------------------------------------- aliens

  let aliens: { name: string; el: SVGSVGElement }[] = [];
  let loading: Promise<void> | null = null;

  /** Builds one alien as a nested SVG that fits the hologram's projection area. */
  const build = (a: Alien) => {
    const pad = a.h * 0.04;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "alien");
    svg.setAttribute("x", "14");
    svg.setAttribute("y", "22");
    svg.setAttribute("width", "142");
    svg.setAttribute("height", "200");
    svg.setAttribute("viewBox", `${-pad} ${-pad} ${a.w + pad * 2} ${a.h + pad * 2}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
    for (const [d, alpha] of [[a.body, "0.22"], [a.mid, "0.55"], [a.light, "1"]] as const) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill-opacity", alpha);
      p.setAttribute("fill-rule", "evenodd");
      svg.append(p);
    }
    slot.append(svg);
    return { name: a.name, el: svg };
  };

  const load = () =>
    (loading ??= fetch("/holo/aliens.json")
      .then((r) => (r.ok ? (r.json() as Promise<Alien[]>) : []))
      .then((list) => {
        aliens = list.map(build);
      })
      .catch(() => {}));

  // Fetch while the deck is being shuffled, well before anyone reaches the watch.
  new IntersectionObserver(
    ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      void load();
    },
    { rootMargin: "400px 0px" },
  ).observe(stage);

  // ---------------------------------------------------------------- clock

  const circ = Number(sec.dataset.circ) || 116;
  const tick = () => {
    const now = new Date();
    time.textContent = fmt.format(now);
    // Seconds are the same in every time zone, IST included.
    sec.style.strokeDashoffset = String(circ * (1 - now.getSeconds() / 60));
  };
  let timer = 0;
  new IntersectionObserver(([e]) => {
    window.clearInterval(timer);
    if (e.isIntersecting) {
      tick();
      timer = window.setInterval(tick, 1000);
    }
  }).observe(stage);

  // ---------------------------------------------------------------- sound

  let ctx: AudioContext | null = null;
  /** A short power-up whirr and a beep, synthesised, so no clip is borrowed. */
  const whirr = () => {
    if (!soundOn()) return;
    try {
      ctx ??= new AudioContext();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.35);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(f).connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.42);

      const b = ctx.createOscillator();
      b.type = "sine";
      b.frequency.value = 1320;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t + 0.38);
      bg.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.56);
      b.connect(bg).connect(ctx.destination);
      b.start(t + 0.38);
      b.stop(t + 0.58);
    } catch {}
  };

  // ------------------------------------------------------------- omnitrix

  let next = 0;
  let run: gsap.core.Timeline | null = null;

  /** Puts the hologram just up and to the right of the watch, wherever the hand is. */
  const placeHolo = () => {
    const s = stage.getBoundingClientRect();
    const w = btn.getBoundingClientRect();
    const hw = holo.offsetWidth;
    const hh = holo.offsetHeight;
    const x = Math.min(w.left - s.left + w.width * 0.55, s.width - hw);
    const y = Math.max(0, w.top - s.top + w.height * 0.4 - hh);
    gsap.set(holo, { x, y });
  };

  const activate = async () => {
    await load();
    if (!aliens.length) return;
    run?.kill();
    const i = next;
    next = (next + 1) % aliens.length;
    name.textContent = aliens[i].name;
    placeHolo();
    whirr();

    const alien = aliens[i].el;
    run = gsap
      .timeline({ onComplete: () => (run = null) })
      .set(aliens.map((a) => a.el), { opacity: 0 })
      .set(holo, { autoAlpha: 0, scaleY: 0.05 })
      // The face turns into the dial.
      .to(clock, { opacity: 0, duration: 0.15 }, 0)
      .fromTo(dial, { opacity: 0, rotation: -90, svgOrigin: "100 168" }, { opacity: 1, rotation: 0, duration: 0.4, ease: "back.out(2)" }, 0.05)
      .to(dial, { scale: 1.12, svgOrigin: "100 168", duration: 0.12, yoyo: true, repeat: 1 }, 0.42)
      // The hologram rises out of it, flickering.
      .to(holo, { autoAlpha: 1, scaleY: 1, duration: 0.4, ease: "expo.out" }, 0.5)
      .to(alien, { opacity: 0.9, duration: 0.05, repeat: 5, yoyo: true, ease: "none" }, 0.55)
      .set(alien, { opacity: 0.9 }, 0.85)
      .to(holo, { y: "-=6", duration: 1, yoyo: true, repeat: 3, ease: "sine.inOut" }, 0.9)
      // Then it powers down and the clock comes back.
      .to(holo, { autoAlpha: 0, scaleY: 0.05, duration: 0.3, ease: "power2.in" }, HOLD + 0.6)
      .to(dial, { opacity: 0, rotation: 90, svgOrigin: "100 168", duration: 0.3 }, HOLD + 0.8)
      .to(clock, { opacity: 1, duration: 0.3 }, HOLD + 1);
  };

  btn.addEventListener("click", () => void activate());
}
