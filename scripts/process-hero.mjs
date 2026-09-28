// Turns the studio photo into the home page hero.
//
//   photo-src/hero-source.png   (the original, git-ignored)
//     -> src/assets/hero.jpg      (high-quality JPEG; Astro makes AVIF/WebP sizes from it)
//     -> src/data/hero.json       (the backdrop colours sampled from the photo's edges)
//
// The hero paints its background with the sampled colours, and the photo's own
// edges are feathered in CSS, so the photo melts into the page rather than
// sitting in a box.
//
// Usage: npm run hero
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SRC = "photo-src/hero-source.png";
const OUT = "src/assets/hero.jpg";
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
