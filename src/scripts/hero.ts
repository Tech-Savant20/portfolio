import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * The name along the bottom of the hero runs on its own, turns round when the
 * scroll direction changes (down: leftwards, up: rightwards) and speeds up with
 * the scroll, easing back to its cruising speed. It only runs while the hero is
 * on screen. Without motion it stands still; before this runs, CSS keeps it
 * moving (the .hero-js class hands over).
 */
export function initHeroMarquee() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const track = document.querySelector<HTMLElement>("[data-hero-track]");
  if (!hero || !track || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.documentElement.classList.add("hero-js");
  /** Cruising speed: half the track (one copy of the name) every 26 s. */
  const BASE = 50 / 26;
  let x = 0;
  let dir = -1;
  let boost = 0;
  const set = gsap.quickSetter(track, "xPercent");

  const tick = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs, 64) / 1000;
    boost *= Math.pow(0.04, dt);
    x += dir * BASE * (1 + boost) * dt;
    if (x <= -50) x += 50;
    else if (x > 0) x -= 50;
    set(x);
  };

  let running = false;
  const run = (on: boolean) => {
    if (on === running) return;
    running = on;
    if (on) gsap.ticker.add(tick);
    else gsap.ticker.remove(tick);
  };
  new IntersectionObserver(([e]) => run(e.isIntersecting)).observe(hero);

  ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: "bottom top",
    onUpdate: (self) => {
      dir = self.direction === 1 ? -1 : 1;
      boost = Math.min(9, boost + Math.abs(self.getVelocity()) / 900);
    },
  });
}
