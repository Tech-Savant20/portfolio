import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { flows, links, type Server, type FlowKind } from "../../data/homelab";
import type { ServiceStatus } from "./status";

export interface HomelabScene {
  select(id: string): void;
  highlight(kind: string | null): void;
  setStatus(services: ServiceStatus[]): void;
  dispose(): void;
}

interface Palette {
  fg: THREE.Color;
  muted: THREE.Color;
  line: THREE.Color;
  accent: THREE.Color;
  plate: THREE.Color;
  plateEdge: THREE.Color;
  block: THREE.Color;
  unknown: THREE.Color;
  surface: THREE.Color;
  grid: THREE.Color;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function readPalette(): Palette {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    fg: new THREE.Color(css("--fg")),
    muted: new THREE.Color(css("--fg-muted")),
    line: new THREE.Color(css("--fg-subtle")),
    accent: new THREE.Color(css("--accent")),
    plate: new THREE.Color(dark ? "#1b1b1e" : "#dcdcd6"),
    plateEdge: new THREE.Color(dark ? "#5a5a60" : "#8e8e94"),
    block: new THREE.Color(dark ? "#d6d6d1" : "#3a3a3e"),
    // Without live data, blocks keep their normal tone; only "down" is ever coloured.
    unknown: new THREE.Color(dark ? "#b9b9b4" : "#55555a"),
    surface: new THREE.Color(css("--surface")),
    grid: new THREE.Color(dark ? "#3a3a3f" : "#c4c4be"),
  };
}

const BLOCK = 0.62;
const PITCH = 0.95;

interface Packet {
  mesh: THREE.Mesh;
  curve: THREE.QuadraticBezierCurve3;
  reverse: boolean;
  kind: FlowKind;
  period: number;
  offset: number;
}

interface Platform {
  id: string;
  group: THREE.Group;
  plate: THREE.Mesh;
  edges: THREE.LineSegments;
  label: CSS2DObject;
  blocks: { mesh: THREE.Mesh; service: string }[];
}

const PACKET_SPEC: Record<FlowKind, { count: number; period: number; make: () => THREE.BufferGeometry }> = {
  health: { count: 3, period: 2.6, make: () => new THREE.SphereGeometry(0.09, 12, 12) },
  backup: { count: 1, period: 6.5, make: () => new THREE.BoxGeometry(0.34, 0.2, 0.2) },
  metrics: { count: 4, period: 3.4, make: () => new THREE.SphereGeometry(0.055, 8, 8) },
  sync: { count: 2, period: 4.8, make: () => new THREE.BoxGeometry(0.42, 0.06, 0.06) },
};

