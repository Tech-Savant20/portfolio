import * as THREE from "three";

/**
 * The journey's opening globe: land as dots on a sphere, the places he lived
 * as accent dots. `setProgress(0..1)` turns it from the far side of the world
 * to India and zooms in; it renders only when something changes.
 */

export interface GlobeOptions {
  /** Land dots as [lon, lat, lon, lat, ...]. */
  land: number[];
  /** Dots inside India's official boundary, drawn stronger. */
  india: number[];
  places: { lon: number; lat: number }[];
  /** Where it ends up facing. */
  focus: { lon: number; lat: number };
}

export interface Globe {
  setProgress(p: number): void;
  setColors(): void;
  resize(): void;
  dispose(): void;
}

const RAD = Math.PI / 180;

/** lon 0 faces the camera (+z); y is north. */
const toXYZ = (lon: number, lat: number, r = 1) => [
  r * Math.cos(lat * RAD) * Math.sin(lon * RAD),
  r * Math.sin(lat * RAD),
  r * Math.cos(lat * RAD) * Math.cos(lon * RAD),
];

const cssColor = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** A soft round dot, so points aren't squares. */
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGlobe(container: HTMLElement, opts: GlobeOptions): Globe {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  const globe = new THREE.Group();
  scene.add(globe);

  const sprite = dotTexture();

  // The sphere itself hides the dots on the far side.
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.985, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  globe.add(body);

  const dots = (lonLat: number[]) => {
    const pos = new Float32Array((lonLat.length / 2) * 3);
    for (let i = 0; i < lonLat.length; i += 2) pos.set(toXYZ(lonLat[i], lonLat[i + 1]), (i / 2) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return geo;
  };
  const landGeo = dots(opts.land);
  const landMat = new THREE.PointsMaterial({ size: 0.022, map: sprite, transparent: true, opacity: 0.45, depthWrite: false });
  globe.add(new THREE.Points(landGeo, landMat));
  const indiaGeo = dots(opts.india);
  const indiaMat = new THREE.PointsMaterial({ size: 0.026, map: sprite, transparent: true, depthWrite: false });
  globe.add(new THREE.Points(indiaGeo, indiaMat));

  const placePos = new Float32Array(opts.places.length * 3);
  opts.places.forEach((p, i) => placePos.set(toXYZ(p.lon, p.lat, 1.004), i * 3));
  const placeGeo = new THREE.BufferGeometry();
  placeGeo.setAttribute("position", new THREE.BufferAttribute(placePos, 3));
  const placeMat = new THREE.PointsMaterial({ size: 0.06, map: sprite, transparent: true, depthWrite: false });
  globe.add(new THREE.Points(placeGeo, placeMat));

  // A thin ring round the edge of the globe.
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.006, 128),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 }),
  );
  scene.add(rim);

  const setColors = () => {
    const bg = new THREE.Color(cssColor("--bg", "#0d0d0e"));
    (body.material as THREE.MeshBasicMaterial).color = bg;
    landMat.color = new THREE.Color(cssColor("--fg-subtle", "#8a8a8a"));
    indiaMat.color = new THREE.Color(cssColor("--fg", "#ededea"));
    placeMat.color = new THREE.Color(cssColor("--accent", "#ff5a1f"));
    (rim.material as THREE.MeshBasicMaterial).color = new THREE.Color(cssColor("--line-strong", "#444"));
    render();
  };

  let progress = 0;
  const START_LON = opts.focus.lon - 150;
  const START_LAT = 8;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);

  function render() {
    const t = ease(progress);
    const lon = START_LON + (opts.focus.lon - START_LON) * t;
    const lat = START_LAT + (opts.focus.lat - START_LAT) * t;
    // Turn the chosen point to face the camera: spin by longitude, tilt by latitude.
    globe.rotation.set(lat * RAD, -lon * RAD, 0, "XYZ");
    camera.position.set(0, 0, 6.2 - 3.3 * t);
    camera.lookAt(0, 0, 0);
    rim.visible = t < 0.35;
    renderer.render(scene, camera);
  }

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };

  resize();
  setColors();

  return {
    setProgress(p: number) {
      const next = Math.min(1, Math.max(0, p));
      if (Math.abs(next - progress) < 0.0005) return;
      progress = next;
      render();
    },
    setColors,
    resize,
    dispose() {
      renderer.dispose();
      landGeo.dispose();
      indiaGeo.dispose();
      placeGeo.dispose();
      sprite.dispose();
      renderer.domElement.remove();
    },
  };
}
