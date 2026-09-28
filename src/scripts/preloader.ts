import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Plays the greeting set up by Preloader.astro: the first word holds, the rest
 * flash by, then the screen lifts off with its curved edge flattening and the
 * hero rises into place underneath. About two seconds in all.
 */
export function runPreloader() {
  const root = document.documentElement;
  const el = document.querySelector<HTMLElement>("[data-preloader]");
  if (!el || !root.classList.contains("preloading")) return;
  const word = el.querySelector<HTMLElement>("[data-preloader-word]");
  const curve = el.querySelector<SVGPathElement>("[data-preloader-curve]");
  const words = JSON.parse(el.querySelector("[data-preloader-words]")?.textContent ?? "[]") as {
    text: string;
    lang: string;
  }[];
  if (!word || !curve || !words.length) return finish();

  try {
    sessionStorage.setItem("greeted", "1");
  } catch {}

  const FIRST = 0.42;
  const EACH = 0.12;
  const tl = gsap.timeline({ onComplete: finish });
  tl.from(word.parentElement, { opacity: 0, y: 12, duration: 0.35, ease: "power2.out" }, 0);
  words.slice(1).forEach((w, i) => {
    tl.call(
      () => {
        word.textContent = w.text;
        word.lang = w.lang;
      },
      [],
      FIRST + i * EACH,
    );
  });
  const lift = FIRST + (words.length - 1) * EACH + 0.18;
  tl.to(word.parentElement, { opacity: 0, y: -20, duration: 0.3, ease: "power2.in" }, lift - 0.1)
    .to(el, { yPercent: -100, duration: 0.85, ease: "power3.inOut" }, lift)
    .to(curve, { attr: { d: "M0 0 L100 0 Q50 0 0 0 Z" }, duration: 0.85, ease: "power3.inOut" }, lift)
    .from("[data-hero]", { y: 120, duration: 1.1, ease: "power3.out", clearProps: "transform" }, lift + 0.15);

  function finish() {
    root.classList.remove("preloading");
    el?.remove();
    // Scroll positions were measured while the hero was lifted; measure again.
    ScrollTrigger.refresh();
  }
}