export function createHomelabScene(
  wrap: HTMLElement,
  servers: Server[],
  opts: {
    /** Reduced motion: a still scene, re-rendered only when something changes. */
    still?: boolean;
    onHover?: (id: string | null) => void;
  } = {},
): HomelabScene {
  const still = opts.still ?? false;
  let palette = readPalette();

  // ---- renderer, camera, labels ---------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.append(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.style.position = "absolute";
  labels.domElement.style.inset = "0";
  labels.domElement.style.pointerEvents = "none";
  wrap.append(labels.domElement);

  const scene = new THREE.Scene();
  // Fog in the surface colour fades the floor grid and far platforms into the page.
  scene.fog = new THREE.Fog(palette.surface, 30, 62);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const target = new THREE.Vector3(-0.3, 0, 1.2);

  const grid = new THREE.GridHelper(60, 60, palette.grid, palette.grid);
  grid.position.y = -0.12;
  (grid.material as THREE.LineBasicMaterial).transparent = true;
  (grid.material as THREE.LineBasicMaterial).opacity = 0.45;
  scene.add(grid);

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-6, 14, 9);
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);

  // ---- platforms and container blocks ----------------------------------------
  const blockGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
  const platforms = new Map<string, Platform>();

  for (const s of servers) {
    const group = new THREE.Group();
    group.position.set(s.scene.x, 0, s.scene.z);
    world.add(group);

    const units = s.services.flatMap((svc) => Array.from({ length: svc.containers ?? 1 }, () => svc.name));
    const cols = Math.max(2, Math.ceil(Math.sqrt(units.length * 1.3)));
    const rows = Math.max(1, Math.ceil(units.length / cols));
    const w = s.peer ? 2.2 : cols * PITCH + 0.9;
    const d = s.peer ? 1.5 : rows * PITCH + 0.9;

    const plateGeo = new THREE.BoxGeometry(w, 0.22, d);
    const plate = new THREE.Mesh(
      plateGeo,
      new THREE.MeshLambertMaterial({ color: palette.plate, transparent: true, opacity: s.peer ? 0.35 : 0.92 }),
    );
    plate.userData.server = s.id;
    group.add(plate);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(plateGeo),
      new THREE.LineBasicMaterial({ color: palette.plateEdge, transparent: true, opacity: 0.9 }),
    );
    group.add(edges);

    const blocks: Platform["blocks"] = [];
    units.forEach((service, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const mesh = new THREE.Mesh(blockGeo, new THREE.MeshLambertMaterial({ color: palette.unknown }));
      mesh.position.set(
        (c - (cols - 1) / 2) * PITCH,
        0.11 + BLOCK / 2,
        (r - (rows - 1) / 2) * PITCH,
      );
      mesh.userData.server = s.id;
      group.add(mesh);
      blocks.push({ mesh, service: service.toLowerCase() });
    });

    // A peer is a device, not a server: a closed laptop instead of containers.
    if (s.peer) {
      const device = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.1, 0.9),
        new THREE.MeshLambertMaterial({ color: palette.unknown }),
      );
      device.position.y = 0.16;
      device.userData.server = s.id;
      group.add(device);
      blocks.push({ mesh: device, service: "" });
    }

    const el = document.createElement("div");
    el.className = "label3d";
    el.textContent = s.name;
    const label = new CSS2DObject(el);
    label.position.set(-w / 2 + 0.2, 1.4, -d / 2);
    label.center.set(0, 1);
    group.add(label);

    platforms.set(s.id, { id: s.id, group, plate, edges, label, blocks });
  }

  // ---- Tailscale arcs and the packets riding them -----------------------------
  const curves = new Map<string, THREE.QuadraticBezierCurve3>();
  const lineMaterial = new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.55 });
  const arcs: THREE.Line[] = [];
  for (const [a, b] of links) {
    const pa = platforms.get(a)!.group.position;
    const pb = platforms.get(b)!.group.position;
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y = 3.2 + pa.distanceTo(pb) * 0.18;
    // Arcs leave from just above the container blocks, not through them.
    const start = pa.clone().setY(1.25);
    const end = pb.clone().setY(1.25);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    curves.set(`${a}:${b}`, curve);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)), lineMaterial.clone());
    line.userData.link = `${a}:${b}`;
    world.add(line);
    arcs.push(line);
  }

  const packetMaterials = new Map<FlowKind, THREE.MeshBasicMaterial>();
  const packets: Packet[] = [];
  for (const f of flows) {
    const forward = curves.get(`${f.from}:${f.to}`);
    const backward = curves.get(`${f.to}:${f.from}`);
    const curve = forward ?? backward;
    if (!curve) continue;
    const spec = PACKET_SPEC[f.kind];
    if (!packetMaterials.has(f.kind)) {
      packetMaterials.set(
        f.kind,
        new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: f.kind === "metrics" ? 0.75 : 1 }),
      );
    }
    const geo = spec.make();
    for (let i = 0; i < spec.count; i++) {
      const mesh = new THREE.Mesh(geo, packetMaterials.get(f.kind)!);
      world.add(mesh);
      packets.push({
        mesh,
        curve,
        reverse: !forward,
        kind: f.kind,
        period: spec.period,
        offset: i / spec.count + Math.random() * 0.1,
      });
    }
  }

  // ---- state: status, selection, highlight -------------------------------------
  let status: ServiceStatus[] = [];
  let selected: string | null = null;
  let hovered: string | null = null;
  let highlighted: string | null = null;
  // Requests a frame; assigned once the render loop exists.
  let invalidate = () => {};

  const applyColors = () => {
    for (const p of platforms.values()) {
      const active = p.id === (hovered ?? selected);
      (p.plate.material as THREE.MeshLambertMaterial).color.copy(palette.plate);
      (p.edges.material as THREE.LineBasicMaterial).color.copy(active ? palette.accent : palette.plateEdge);
      p.label.element.classList.toggle("is-active", active);
      for (const b of p.blocks) {
        const match = status.find((s) => s.server === p.id && s.name.toLowerCase() === b.service);
        const color = !match ? palette.unknown : match.up ? palette.block : palette.accent;
        (b.mesh.material as THREE.MeshLambertMaterial).color.copy(color);
      }
    }
    (scene.fog as THREE.Fog).color.copy(palette.surface);
    (grid.material as THREE.LineBasicMaterial).color.copy(palette.grid);
    lineMaterial.color.copy(palette.line);
    arcs.forEach((a) => (a.material as THREE.LineBasicMaterial).color.copy(palette.line));
    for (const [kind, m] of packetMaterials) {
      m.color.copy(palette.accent);
      const base = kind === "metrics" ? 0.75 : 1;
      m.opacity = highlighted && highlighted !== kind ? 0.1 : base;
    }
    // Arcs that carry the highlighted kind stay bright; the rest recede.
    arcs.forEach((a) => {
      const [x, y] = String(a.userData.link).split(":");
      const carries = !highlighted || flows.some((f) => f.kind === highlighted && ((f.from === x && f.to === y) || (f.from === y && f.to === x)));
      (a.material as THREE.LineBasicMaterial).opacity = carries ? 0.7 : 0.15;
    });
    invalidate();
  };
  applyColors();

  // ---- sizing ------------------------------------------------------------------
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = wrap;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    // Pull back on narrower stages so every platform stays in frame.
    camera.userData.distance = 27.5 * Math.max(1, 1.45 / camera.aspect);
    camera.updateProjectionMatrix();
    invalidate();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  // ---- pointer: hover a server to inspect it -----------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const pickables = [...platforms.values()].flatMap((p) => [p.plate, ...p.blocks.map((b) => b.mesh)]);

  const onMove = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    parallax.tx = pointer.x;
    parallax.ty = pointer.y;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    const id = (hit?.object.userData.server as string | undefined) ?? null;
    if (id !== hovered) {
      hovered = id;
      renderer.domElement.style.cursor = id ? "pointer" : "";
      applyColors();
      opts.onHover?.(id);
    }
  };
  const onLeave = () => {
    hovered = null;
    parallax.tx = 0;
    parallax.ty = 0;
    renderer.domElement.style.cursor = "";
    applyColors();
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", onLeave);

  const onTheme = () => {
    // Wait a frame so the new CSS variables are in place.
    requestAnimationFrame(() => {
      palette = readPalette();
      applyColors();
    });
  };
  window.addEventListener("themechange", onTheme);

  // ---- loop: runs only while the stage is on screen and the tab is visible -------
  const startedAt = performance.now();
  let raf = 0;
  let onScreen = false;
  const section = wrap.closest("section") ?? wrap;

  const frame = () => {
    raf = 0;
    if (!onScreen || document.visibilityState !== "visible") return;
    // Still mode freezes packets part-way along their routes.
    const t = still ? 0 : (performance.now() - startedAt) / 1000;

    // Orbit follows scroll through the section, plus a little pointer parallax.
    let azimuthDeg = -8;
    let polarDeg = 54;
    if (!still) {
      const rect = section.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (innerHeight - rect.top) / (innerHeight + rect.height)));
      parallax.x += (parallax.tx - parallax.x) * 0.05;
      parallax.y += (parallax.ty - parallax.y) * 0.05;
      azimuthDeg = -24 + progress * 36 + parallax.x * 4;
      polarDeg = 54 - parallax.y * 3;
    }
    const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
    const polar = THREE.MathUtils.degToRad(polarDeg);
    const dist = (camera.userData.distance as number) ?? 31;
    camera.position.set(
      target.x + dist * Math.sin(polar) * Math.sin(azimuth),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(azimuth),
    );
    camera.lookAt(target);

    for (const p of packets) {
      let u = ((t / p.period + p.offset) % 1 + 1) % 1;
      if (p.reverse) u = 1 - u;
      p.curve.getPoint(u, p.mesh.position);
      const ahead = p.curve.getPoint(Math.min(1, Math.max(0, u + (p.reverse ? -0.01 : 0.01))));
      p.mesh.lookAt(ahead);
    }

    renderer.render(scene, camera);
    labels.render(scene, camera);
    if (!still) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && onScreen) raf = requestAnimationFrame(frame);
  };
  invalidate = kick;

  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    kick();
  });
  io.observe(wrap);
  document.addEventListener("visibilitychange", kick);

  return {
    select(id) {
      selected = id;
      applyColors();
    },
    highlight(kind) {
      highlighted = kind;
      applyColors();
    },
    setStatus(services) {
      status = services;
      applyColors();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("themechange", onTheme);
      document.removeEventListener("visibilitychange", kick);
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
