/**
 * The hero name thins out around the pointer, like light passing over it.
 * Pointer devices with motion allowed only. Weights ease towards their target
 * each frame and the loop stops once everything is back at rest.
 */
export function initHeroPointer() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const name = document.querySelector<HTMLElement>("[data-hero-name]");
  if (!hero || !name) return;
  if (!matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;

  const REST = 700;
  const DIP = 480;
  const chars = [...name.querySelectorAll<HTMLElement>(".char")];
  const weights = chars.map(() => REST);
  let centers: [number, number][] = [];
  let measuredAt = -1;
  let px = 0;
  let py = 0;
  let active = false;
  let raf = 0;

  const measure = () => {
    centers = chars.map((c) => {
      const r = c.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    });
    measuredAt = window.scrollY;
  };

  const tick = () => {
    raf = 0;
    if (active && measuredAt !== window.scrollY) measure();
    const radius = Math.max(120, name.getBoundingClientRect().height * 0.9);
    let moving = false;
    chars.forEach((c, i) => {
      const [cx, cy] = centers[i] ?? [0, 0];
      const d2 = (px - cx) ** 2 + ((py - cy) * 1.3) ** 2;
      const target = active ? REST - DIP * Math.exp(-d2 / (2 * radius * radius)) : REST;
      const next = weights[i] + (target - weights[i]) * 0.16;
      if (Math.abs(next - weights[i]) > 0.4) moving = true;
      weights[i] = next;
      c.style.fontVariationSettings = `"wght" ${next.toFixed(1)}`;
    });
    if (moving || active) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  hero.addEventListener("pointermove", (e) => {
    px = e.clientX;
    py = e.clientY;
    if (!active) {
      measure();
      active = true;
    }
    kick();
  });
  hero.addEventListener("pointerleave", () => {
    active = false;
    kick();
  });
  window.addEventListener("resize", () => (measuredAt = -1));
}
