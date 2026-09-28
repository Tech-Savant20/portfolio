// Builds the journey globe's imagery from NASA's Blue Marble Next Generation
// (topography and bathymetry, December 2004; public domain, NASA Earth
// Observatory):
//
//   public/journey/earth-world.webp   the whole world, 2048 x 1024
//   public/journey/earth-india.webp   the subcontinent (60-104 E, 0-44 N),
//                                     sharper, with feathered edges
//
// The full-resolution tiles are large (about 160 MB for the two needed), so
// they're downloaded once into a cache folder outside the project.
//
// Usage: node scripts/make-earth.mjs [cacheDir]
import sharp from "sharp";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

sharp.cache(false);

const BASE = "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/";
const FILES = {
  world: "world.topo.bathy.200412.3x5400x2700.jpg",
  C1: "world.topo.bathy.200412.3x21600x21600.C1.jpg", // 0-90 E, 90-0 N
  D1: "world.topo.bathy.200412.3x21600x21600.D1.jpg", // 90-180 E, 90-0 N
};
/** Must match src/scripts/journey-globe.ts. */
const PATCH = { west: 60, east: 104, south: 0, north: 44 };
const PATCH_PX = 1792;
/** Tiles are shrunk on load to this many pixels per degree before cropping. */
const PPD = 60;

const cache = process.argv[2] ?? join(tmpdir(), "blue-marble");
await mkdir(cache, { recursive: true });
const path = async (name) => {
  const file = join(cache, name);
  if (!existsSync(file)) {
    console.log(`downloading ${name}…`);
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
};

await mkdir("public/journey", { recursive: true });

// The whole world.
await sharp(await path(FILES.world))
  .resize(2048, 1024)
  .webp({ quality: 80 })
  .toFile("public/journey/earth-world.webp");
console.log("wrote public/journey/earth-world.webp");

// The subcontinent: a crop from each of the two tiles, side by side.
const tile = 90 * PPD;
const crop = async (file, left, width) =>
  sharp(await path(file), { limitInputPixels: false })
    .resize(tile, tile)
    .extract({ left, top: (90 - PATCH.north) * PPD, width, height: (PATCH.north - PATCH.south) * PPD })
    .raw()
    .toBuffer({ resolveWithObject: true });
const a = await crop(FILES.C1, PATCH.west * PPD, (90 - PATCH.west) * PPD);
const b = await crop(FILES.D1, 0, (PATCH.east - 90) * PPD);
const W = a.info.width + b.info.width;
const H = a.info.height;
const joined = await sharp({ create: { width: W, height: H, channels: 3, background: "#000" } })
  .composite([
    { input: a.data, raw: a.info, left: 0, top: 0 },
    { input: b.data, raw: b.info, left: a.info.width, top: 0 },
  ])
  .removeAlpha()
  .raw()
  .toBuffer();

// Feathered edges, so the sharp patch melts into the world texture.
const rgb = await sharp(joined, { raw: { width: W, height: H, channels: 3 } }).resize(PATCH_PX, PATCH_PX).raw().toBuffer();
const alpha = Buffer.alloc(PATCH_PX * PATCH_PX);
const edge = PATCH_PX * 0.08;
const smooth = (t) => t * t * (3 - 2 * t);
for (let y = 0; y < PATCH_PX; y++) {
  for (let x = 0; x < PATCH_PX; x++) {
    const d = Math.min(x, y, PATCH_PX - 1 - x, PATCH_PX - 1 - y);
    alpha[y * PATCH_PX + x] = Math.round(255 * smooth(Math.min(1, d / edge)));
  }
}
await sharp(rgb, { raw: { width: PATCH_PX, height: PATCH_PX, channels: 3 } })
  .joinChannel(alpha, { raw: { width: PATCH_PX, height: PATCH_PX, channels: 1 } })
  .webp({ quality: 74, alphaQuality: 50 })
  .toFile("public/journey/earth-india.webp");
console.log("wrote public/journey/earth-india.webp");
