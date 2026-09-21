import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

export interface RoleView {
  key: string;
  path: string;
  title: string;
  description: string;
  heroTitle: string;
  heroBody: string;
  projectOrder: string[];
  skillOrder: string[];
  homelabFirst: boolean;
  resume: string | null;
  og: string;
}

const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789/_-";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Swaps text by resolving it left to right through random glyphs. */
function scramble(el: HTMLElement, next: string, duration = 650): Promise<void> {
  if (reduced() || !el.isConnected) {
    el.textContent = next;
    return Promise.resolve();
  }
  const from = el.textContent ?? "";
  const length = Math.max(from.length, next.length);
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const settled = Math.floor(t * length);
      let out = "";
      for (let i = 0; i < length; i++) {
        const target = next[i] ?? "";
        if (i < settled) out += target;
        else if (target === " " || target === "") out += target;
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(step);
      else {
        el.textContent = next;
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

export function initRoleSwitch(opts: { onLayoutChange?: () => void } = {}) {
  const dataEl = document.querySelector("[data-roles]");
  const switcher = document.querySelector<HTMLElement>("[data-role-switcher]");
  if (!dataEl || !switcher) return;
  const views = JSON.parse(dataEl.textContent ?? "{}") as Record<string, RoleView>;
  const byPath = (path: string) => Object.values(views).find((v) => v.path === path);
  let current = Object.values(views).find((v) => v.path === location.pathname) ?? views.backend;

  const remember = (v: RoleView) => {
    try {
      sessionStorage.setItem("rolePath", v.path);
    } catch {}
  };
  remember(current);

  const announcer = document.createElement("p");
  announcer.className = "sr-only";
  announcer.setAttribute("aria-live", "polite");
  document.body.append(announcer);

  // Canonical URLs stay on the site's own domain, whichever host served the page.
  const siteOrigin = (() => {
    try {
      return new URL(document.querySelector("[data-canonical]")?.getAttribute("href") ?? "").origin;
    } catch {
      return location.origin;
    }
  })();

  const setMeta = (v: RoleView) => {
    document.title = v.title;
    const url = new URL(v.path, siteOrigin).href;
    document.querySelector('meta[name="description"]')?.setAttribute("content", v.description);
    document.querySelector("[data-canonical]")?.setAttribute("href", url);
    document.querySelector("[data-og-url]")?.setAttribute("content", url);
    document.querySelector("[data-og-title]")?.setAttribute("content", v.title);
    document.querySelector("[data-og-description]")?.setAttribute("content", v.description);
    document.querySelector("[data-og-image]")?.setAttribute("content", new URL(v.og, siteOrigin).href);
  };

  const reorder = (v: RoleView) => {
    // Sticky project stack.
    const stack = document.querySelector<HTMLElement>("[data-stack]");
    if (stack) {
      v.projectOrder.forEach((slug, i) => {
        const slot = stack.querySelector<HTMLElement>(`[data-stack-slot][data-slug="${slug}"]`);
        if (!slot) return;
        slot.style.setProperty("--i", String(i));
        stack.append(slot);
      });
    }

    // Skills bento: the first group is featured, so let the cells glide into place.
    const bento = document.querySelector<HTMLElement>("[data-skills]");
    if (bento) {
      const cells = [...bento.querySelectorAll<HTMLElement>("[data-skill-group]")];
      const state = reduced() ? null : Flip.getState(cells);
      v.skillOrder.forEach((key) => {
        const cell = cells.find((c) => c.dataset.skillGroup === key);
        if (cell) bento.append(cell);
      });
      if (state) Flip.from(state, { duration: 0.8, ease: "power3.inOut", absolute: true, nested: true });
    }

    // The homelab moves up for cloud visitors.
    const homelab = document.querySelector('[data-section="homelab"]');
    const work = document.querySelector('[data-section="work"]');
    const small = document.querySelector('[data-section="small"]');
    if (homelab && work && small) {
      if (v.homelabFirst) work.before(homelab);
      else small.after(homelab);
    }
  };

  const apply = async (v: RoleView, push: boolean) => {
    if (v.key === current.key) return;
    current = v;
    remember(v);

    switcher.querySelectorAll<HTMLAnchorElement>("[data-role]").forEach((a, i) => {
      const on = a.dataset.role === v.key;
      if (on) {
        a.setAttribute("aria-current", "page");
        switcher.style.setProperty("--i", String(i));
      } else a.removeAttribute("aria-current");
    });
    document.querySelector("[data-home-link]")?.setAttribute("href", v.path);

    const resume = document.querySelector<HTMLAnchorElement>("[data-resume-link]");
    if (resume && v.resume) resume.href = v.resume;

    setMeta(v);
    if (push) history.pushState({ role: v.key }, "", v.path);
    reorder(v);
    opts.onLayoutChange?.();
    announcer.textContent = `Showing the ${v.heroTitle.replace(".", "").toLowerCase()} view.`;

    const line = document.querySelector<HTMLElement>("[data-hero-line]");
    const title = document.querySelector<HTMLElement>("[data-hero-title]");
    const body = document.querySelector<HTMLElement>("[data-hero-body]");
    line?.setAttribute("aria-busy", "true");
    await Promise.all([title && scramble(title, v.heroTitle, 520), body && scramble(body, v.heroBody, 760)]);
    line?.setAttribute("aria-busy", "false");
  };

  switcher.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-role]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const v = views[a.dataset.role ?? ""];
    if (!v) return;
    e.preventDefault();
    apply(v, true);
  });

  window.addEventListener("popstate", () => {
    const v = byPath(location.pathname);
    if (v) apply(v, false);
  });
}
