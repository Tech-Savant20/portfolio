/**
 * Fades [data-reveal] elements in as they enter the viewport. Elements that
 * are already on screen when this runs are marked visible first, so nothing
 * above the fold flashes.
 */
export function initReveal() {
  const items = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
  if (!items.length || !("IntersectionObserver" in window)) return;

  const vh = window.innerHeight;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add("is-in");
  }
  document.documentElement.classList.add("reveal-ready");

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  items.filter((el) => !el.classList.contains("is-in")).forEach((el) => io.observe(el));
}
