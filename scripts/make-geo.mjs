// Builds public/journey/geo.json for the journey section: a dot map of India
// and its neighbours with India's boundary and its states, and the boundary
// again as rings of longitude/latitude for the globe (the globe's imagery is
// scripts/make-earth.mjs).
//
// Sources:
// - Land: Natural Earth land polygons (public domain), via the world-atlas
//   package's TopoJSON.
// - India's outline: DataMeet's india-composite (CC0), drawn to India's
//   official boundary as shown by the Survey of India, so Jammu & Kashmir and
//   Ladakh (including Gilgit-Baltistan and Aksai Chin) and Arunachal Pradesh
//   are shown whole. https://github.com/datameet/maps/tree/master/Country
// - States and union territories: DataMeet's States/Admin2 (CC BY 4.0), the
//   36 current states and UTs. https://github.com/datameet/maps/tree/master/States
//
// Usage: node scripts/make-geo.mjs   (writes public/journey/geo.json)
import { mkdir, writeFile } from "node:fs/promises";

const LAND = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json";
const INDIA = "https://cdn.jsdelivr.net/gh/datameet/maps@master/Country/india-composite.geojson";
const STATES = "https://raw.githubusercontent.com/datameet/maps/master/States/Admin2.shp";
const OUT = "public/journey/geo.json";


/** The close-up: the subcontinent at a finer grid (must match Journey.astro). */
const REGION = { west: 66, east: 99, south: 5.5, north: 37.5, step: 0.45 };

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
};

// ---- polygons: [rings][points][lon, lat], with bounding boxes ----
const withBox = (rings) => {
  let w = 180, e = -180, s = 90, n = -90;
  for (const [x, y] of rings[0]) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
  }
  return { rings, w, e, s, n };
};

const inRing = (x, y, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inAny = (polys) => (lon, lat) =>
  polys.some((p) => {
    if (lon < p.w || lon > p.e || lat < p.s || lat > p.n) return false;
    if (!inRing(lon, lat, p.rings[0])) return false;
    return !p.rings.slice(1).some((hole) => inRing(lon, lat, hole));
  });

// Land: TopoJSON → polygons.
const topo = await (await get(LAND)).json();
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});
const arcPoints = (i) => (i >= 0 ? arcs[i] : [...arcs[~i]].reverse());
const topoRing = (indices) => indices.flatMap((i, k) => (k ? arcPoints(i).slice(1) : arcPoints(i)));
const landPolys = [];
const collect = (g) => {
  if (g.type === "GeometryCollection") g.geometries.forEach(collect);
  else if (g.type === "Polygon") landPolys.push(withBox(g.arcs.map(topoRing)));
  else if (g.type === "MultiPolygon") g.arcs.forEach((p) => landPolys.push(withBox(p.map(topoRing))));
};
collect(topo.objects.land);
const onLand = inAny(landPolys);

// India: GeoJSON MultiPolygon.
const india = await (await get(INDIA)).json();
const indiaPolys = [];
for (const f of india.features) {
  const g = f.geometry;
  (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach((p) => indiaPolys.push(withBox(p)));
}
const inIndia = inAny(indiaPolys);

// States: an ESRI shapefile of polygons (type 5); every ring is drawn.
const shp = new DataView(await (await get(STATES)).arrayBuffer());
const stateRings = [];
for (let o = 100; o < shp.byteLength; ) {
  const len = shp.getInt32(o + 4) * 2; // big-endian, in 16-bit words
  const c = o + 8;
  if (shp.getInt32(c, true) === 5) {
    const parts = shp.getInt32(c + 36, true);
    const points = shp.getInt32(c + 40, true);
    const pts = c + 44 + parts * 4;
    for (let p = 0; p < parts; p++) {
      const from = shp.getInt32(c + 44 + p * 4, true);
      const to = p + 1 < parts ? shp.getInt32(c + 48 + p * 4, true) : points;
      const ring = [];
      for (let i = from; i < to; i++) ring.push([shp.getFloat64(pts + i * 16, true), shp.getFloat64(pts + i * 16 + 8, true)]);
      stateRings.push(ring);
    }
  }
  o = c + len;
}

// ---- the close-up: grid cells as column/row indices, India's apart ----
const cols = Math.round((REGION.east - REGION.west) / REGION.step);
const rows = Math.round((REGION.north - REGION.south) / REGION.step);
const cells = [];
const indiaCells = [];
for (let r = 0; r <= rows; r++) {
  const lat = REGION.north - r * REGION.step;
  for (let c = 0; c <= cols; c++) {
    const lon = REGION.west + c * REGION.step;
    if (inIndia(lon, lat)) indiaCells.push(c, r);
    else if (onLand(lon, lat)) cells.push(c, r);
  }
}

// ---- outlines as SVG paths in grid units, simplified (Douglas-Peucker) ----
const toGrid = ([lon, lat]) => [(lon - REGION.west) / REGION.step, (REGION.north - lat) / REGION.step];

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let far = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > max) (max = d), (far = i);
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const f1 = (v) => Math.round(v * 10) / 10;
/** Rings → one path. Rings smaller than `dot` grid units become a dot, so
 *  small islands (Lakshadweep, the smaller Andamans) still show. */
function toPath(rings, tol, dot) {
  let d = "";
  const dots = new Set();
  for (const ring of rings) {
    const g = ring.map(toGrid);
    let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
    for (const [x, y] of g) {
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    }
    if (e - w < dot && n - s < dot) {
      const key = `${f1((w + e) / 2)} ${f1((s + n) / 2)}`;
      if (!dots.has(key)) dots.add(key), (d += `M${key}h0`);
      continue;
    }
    // A closed ring starts and ends on the same point, which Douglas-Peucker
    // can't measure against, so simplify it as two halves split at the point
    // farthest from the start.
    let far = 0;
    for (let i = 1, best = 0; i < g.length; i++) {
      const dist = Math.hypot(g[i][0] - g[0][0], g[i][1] - g[0][1]);
      if (dist > best) (best = dist), (far = i);
    }
    const pts = [...simplify(g.slice(0, far + 1), tol), ...simplify(g.slice(far), tol).slice(1)];
    if (pts.length < 4) continue;
    d += "M" + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L") + "Z";
  }
  return d;
}

const border = toPath(indiaPolys.flatMap((p) => p.rings), 0.08, 0.35);

// For the globe: the same boundary in degrees, simplified, without the islands
// too small to see from orbit.
const globeBorder = [];
for (const ring of indiaPolys.flatMap((p) => p.rings)) {
  let w = 180, e = -180, s = 90, n = -90;
  for (const [x, y] of ring) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
  }
  if (e - w < 0.6 && n - s < 0.6) continue;
  let far = 0;
  for (let i = 1, best = 0; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) (best = d), (far = i);
  }
  const pts = [...simplify(ring.slice(0, far + 1), 0.04), ...simplify(ring.slice(far), 0.04).slice(1)];
  if (pts.length >= 4) globeBorder.push(pts.flatMap(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
}
const states = toPath(stateRings, 0.12, 0.6);

await mkdir("public/journey", { recursive: true });
const out = {
  globeBorder,
  region: { ...REGION, cols, rows, cells, india: indiaCells, border, states },
};
const json = JSON.stringify(out);
await writeFile(OUT, json);
console.log(
  `wrote ${OUT} (${(json.length / 1024).toFixed(0)} KB): ${globeBorder.length} globe rings, ` +
    `${cells.length / 2} + ${indiaCells.length / 2} map dots, border ${border.length} B, states ${states.length} B`,
);
