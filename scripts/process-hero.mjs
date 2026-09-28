// Turns the studio photo into the home page hero.
//
//   photo-src/hero-source.png   (the original, git-ignored)
//     -> src/assets/hero.jpg      (the full photo, for the Open Graph cards)
//     -> src/data/hero.json       (the backdrop colours sampled from the photo's edges)
//   photo-src/hero-cutout.png   (the same photo with the backdrop removed)
//     -> src/assets/hero-cutout.webp  (what the hero shows; Astro makes the sizes)
//
// The hero paints the studio wall and the disc behind the head in CSS, in the
// light theme from the sampled colours and in the dark theme in dark tones, so
// the one cut-out works in both. The cut-out was made once with
// @imgly/background-removal-node (run outside the project, it isn't a dependency).
//
// Usage: npm run hero
import sharp from "sharp";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";

const SRC = "photo-src/hero-source.png";
const CUTOUT = "photo-src/hero-cutout.png";
const OUT = "src/assets/hero.jpg";
const OUT_CUTOUT = "src/assets/hero-cutout.webp";
const DATA = "src/data/hero.json";

const img = sharp(SRC).removeAlpha();
const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

/** Mean colour of a band along an edge, skipping anything dark (hair, clothes). */
const band = (x0, y0, x1, y1) => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const i = (y * W + x) * C;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (l < 150) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return n ? [r / n, g / n, b / n].map(Math.round) : null;
};
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const S = Math.round(Math.min(W, H) * 0.02);

const top = band(0, 0, W, S);
const left = band(0, 0, S, H);
const right = band(W - S, 0, W, H);
const bottom = band(0, H - S, W, H) ?? right;
if (!top || !left || !right) throw new Error("No light backdrop found at the photo's edges.");

// Readable ink for text laid over the backdrop.
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const avg = [top, left, right, bottom].reduce((a, c) => a.map((v, i) => v + c[i] / 4), [0, 0, 0]).map(Math.round);
const ink = lum(avg) > 0.55 ? "#111112" : "#f4f4f2";

const hero = {
  width: W,
  height: H,
  backdrop: { top: hex(top), left: hex(left), right: hex(right), bottom: hex(bottom), average: hex(avg) },
  ink,
};

await img.jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(OUT);
await writeFile(DATA, `${JSON.stringify(hero, null, 2)}\n`);
console.log(`wrote ${OUT} (${W}x${H}) and ${DATA}`, hero.backdrop, `ink ${ink}`);

if (existsSync(CUTOUT)) {
  await sharp(CUTOUT).webp({ quality: 92, alphaQuality: 100, smartSubsample: true }).toFile(OUT_CUTOUT);
  console.log(`wrote ${OUT_CUTOUT}`);
} else {
  console.warn(`no ${CUTOUT}: the hero keeps its current cut-out`);
}
