import { describe, fetchStatus, type StatusPayload } from "./status";
import type { Server } from "../../data/homelab";
import type { HomelabScene } from "./scene";

const REFRESH_MS = 120_000;

// Reduced motion still gets the 3D map, rendered as a still scene.
function canRun3D(): boolean {
  if (!matchMedia("(min-width: 1024px) and (pointer: fine)").matches) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function initHomelab() {
  const section = document.querySelector<HTMLElement>("[data-homelab]");
  if (!section) return;
  const data = JSON.parse(section.querySelector("[data-homelab-data]")?.textContent ?? "{}") as { servers: Server[] };
  const servers = data.servers ?? [];

  const statusEl = section.querySelector<HTMLElement>("[data-status]");
  const statusText = section.querySelector<HTMLElement>("[data-status-text]");
  const statusSub = section.querySelector<HTMLElement>("[data-status-sub]");
  const detail = section.querySelector<HTMLElement>("[data-detail]");
  const template = section.querySelector<HTMLTemplateElement>("[data-detail-template]");
  const picks = [...section.querySelectorAll<HTMLButtonElement>("[data-pick]")];
  const flows = [...section.querySelectorAll<HTMLButtonElement>("[data-flow]")];

  let scene: HomelabScene | null = null;
  let latest: StatusPayload = { available: false };
  let selected: string = servers[0]?.id ?? "jarvis";

  const serviceState = (server: string, name: string): "up" | "down" | "unknown" => {
    const match = latest.services?.find((s) => s.server === server && s.name.toLowerCase() === name.toLowerCase());
    return match ? (match.up ? "up" : "down") : "unknown";
  };

  // ---- status -------------------------------------------------------------
  const renderStatus = () => {
    const d = describe(latest);
    if (statusEl) statusEl.dataset.state = d.state;
    if (statusText) statusText.textContent = d.main;
    if (statusSub) statusSub.textContent = d.sub;

    // Dots on the 2D map.
    section.querySelectorAll<HTMLElement>("[data-server]").forEach((card) => {
      const server = card.dataset.server ?? "";
      card.querySelectorAll<HTMLElement>("[data-service]").forEach((li) => {
        const state = serviceState(server, li.dataset.service ?? "");
        if (state === "unknown") delete li.dataset.state;
        else li.dataset.state = state;
        const sr = li.querySelector<HTMLElement>("[data-service-state]");
        if (sr) sr.textContent = state === "unknown" ? "" : state === "up" ? ", up" : ", down";
      });
    });

    scene?.setStatus(latest.services ?? []);
    renderDetail();
  };

  let timer: number | undefined;
  const refresh = async () => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 8000);
    latest = await fetchStatus(ctrl.signal);
    window.clearTimeout(t);
    renderStatus();
  };

  // ---- details panel (3D mode) ---------------------------------------------
  const renderDetail = () => {
    if (!detail || !template) return;
    const s = servers.find((x) => x.id === selected);
    if (!s) return;
    const node = template.content.cloneNode(true) as DocumentFragment;
    node.querySelector("[data-d-name]")!.textContent = s.name;
    node.querySelector("[data-d-role]")!.textContent = s.role;
    node.querySelector("[data-d-host]")!.textContent = s.host;
    const specs = node.querySelector("[data-d-specs]")!;
    s.specs.forEach((spec) => {
      const li = document.createElement("li");
      li.textContent = spec;
      specs.append(li);
    });
    const list = node.querySelector("[data-d-services]")!;
    s.services.forEach((svc) => {
      const li = document.createElement("li");
      const state = serviceState(s.id, svc.name);
      const dot = document.createElement("span");
      dot.className = `state ${state}`;
      dot.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.textContent = svc.containers && svc.containers > 1 ? `${svc.name} ×${svc.containers}` : svc.name;
      const purpose = document.createElement("span");
      purpose.className = "purpose";
      purpose.textContent = svc.purpose + (state === "unknown" ? "" : state === "up" ? " (up)" : " (down)");
      li.append(dot, name, purpose);
      list.append(li);
    });
    if (!s.services.length) list.remove();
    detail.replaceChildren(node);
  };

  const select = (id: string, fromScene = false) => {
    selected = id;
    picks.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pick === id)));
    if (!fromScene) scene?.select(id);
    renderDetail();
  };

  picks.forEach((b) => b.addEventListener("click", () => select(b.dataset.pick ?? selected)));

  // ---- legend: highlight one kind of traffic ---------------------------------
  let highlighted: string | null = null;
  const setHighlight = (kind: string | null) => {
    highlighted = kind;
    flows.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.flow === kind)));
    scene?.highlight(kind);
  };
  flows.forEach((b) => {
    b.addEventListener("click", () => setHighlight(highlighted === b.dataset.flow ? null : (b.dataset.flow ?? null)));
    b.addEventListener("pointerenter", () => scene?.highlight(b.dataset.flow ?? null));
    b.addEventListener("pointerleave", () => scene?.highlight(highlighted));
  });

  // ---- lifecycle: load status and the 3D scene only when the section is near ----
  const wrap = section.querySelector<HTMLElement>("[data-canvas-wrap]");
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    refresh();
    timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);

    if (wrap && canRun3D()) {
      try {
        const { createHomelabScene } = await import("./scene");
        section.classList.add("has-3d");
        section.querySelector("[data-picker]")?.removeAttribute("hidden");
        scene = createHomelabScene(wrap, servers, {
          still: matchMedia("(prefers-reduced-motion: reduce)").matches,
          onHover: (id) => {
            if (id) select(id, true);
          },
        });
        scene.setStatus(latest.services ?? []);
        scene.select(selected);
        renderDetail();
      } catch (err) {
        console.warn("3D map unavailable, keeping the 2D map", err);
        section.classList.remove("has-3d");
      }
    }
  };

  new IntersectionObserver(
    (entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        obs.disconnect();
        start();
      }
    },
    { rootMargin: "60% 0px" },
  ).observe(section);

  window.addEventListener("pagehide", () => window.clearInterval(timer));
}
