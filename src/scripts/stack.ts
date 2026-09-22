import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Sticky project stack, played as a deck of cards. CSS does the pinning with
 * position: sticky; this drives the depth, scrubbed to scroll:
 * - an arriving panel starts tipped back and lands flat as it reaches its spot;
 * - the panel it covers tips back into the screen from its top edge, shrinks
 *   and dims, so the stacked top edges stay lined up above the new one.
 * Arrival tilts the slot and the recede tilts the panel inside it, so the two
 * never fight over one transform.
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
        if (!panel || !shade) return;

        if (i > 0) {
          gsap.fromTo(
            slot,
            { rotationX: -16, transformPerspective: 1800, transformOrigin: "50% 0%" },
            {
              rotationX: 0,
              ease: "power1.out",
              scrollTrigger: { trigger: slot, start: "top bottom", end: "top 30%", scrub: true },
            },
          );
        }

        if (!next) return;
        // Runs while the next panel travels from the bottom of the screen to its pinned spot.
        const pinTop = navH + 24 + (i + 1) * 20;
        gsap
          .timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: next, start: "top bottom", end: `top top+=${pinTop}`, scrub: true },
          })
          .fromTo(panel, { rotationX: 0, scale: 1, transformPerspective: 1800 }, { rotationX: -9, scale: 0.92 }, 0)
          .fromTo(shade, { opacity: 0 }, { opacity: 0.6 }, 0);
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
