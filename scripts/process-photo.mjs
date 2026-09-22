// Turns the background-removed portrait into the site portrait.
//
//   photo-src/portrait-cutout.png  (RGBA, background already removed)
//     -> src/assets/portrait.png    (RGBA, colour-corrected, edge-cleaned, cropped)
//
// Usage: npm run photo                     natural colour (default)
//        npm run photo -- --tritone        orange tritone instead
//        npm run photo -- --preview        also write previews on light/dark grounds
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "photo-src/portrait-cutout.png";
const OUT = "src/assets/portrait.png";
const PREVIEW_DIR = "photo-src/previews";
const TRITONE = process.argv.includes("--tritone");

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const px = width * height;

// ---- 1. Clean the edge: erode the alpha two pixels (the lit background leaves a
//         coloured fringe about that wide), then feather with a 3x3 kernel.
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
const eroded = erode(erode(alpha));

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

// ---- 2. Colour.
const toLin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

const out = Buffer.alloc(px * 4);

if (!TRITONE) {
  // Natural: the photo was lit by pink temple lights. Sample skin on the face,
  // then rebalance so the face lands on a neutral warm skin tone, and apply the
  // same channel gains to the whole picture.
  const box = { x0: 0.38, x1: 0.66, y0: 0.4, y1: 0.66 };
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = Math.floor(height * box.y0); y < height * box.y1; y++) {
    for (let x = Math.floor(width * box.x0); x < width * box.x1; x++) {
      const i = y * width + x;
      if (eroded[i] < 250) continue;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // skin-ish: not the dark hair, eyes or moustache, not blown highlights
      if (l < 70 || l > 240 || r <= g) continue;
      sr += toLin(r);
      sg += toLin(g);
      sb += toLin(b);
      n++;
    }
  }
  sr /= n; sg /= n; sb /= n;

  // Target: a medium warm skin tone, sRGB about (200, 150, 120).
  const target = [toLin(200), toLin(150), toLin(120)];
  // How much redder than green (in linear light) skin may be before it counts
  // as spill from the red side lights.
  const maxRedRatio = (target[0] / target[1]) * 1.1;
  const gain = [target[0] / sr, target[1] / sg, target[2] / sb];
  // Keep the face's brightness close to what it was: normalise by green.
  const exposure = Math.min(1.25, Math.max(0.85, gain[1]));
  const g0 = gain.map((v) => (v / gain[1]) * exposure);
  console.log(
    `natural: ${n} skin samples, face mean sRGB (${[sr, sg, sb].map(toSrgb).join(", ")}), gains ${g0.map((v) => v.toFixed(2)).join(" / ")}`,
  );

  const SAT = 1.02;
  // Gentle S-curve in sRGB space: spill removal leaves the midtones a bit flat.
  const contrast = (v) => {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    const k = 0.5 + (c - 0.5) * 1.07;
    const lin = Math.min(1, Math.max(0, k));
    return lin <= 0.04045 ? lin / 12.92 : ((lin + 0.055) / 1.055) ** 2.4;
  };
  for (let i = 0; i < px; i++) {
    let r = toLin(data[i * 4]) * g0[0];
    let g = toLin(data[i * 4 + 1]) * g0[1];
    let b = toLin(data[i * 4 + 2]) * g0[2];
    // Red spill suppression (as in keying): where red runs far ahead of green,
    // most of the excess is the coloured side light, so pull it back.
    const maxR = g * maxRedRatio;
    if (r > maxR) r = maxR + (r - maxR) * 0.2;
    // A touch less saturation so leftover coloured spill reads as shading.
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * SAT;
    g = y + (g - y) * SAT;
    b = y + (b - y) * SAT;
    out[i * 4] = toSrgb(contrast(Math.max(0, r)));
    out[i * 4 + 1] = toSrgb(contrast(Math.max(0, g)));
    out[i * 4 + 2] = toSrgb(contrast(Math.max(0, b)));
    out[i * 4 + 3] = feathered[i];
  }
} else {
  // Tritone: luminance mapped through shadow, orange midtone and warm highlight.
  const STOPS = [
    { at: 0.0, rgb: [34, 27, 25] },
    { at: 0.3, rgb: [84, 32, 14] },
    { at: 0.62, rgb: [226, 72, 20] },
    { at: 0.84, rgb: [255, 128, 72] },
    { at: 1.0, rgb: [255, 214, 190] },
  ];
  const lum = new Float32Array(px);
  const histogram = new Uint32Array(256);
  let visible = 0;
  for (let i = 0; i < px; i++) {
    const l = 0.3 * data[i * 4] + 0.5 * data[i * 4 + 1] + 0.2 * data[i * 4 + 2];
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
  for (let i = 0; i < px; i++) {
    const t = Math.pow(Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo))), 0.85);
    const [r, g, b] = ramp(t);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = feathered[i];
  }
}

// ---- 3. Crop the empty space around the subject so layout can place the head
//         precisely. The bottom edge stays: the shoulders run off the frame.
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
console.log(`wrote ${OUT} (${crop.width}x${crop.height}, ${TRITONE ? "tritone" : "natural"})`);

if (process.argv.includes("--preview")) {
  await mkdir(PREVIEW_DIR, { recursive: true });
  for (const [name, bg] of [["dark", "#0d0d0e"], ["light", "#f1f1ef"]]) {
    await sharp(OUT).flatten({ background: bg }).resize({ width: 640 }).png().toFile(`${PREVIEW_DIR}/${name}.png`);
  }
  console.log(`previews in ${PREVIEW_DIR}/`);
}
