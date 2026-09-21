// Turns the background-removed portrait into the site's tritone portrait.
//
//   photo-src/portrait-cutout.png  (RGBA, background already removed)
//     -> src/assets/portrait.png    (RGBA, gradient-mapped, edge-cleaned)
//
// Usage: npm run photo            writes the site asset
//        npm run photo -- --preview  also writes previews on light/dark grounds
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "photo-src/portrait-cutout.png";
const OUT = "src/assets/portrait.png";
const PREVIEW_DIR = "photo-src/previews";

// Shadow -> midtone -> highlight. Shadows sit just above the dark theme's
// background so the silhouette still separates from it.
const STOPS = [
  { at: 0.0, rgb: [34, 27, 25] },
  { at: 0.3, rgb: [84, 32, 14] },
  { at: 0.62, rgb: [226, 72, 20] },
  { at: 0.84, rgb: [255, 128, 72] },
  { at: 1.0, rgb: [255, 214, 190] },
];

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const px = width * height;

// 1. Erode the alpha by one pixel to drop the coloured fringe the segmentation
//    leaves around the hair, then feather it slightly.
const erode = (src) => {
  const dst = new Uint8ClampedArray(px);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let min = 255;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          min = Math.min(min, src[ny * width + nx]);
        }
      }
      dst[y * width + x] = min;
    }
  }
  return dst;
};
const alpha = new Uint8ClampedArray(px);
for (let i = 0; i < px; i++) alpha[i] = data[i * 4 + 3];
// Two passes: the fringe from the lit background is about two pixels wide.
const eroded = erode(erode(alpha));

// 2. Luminance, auto-levelled on the visible pixels only.
const lum = new Float32Array(px);
const histogram = new Uint32Array(256);
let visible = 0;
for (let i = 0; i < px; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  // The source is lit by warm pink light, so weight green and blue up a little
  // to keep skin detail out of the red channel's blown-out range.
  const l = 0.3 * r + 0.5 * g + 0.2 * b;
  lum[i] = l;
  if (eroded[i] > 200) {
    histogram[Math.round(l)]++;
    visible++;
  }
}
const percentile = (p) => {
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= visible * p) return v;
  }
  return 255;
};
const lo = percentile(0.01);
const hi = percentile(0.999);

const ramp = (t) => {
  for (let s = 1; s < STOPS.length; s++) {
    if (t <= STOPS[s].at) {
      const a = STOPS[s - 1], b = STOPS[s];
      const k = (t - a.at) / (b.at - a.at);
      return a.rgb.map((c, i) => c + (b.rgb[i] - c) * k);
    }
  }
  return STOPS[STOPS.length - 1].rgb;
};

// 3. Feather the eroded alpha with a small weighted 3x3 kernel.
const feathered = new Uint8ClampedArray(px);
const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.min(width - 1, Math.max(0, x + dx));
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        sum += eroded[ny * width + nx] * kernel[k++];
      }
    }
    feathered[y * width + x] = sum / 16;
  }
}

const out = Buffer.alloc(px * 4);
for (let i = 0; i < px; i++) {
  let t = (lum[i] - lo) / (hi - lo);
  t = Math.min(1, Math.max(0, t));
  // Slight gamma lift keeps detail in the face midtones.
  t = Math.pow(t, 0.85);
  const [r, g, b] = ramp(t);
  out[i * 4] = r;
  out[i * 4 + 1] = g;
  out[i * 4 + 2] = b;
  out[i * 4 + 3] = feathered[i];
}

// 4. Crop the empty space around the subject so layout can place the head
//    precisely. The bottom edge stays: the shoulders run off the frame.
let top = height, left = width, right = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (feathered[y * width + x] > 24) {
      if (y < top) top = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
}
const margin = Math.round(height * 0.02);
const crop = {
  left: Math.max(0, left - margin),
  top: Math.max(0, top - margin),
  width: Math.min(width, right + margin + 1) - Math.max(0, left - margin),
  height: height - Math.max(0, top - margin),
};

await sharp(out, { raw: { width, height, channels: 4 } })
  .extract(crop)
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log(`wrote ${OUT} (${crop.width}x${crop.height}, cropped from ${width}x${height}), levels ${lo}-${hi}`);

if (process.argv.includes("--preview")) {
  await mkdir(PREVIEW_DIR, { recursive: true });
  for (const [name, bg] of [["dark", "#0d0d0e"], ["light", "#f1f1ef"]]) {
    await sharp(OUT).flatten({ background: bg }).resize({ width: 640 }).png().toFile(`${PREVIEW_DIR}/${name}.png`);
  }
  await sharp(SRC).flatten({ background: "#7a7a7a" }).resize({ width: 640 }).png().toFile(`${PREVIEW_DIR}/cutout-gray.png`);
  console.log(`previews in ${PREVIEW_DIR}/`);
}
