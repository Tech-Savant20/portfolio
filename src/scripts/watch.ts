import { gsap } from "gsap";
import { soundOn } from "./sound-pref";

/**
 * The dealer's watch (a Galaxy Watch 4, like mine): live Pune time, and on a
 * click the face turns into the Omnitrix and projects a hologram of the next
 * alien. Heatblast, Four Arms and XLR8 are drawn by hand as simple silhouettes.
 */

const ALIENS = ["HEATBLAST", "FOUR ARMS", "XLR8"];
const HOLD = 4;

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
  const aliens = [...stage.querySelectorAll<SVGGElement>("[data-alien]")];
  if (!btn || !time || !sec || !clock || !dial || !holo || !name || !aliens.length) return;

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

  const activate = () => {
    run?.kill();
    const i = next;
    next = (next + 1) % aliens.length;
    name.textContent = ALIENS[i] ?? "";
    placeHolo();
    whirr();

    const alien = aliens[i];
    run = gsap
      .timeline({ onComplete: () => (run = null) })
      .set(aliens, { opacity: 0 })
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

  btn.addEventListener("click", activate);
}
