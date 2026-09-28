import { gsap } from "gsap";
import { pauseScroll, resumeScroll } from "./motion";

/**
 * Home page navigation. Over the hero the top bar sits in the hero's own ink;
 * once the hero has scrolled away the bar slides off and a round menu button
 * pops in at the top right. The button opens a dark panel that slides in from
 * the right with a curved edge that straightens as it lands.
 */
export function initMenu() {
  const nav = document.querySelector<HTMLElement>("[data-nav]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const button = document.querySelector<HTMLButtonElement>("[data-menu-button]");
  const menu = document.querySelector<HTMLElement>("[data-menu]");
  const panel = menu?.querySelector<HTMLElement>("[data-menu-panel]");
  const scrim = menu?.querySelector<HTMLElement>(".scrim");
  const curve = menu?.querySelector<SVGPathElement>("[data-menu-curve]");
  if (!nav || !button || !menu || !panel || !scrim || !curve) return;
  const root = document.documentElement;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- which of the two is showing: the bar over the hero, or the button ----
  if (hero) {
    const navH = nav.offsetHeight || 64;
    new IntersectionObserver(
      ([e]) => {
        const over = e.isIntersecting;
        nav.classList.toggle("on-hero", over);
        nav.classList.toggle("is-away", !over);
        button.classList.toggle("is-shown", !over);
      },
      { rootMargin: `-${navH}px 0px 0px 0px` },
    ).observe(hero);
  } else {
    button.classList.add("is-shown");
  }

  // ---- open and close ----
  const BULGE = "M100 0 Q-100 50 100 100 Z";
  const FLAT = "M100 0 Q100 50 100 100 Z";
  const links = [...panel.querySelectorAll<HTMLElement>(".links li")];
  let open = false;
  let tl: gsap.core.Timeline | null = null;

  const markSection = () => {
    // The dot sits by the section the visitor is looking at.
    const mid = innerHeight / 2;
    let current = "";
    document.querySelectorAll<HTMLElement>("main section[id]").forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) current = s.id;
    });
    panel.querySelectorAll<HTMLAnchorElement>("[data-menu-link]").forEach((a) => {
      const id = a.hash.slice(1);
      a.setAttribute("aria-current", id && id === current ? "true" : "false");
    });
  };

  const show = () => {
    if (open) return;
    open = true;
    markSection();
    syncRoles();
    syncTheme();
    menu.hidden = false;
    root.classList.add("menu-open");
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", "Close menu");
    pauseScroll();
    tl?.kill();
    if (reduced()) {
      gsap.set(panel, { x: 0 });
      gsap.set(scrim, { opacity: 1 });
      curve.setAttribute("d", FLAT);
    } else {
      tl = gsap
        .timeline()
        .to(scrim, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0)
        .fromTo(panel, { xPercent: 100, x: 100 }, { xPercent: 0, x: 0, duration: 0.8, ease: "power3.inOut" }, 0)
        .fromTo(curve, { attr: { d: BULGE } }, { attr: { d: FLAT }, duration: 0.8, ease: "power3.inOut" }, 0)
        .fromTo(links, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.04 }, 0.25);
    }
    panel.querySelector<HTMLElement>("[data-menu-link]")?.focus({ preventScroll: true });
  };

  const hide = (returnFocus = true) => {
    if (!open) return;
    open = false;
    root.classList.remove("menu-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open menu");
    resumeScroll();
    tl?.kill();
    const done = () => {
      menu.hidden = true;
    };
    if (reduced()) done();
    else {
      tl = gsap
        .timeline({ onComplete: done })
        .to(panel, { xPercent: 100, x: 100, duration: 0.65, ease: "power3.inOut" }, 0)
        .to(curve, { attr: { d: BULGE }, duration: 0.65, ease: "power3.inOut" }, 0)
        .to(scrim, { opacity: 0, duration: 0.5, ease: "power2.in" }, 0.1);
    }
    if (returnFocus) button.focus({ preventScroll: true });
  };

  button.addEventListener("click", () => (open ? hide() : show()));
  menu.querySelector("[data-menu-close]")?.addEventListener("click", () => hide());
  addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
      return;
    }
    // Keep Tab inside the panel and its button.
    if (e.key === "Tab") {
      const items = [button, ...panel.querySelectorAll<HTMLElement>("a[href], button")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
      e.preventDefault();
      items[next].focus();
    }
  });

  // Section links: close first, so the page is scrollable again when the
  // smooth-scroll handler takes the click.
  panel.querySelectorAll<HTMLAnchorElement>("[data-menu-link]").forEach((a) =>
    a.addEventListener("click", () => hide(false)),
  );

  // ---- role views: hand the click to the real switcher, so there's no reload ----
  const switcher = document.querySelector<HTMLElement>("[data-role-switcher]");
  const syncRoles = () => {
    const active = switcher?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.dataset.role;
    panel.querySelectorAll<HTMLAnchorElement>("[data-menu-role]").forEach((a) => {
      if (a.dataset.menuRole === active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  };
  panel.querySelectorAll<HTMLAnchorElement>("[data-menu-role]").forEach((a) =>
    a.addEventListener("click", (e) => {
      const real = switcher?.querySelector<HTMLAnchorElement>(`[data-role="${a.dataset.menuRole}"]`);
      if (!real) return;
      e.preventDefault();
      real.click();
      syncRoles();
      hide();
    }),
  );

  // ---- theme: the nav's toggle does the work, with its reveal growing from here ----
  const themeButton = panel.querySelector<HTMLButtonElement>("[data-menu-theme]");
  const themeLabel = panel.querySelector<HTMLElement>("[data-menu-theme-label]");
  const syncTheme = () => {
    const dark = getComputedStyle(root).colorScheme.includes("dark");
    if (themeLabel) themeLabel.textContent = dark ? "Switch to light" : "Switch to dark";
  };
  themeButton?.addEventListener("click", () => {
    const toggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
    if (!toggle) return;
    const r = themeButton.getBoundingClientRect();
    toggle.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }),
    );
    requestAnimationFrame(syncTheme);
    addEventListener("themechange", syncTheme, { once: true });
  });
}
