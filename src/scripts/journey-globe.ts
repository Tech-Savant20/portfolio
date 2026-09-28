import * as THREE from "three";

/**
 * The journey's opening globe: the real Earth (NASA Blue Marble, public
 * domain), lit from the upper left, with a thin atmosphere, the places he
 * lived as accent dots and India's official boundary as a line.
 * `setProgress(0..1)` turns it from the far side of the world to India and
 * zooms in; it renders only when something changes.
 *
 * Two textures: the whole world at 2048 px (plenty while the globe is small),
 * and a sharper patch over the subcontinent for the close-up, laid on a
 * slightly larger piece of sphere and feathered at its edges.
 * Both are made by scripts/make-earth.mjs.
 */

export interface GlobeOptions {
  places: { lon: number; lat: number }[];
  /** India's boundary, as rings of [lon, lat, lon, lat, ...]. */
  border: number[][];
  /** Where it ends up facing. */
  focus: { lon: number; lat: number };
}

export interface Globe {
  setProgress(p: number): void;
  setColors(): void;
  resize(): void;
  dispose(): void;
}

/** Must match scripts/make-earth.mjs. */
const PATCH = { west: 60, east: 104, south: 0, north: 44 };
const WORLD_URL = "/journey/earth-world.webp";
const PATCH_URL = "/journey/earth-india.webp";

const RAD = Math.PI / 180;

/** lon 0 faces the camera (+z); y is north. */
const toXYZ = (lon: number, lat: number, r = 1): [number, number, number] => [
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

/** A glow round the rim, brightest at the edge of the disc. */
function atmosphere() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.07, 64, 48),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { tint: { value: new THREE.Color("#5aa9ff") } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 tint;
        varying vec3 vNormal;
        void main() {
          float rim = pow(clamp(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0);
          gl_FragColor = vec4(tint, 1.0) * rim * 0.7;
        }`,
    }),
  );
}

export function createGlobe(container: HTMLElement, opts: GlobeOptions): Globe {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  const globe = new THREE.Group();
  scene.add(globe);

  // Light stays with the camera, so the side facing us is always day.
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-3, 2.2, 4);
  scene.add(sun);

  const loader = new THREE.TextureLoader();
  const load = (url: string) =>
    loader.loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    });

  // Three's sphere starts its texture at a different longitude from the
  // equirectangular images; a quarter turn lines them up with toXYZ.
  const earthMat = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.92, metalness: 0 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMat);
  earth.rotation.y = -Math.PI / 2;
  globe.add(earth);

  const patchMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.92, metalness: 0, visible: false });
  const patch = new THREE.Mesh(
    new THREE.SphereGeometry(
      1.0006,
      64,
      64,
      (PATCH.west + 180) * RAD,
      (PATCH.east - PATCH.west) * RAD,
      (90 - PATCH.north) * RAD,
      (PATCH.north - PATCH.south) * RAD,
    ),
    patchMat,
  );
  patch.rotation.y = -Math.PI / 2;
  globe.add(patch);

  const textures: THREE.Texture[] = [];
  load(WORLD_URL)
    .then((t) => {
      textures.push(t);
      earthMat.map = t;
      earthMat.color.set(0xffffff);
      earthMat.needsUpdate = true;
      render();
      return load(PATCH_URL);
    })
    .then((t) => {
      textures.push(t);
      patchMat.map = t;
      patchMat.visible = true;
      patchMat.needsUpdate = true;
      render();
    })
    .catch(() => {});

  const air = atmosphere();
  scene.add(air);

  // India's official boundary, just above the surface.
  const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
  const borderGeos = opts.border.map((ring) => {
    const pts: number[] = [];
    for (let i = 0; i < ring.length; i += 2) pts.push(...toXYZ(ring[i], ring[i + 1], 1.0015));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    globe.add(new THREE.LineLoop(geo, borderMat));
    return geo;
  });

  const sprite = dotTexture();
  const placePos = new Float32Array(opts.places.length * 3);
  opts.places.forEach((p, i) => placePos.set(toXYZ(p.lon, p.lat, 1.004), i * 3));
  const placeGeo = new THREE.BufferGeometry();
  placeGeo.setAttribute("position", new THREE.BufferAttribute(placePos, 3));
  const placeMat = new THREE.PointsMaterial({ size: 0.045, map: sprite, transparent: true, depthWrite: false });
  globe.add(new THREE.Points(placeGeo, placeMat));

  const setColors = () => {
    placeMat.color = new THREE.Color(cssColor("--accent", "#ff5a1f"));
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
    camera.position.set(0, 0, 6.2 - 3.4 * t);
    camera.lookAt(0, 0, 0);
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
      earth.geometry.dispose();
      patch.geometry.dispose();
      air.geometry.dispose();
      placeGeo.dispose();
      borderGeos.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      sprite.dispose();
      renderer.domElement.remove();
    },
  };
}
