import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Sticky project stack: as each panel arrives it pushes the previous one back
 * (slightly smaller, dimmed). CSS does the pinning with position: sticky; this
 * only drives the recede effect, scrubbed to scroll.
 */
export function initStack() {
  const stack = document.querySelector<HTMLElement>("[data-stack]");
  if (!stack) return { rebuild() {} };

  let mm: gsap.MatchMedia | null = null;

  const build = () => {
    mm?.revert();
    mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const slots = gsap.utils.toArray<HTMLElement>("[data-stack-slot]", stack);
      const navH = parseFloat(getComputedStyle(document.documentElement).fontSize) * 4;
      slots.forEach((slot, i) => {
        const next = slots[i + 1];
        const panel = slot.querySelector<HTMLElement>("[data-project-panel]");
        const shade = slot.querySelector<HTMLElement>(".shade");
        if (!next || !panel || !shade) return;
        // Recede while the next panel travels from the bottom of the screen to its pinned spot.
        const trigger = { trigger: next, start: "top bottom", end: `top top+=${navH + 24 + (i + 1) * 20}`, scrub: true };
        gsap.fromTo(panel, { scale: 1 }, { scale: 0.94, ease: "none", scrollTrigger: trigger });
        gsap.fromTo(shade, { opacity: 0 }, { opacity: 0.5, ease: "none", scrollTrigger: { ...trigger } });
      });
    });
  };

  build();
  return {
    rebuild() {
      build();
      ScrollTrigger.refresh();
    },
  };
}
