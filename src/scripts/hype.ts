import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { soundOn } from "./sound-pref";

gsap.registerPlugin(ScrambleTextPlugin);

/**
 * Hype mode, the Konami code's reward. Loaded only when the code is entered.
 *
 *  1. Transformation: a big Omnitrix dial spins in, flicks through the aliens
 *     and slams down; a green flash and a shockwave go out, and the alien's
 *     name is called.
 *  2. Alien mode for 20 seconds: the accent turns Omnitrix green, the page gets
 *     a green hologram tint, scanlines and a pulsing edge glow, headings glow
 *     and glitch now and then, the alien's hologram hovers in the corner, and
 *     the pointer throws sparks. A HUD counts down.
 *  3. Timeout, like the show: the last three seconds go red and beep, then it
 *     powers down.
 *
 * Reduced motion keeps only the colours, the tint and the HUD.
 */

interface Alien {
  id: string;
  name: string;
  w: number;
  h: number;
  body: string;
  mid: string;
  light: string;
}

const DURATION = 20;
const WARN = 3;
const GREEN = "#43f24b";
const RED = "#ff3b30";
const SVG_NS = "http://www.w3.org/2000/svg";

const CSS = `
.hype-layer{position:fixed;inset:0;z-index:88;pointer-events:none}
.hype-tint{position:fixed;inset:0;z-index:87;pointer-events:none;background:${GREEN};mix-blend-mode:color;opacity:0;transition:opacity .6s,background-color .3s}
.hype-scan{position:fixed;inset:0;z-index:87;pointer-events:none;opacity:0;transition:opacity .6s;
  background:repeating-linear-gradient(0deg,rgb(67 242 75 / .09) 0 1px,transparent 1px 4px);background-size:100% 4px;animation:hype-scan 1.2s linear infinite}
.hype-edge{position:fixed;inset:0;z-index:87;pointer-events:none;opacity:0;transition:opacity .6s;box-shadow:inset 0 0 90px 10px rgb(67 242 75 / .38);animation:hype-pulse 1.6s ease-in-out infinite}
:root.hype .hype-tint{opacity:.2}
:root.hype .hype-scan,:root.hype .hype-edge{opacity:1}
:root.hype-warn .hype-tint{background:${RED};opacity:.24}
:root.hype-warn .hype-edge{box-shadow:inset 0 0 110px 14px rgb(255 59 48 / .5);animation-duration:.5s}
:root.hype-warn .hype-scan{background-image:repeating-linear-gradient(0deg,rgb(255 59 48 / .1) 0 1px,transparent 1px 4px)}
@keyframes hype-scan{to{background-position:0 4px}}
@keyframes hype-pulse{50%{opacity:.55}}
:root.hype :is(h1,h2,.big,.section-title){text-shadow:0 0 22px rgb(67 242 75 / .55),0 0 2px rgb(67 242 75 / .8)}
:root.hype-warn :is(h1,h2,.big,.section-title){text-shadow:0 0 22px rgb(255 59 48 / .55)}
.hype-glitch{animation:hype-glitch .42s steps(2) both}
@keyframes hype-glitch{
  0%{transform:translate(0);text-shadow:-3px 0 ${RED},3px 0 ${GREEN}}
  25%{transform:translate(-4px,1px) skewX(-8deg);text-shadow:4px 0 ${RED},-4px 0 ${GREEN}}
  50%{transform:translate(3px,-1px);clip-path:inset(20% 0 35% 0);text-shadow:-5px 0 ${RED},5px 0 ${GREEN}}
  75%{transform:translate(-2px,0) skewX(5deg);clip-path:none}
  100%{transform:none}}
.hype-back{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgb(20 60 22 / .55),rgb(0 0 0 / .82) 70%);opacity:0}
.hype-dial{position:absolute;left:50%;top:50%;width:min(62vmin,440px);aspect-ratio:1;margin:calc(min(62vmin,440px) / -2) 0 0 calc(min(62vmin,440px) / -2);filter:drop-shadow(0 0 28px rgb(67 242 75 / .55))}
.hype-dial .bezel{fill:#17191b;stroke:#3b3f43;stroke-width:5}
.hype-dial .notch{fill:#2b2f33;stroke:#0c0d0e;stroke-width:1.5}
.hype-dial .ring{fill:none;stroke:${GREEN};stroke-width:3.5}
.hype-dial .face{fill:#070907}
.hype-dial .glass{fill:${GREEN}}
.hype-dial .alien path{fill:${GREEN}}
.hype-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,#f4fff4 0,#9dff9f 22%,${GREEN} 48%,#0b7a15 100%);clip-path:circle(0% at 50% 50%);opacity:0}
.hype-wave{position:absolute;left:50%;top:50%;width:40vmin;height:40vmin;margin:-20vmin 0 0 -20vmin;border-radius:50%;border:4px solid ${GREEN};box-shadow:0 0 40px ${GREEN},inset 0 0 40px ${GREEN};opacity:0}
.hype-name{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font:800 clamp(3.5rem,14vw,11rem)/1 var(--font-mono);letter-spacing:-.04em;color:#eaffea;text-shadow:0 0 30px ${GREEN},0 0 80px ${GREEN};opacity:0}
.hype-holo{position:fixed;right:clamp(8px,3vw,40px);bottom:0;z-index:86;width:clamp(150px,22vw,300px);height:min(48vh,440px);pointer-events:none;transform-origin:50% 100%;opacity:0}
.hype-holo::before{content:"";position:absolute;left:10%;right:10%;bottom:0;height:70%;background:linear-gradient(to top,rgb(67 242 75 / .32),transparent);clip-path:polygon(40% 100%,60% 100%,100% 0,0 0);filter:blur(6px)}
.hype-holo svg{position:absolute;inset:0 0 6% 0;width:100%;height:94%;filter:drop-shadow(0 0 10px ${GREEN});
  -webkit-mask:repeating-linear-gradient(0deg,#000 0 2px,rgb(0 0 0 / .45) 2px 4px);mask:repeating-linear-gradient(0deg,#000 0 2px,rgb(0 0 0 / .45) 2px 4px)}
.hype-holo path{fill:${GREEN}}
.hype-holo .label{position:absolute;left:0;right:0;bottom:8px;text-align:center;font:700 12px/1 var(--font-mono);letter-spacing:.2em;color:${GREEN};text-shadow:0 0 8px ${GREEN}}
:root.hype-warn .hype-holo path{fill:${RED}}
:root.hype-warn .hype-holo svg{filter:drop-shadow(0 0 10px ${RED})}
.hype-hud{position:fixed;left:50%;top:calc(var(--nav-h,64px) + 12px);translate:-50% 0;z-index:89;display:flex;align-items:center;gap:12px;padding:8px 10px 8px 8px;border-radius:999px;background:#061a08;border:1px solid #1f6b26;color:#d8ffd9;font:600 12px/1.2 var(--font-mono);box-shadow:0 0 24px rgb(67 242 75 / .35);opacity:0}
.hype-hud svg{width:40px;height:40px;flex:none}
.hype-hud .track{fill:none;stroke:#1f6b26;stroke-width:3}
.hype-hud .left{fill:none;stroke:${GREEN};stroke-width:3;stroke-linecap:round;transform:rotate(-90deg);transform-origin:20px 20px}
.hype-hud .glass{fill:${GREEN}}
.hype-hud .t{display:grid;gap:2px}
.hype-hud .t b{color:${GREEN};letter-spacing:.14em;font-size:11px}
.hype-hud button{pointer-events:auto;margin-left:4px;padding:6px 10px;border-radius:999px;border:1px solid #1f6b26;background:transparent;color:#b9f7bd;font:inherit;font-size:11px;cursor:pointer}
.hype-hud button:hover{border-color:${GREEN};color:#fff}
:root.hype-warn .hype-hud{background:#2a0706;border-color:#7a1d18;box-shadow:0 0 28px rgb(255 59 48 / .5);animation:hype-pulse .5s ease-in-out infinite}
:root.hype-warn .hype-hud .left{stroke:${RED}}
:root.hype-warn .hype-hud .glass{fill:${RED}}
:root.hype-warn .hype-holo .label{color:${RED};text-shadow:0 0 8px ${RED}}
:root.hype-warn .hype-holo::before{background:linear-gradient(to top,rgb(255 59 48 / .32),transparent)}
:root.hype-warn .hype-hud .t b{color:${RED}}
.hype-spark{position:fixed;left:0;top:0;z-index:89;pointer-events:none;font:700 14px/1 var(--font-mono);color:${GREEN};text-shadow:0 0 8px ${GREEN};opacity:0}
.hype-hud{white-space:nowrap}
@media (max-width:640px){.hype-holo{width:130px;height:32vh}.hype-hud{gap:8px;font-size:11px}.hype-hud svg{width:32px;height:32px}}
@media (prefers-reduced-motion:reduce){.hype-scan,.hype-edge,.hype-hud{animation:none!important}}
`;

// ------------------------------------------------------------------- aliens

let aliensReq: Promise<Alien[]> | null = null;
const loadAliens = () =>
  (aliensReq ??= fetch("/holo/aliens.json")
    .then((r) => (r.ok ? (r.json() as Promise<Alien[]>) : []))
    .catch(() => []));

/** One alien as an SVG in its three traced tones. */
function alienSvg(a: Alien, attrs: Record<string, string> = {}) {
  const pad = a.h * 0.04;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${-pad} ${-pad} ${a.w + pad * 2} ${a.h + pad * 2}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const [d, alpha] of [[a.body, "0.25"], [a.mid, "0.6"], [a.light, "1"]] as const) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill-opacity", alpha);
    p.setAttribute("fill-rule", "evenodd");
    svg.append(p);
  }
  return svg;
}

// -------------------------------------------------------------------- sound

let audio: AudioContext | null = null;
function sfx(play: (ctx: AudioContext, t: number, out: AudioNode) => void) {
  if (!soundOn()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const master = audio.createGain();
    master.gain.value = 0.9;
    master.connect(audio.destination);
    play(audio, audio.currentTime, master);
  } catch {}
}

const tone = (ctx: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number) => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
};

const noise = (ctx: AudioContext, out: AudioNode, t: number, dur: number, vol: number, cutoff: number) => {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(t);
};

const sounds = {
  /** The dial winding up. */
  spinUp: () => sfx((c, t, o) => tone(c, o, "sawtooth", 90, 700, t, 0.7, 0.07)),
  tick: () => sfx((c, t, o) => tone(c, o, "square", 2400, 1800, t, 0.03, 0.05)),
  /** The slam: a thump, a crackle, and a bright chord on top. */
  slam: () =>
    sfx((c, t, o) => {
      tone(c, o, "sine", 150, 38, t, 0.55, 0.5);
      noise(c, o, t, 0.5, 0.35, 2600);
      [523, 659, 784, 1046].forEach((f, i) => tone(c, o, "triangle", f, f * 1.01, t + 0.02 + i * 0.015, 0.9, 0.05));
      tone(c, o, "sawtooth", 200, 1600, t, 0.45, 0.05);
    }),
  beep: () => sfx((c, t, o) => tone(c, o, "square", 880, 880, t, 0.14, 0.06)),
  /** Powering down, the way the watch winds out at the end. */
  down: () =>
    sfx((c, t, o) => {
      tone(c, o, "sawtooth", 900, 60, t, 0.9, 0.08);
      noise(c, o, t, 0.3, 0.12, 900);
    }),
};

// --------------------------------------------------------------------- run

let active: { end: (why: "timeout" | "user" | "restart") => void } | null = null;
let alienIndex = Math.floor(Math.random() * 5);

export async function hype(onDone?: (why: "timeout" | "user") => void) {
  active?.end("restart");
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const aliens = await loadAliens();
  const alien = aliens.length ? aliens[alienIndex++ % aliens.length] : null;
  const name = alien?.name ?? "Omnitrix";

  // ------------------------------------------------------- build the layers
  const style = document.createElement("style");
  style.textContent = CSS;
  const tint = div("hype-tint");
  const scan = div("hype-scan");
  const edge = div("hype-edge");
  const layer = div("hype-layer");
  layer.setAttribute("aria-hidden", "true");
  [tint, scan, edge].forEach((el) => el.setAttribute("aria-hidden", "true"));

  // Not a live region: it ticks every second. The toast announces the mode.
  const hud = div("hype-hud");
  const circ = 2 * Math.PI * 17;
  hud.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="17"/><circle class="left" cx="20" cy="20" r="17" stroke-dasharray="${circ}" stroke-dashoffset="0"/><path class="glass" d="M12 11h16l-8 9zM12 29h16l-8-9z"/></svg>
    <span class="t"><b>ALIEN MODE</b><span><span data-n></span> · <span data-s>${DURATION}</span>s</span></span>
    <button type="button">Power down</button>`;
  hud.querySelector<HTMLElement>("[data-n]")!.textContent = name;
  const secs = hud.querySelector<HTMLElement>("[data-s]")!;
  const ring = hud.querySelector<SVGCircleElement>(".left")!;

  const holo = div("hype-holo");
  holo.setAttribute("aria-hidden", "true");
  if (alien) holo.append(alienSvg(alien));
  const label = div("label");
  label.textContent = name.toUpperCase();
  holo.append(label);

  document.body.append(style, tint, scan, edge, layer, holo, hud);

  // -------------------------------------------------------------- cleanup
  let timer = 0;
  let glitchTimer = 0;
  const intro = gsap.timeline();
  const offPointer = reduced ? () => {} : sparks();
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && end("user");
  addEventListener("keydown", onKey);

  function end(why: "timeout" | "user" | "restart") {
    if (active?.end !== end) return;
    active = null;
    window.clearInterval(timer);
    window.clearInterval(glitchTimer);
    removeEventListener("keydown", onKey);
    offPointer();
    intro.kill();
    const finish = () => {
      root.classList.remove("hype", "hype-warn", "alien-mode");
      [style, tint, scan, edge, layer, holo, hud].forEach((el) => el.remove());
    };
    if (why === "restart") return finish();
    sounds.down();
    if (reduced) {
      finish();
      onDone?.(why);
      return;
    }
    gsap
      .timeline({ onComplete: () => (finish(), onDone?.(why)) })
      .to(holo, { scaleY: 0.02, scaleX: 1.3, opacity: 0, duration: 0.35, ease: "power2.in" }, 0)
      .to(hud, { y: -16, opacity: 0, duration: 0.3 }, 0)
      .to([tint, scan, edge], { opacity: 0, duration: 0.5 }, 0.1);
  }
  active = { end };
  hud.querySelector("button")!.addEventListener("click", () => end("user"));

  // ------------------------------------------------------------ alien mode
  const start = () => {
    root.classList.add("alien-mode", "hype");
    let left = DURATION;
    const tickDown = () => {
      secs.textContent = String(left);
      ring.style.strokeDashoffset = String(circ * (1 - left / DURATION));
      if (left <= WARN && left > 0) {
        root.classList.add("hype-warn");
        sounds.beep();
      }
      if (left <= 0) return end("timeout");
      left--;
    };
    tickDown();
    timer = window.setInterval(tickDown, 1000);
    gsap.to(hud, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(2)", startAt: { y: -16 } });
    if (reduced) return;
    gsap.fromTo(
      holo,
      { opacity: 0, scaleY: 0.02 },
      { opacity: matchMedia("(max-width: 640px)").matches ? 0.45 : 0.8, scaleY: 1, duration: 0.6, ease: "expo.out" },
    );
    gsap.to(holo, { y: -10, duration: 1.4, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.6 });
    gsap.to(holo.querySelector("svg"), { opacity: 0.55, duration: 0.06, yoyo: true, repeat: 5, repeatDelay: 2.2, ease: "none", delay: 1 });
    // Now and then a heading on screen glitches.
    glitchTimer = window.setInterval(() => {
      const heads = [...document.querySelectorAll<HTMLElement>("h1, h2, .big")].filter((h) => {
        const r = h.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight && r.width > 0;
      });
      const h = heads[Math.floor(Math.random() * heads.length)];
      if (!h) return;
      h.classList.remove("hype-glitch");
      void h.offsetWidth;
      h.classList.add("hype-glitch");
      window.setTimeout(() => h.classList.remove("hype-glitch"), 450);
    }, 1800);
  };

  if (reduced) return start();

  // ---------------------------------------------------------- transformation
  const back = div("hype-back");
  const flash = div("hype-flash");
  const wave = div("hype-wave");
  const called = div("hype-name");
  const dial = dialSvg(aliens);
  layer.append(back, dial.svg, flash, wave, called);

  const slides = dial.aliens;
  const STEP = 0.11;
  const spins = Math.max(6, slides.length + 3);
  const slamAt = 0.75 + spins * STEP;
  intro
    .to(back, { opacity: 1, duration: 0.3 }, 0)
    .fromTo(dial.svg, { scale: 0.15, rotation: -220, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.7, ease: "back.out(1.6)" }, 0)
    .call(sounds.spinUp, [], 0.05);
  for (let k = 0; k < spins; k++) {
    const t = 0.75 + k * STEP;
    const el = slides.length ? slides[k % slides.length] : null;
    intro
      .to(dial.ring, { rotation: `+=${360 / 8}`, svgOrigin: "100 100", duration: STEP * 0.7, ease: "power2.out" }, t)
      .call(sounds.tick, [], t);
    if (el) intro.set(el, { opacity: 0.9 }, t).set(el, { opacity: 0 }, t + STEP * 0.9);
    intro.set(dial.glass, { opacity: 0.25 }, t);
  }
  intro
    // Press down…
    .to(dial.svg, { scale: 0.86, duration: 0.12, ease: "power2.in" }, slamAt - 0.12)
    .set(dial.glass, { opacity: 1 }, slamAt)
    .call(sounds.slam, [], slamAt)
    // …and it goes off.
    .to(dial.svg, { scale: 1.6, opacity: 0, duration: 0.45, ease: "power2.out" }, slamAt)
    .fromTo(flash, { opacity: 1, clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)", duration: 0.32, ease: "power2.out" }, slamAt)
    .fromTo(wave, { scale: 0.2, opacity: 1 }, { scale: 6, opacity: 0, duration: 0.9, ease: "power2.out" }, slamAt)
    .call(start, [], slamAt + 0.12)
    .to(flash, { opacity: 0, duration: 0.6, ease: "power1.out" }, slamAt + 0.3)
    .to(back, { opacity: 0, duration: 0.8 }, slamAt + 0.3)
    // The alien's name is called.
    .fromTo(called, { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: "expo.out" }, slamAt + 0.25)
    .to(called, { duration: 0.6, scrambleText: { text: name.toUpperCase(), chars: "XLR8ΩΣΔ#%@01", speed: 0.6 } }, slamAt + 0.25)
    .to(called, { opacity: 0, y: -40, scale: 0.8, duration: 0.45, ease: "power2.in" }, slamAt + 1.4)
    .call(() => layer.replaceChildren(), [], slamAt + 1.9);
}

function div(cls: string) {
  const el = document.createElement("div");
  el.className = cls;
  return el;
}

/** The big dial for the transformation: bezel, notches, turning ring, hourglass. */
function dialSvg(list: Alien[]) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "hype-dial");
  svg.setAttribute("viewBox", "0 0 200 200");
  const notches = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    const x = 100 + Math.cos(a) * 88;
    const y = 100 + Math.sin(a) * 88;
    return `<rect class="notch" x="${x - 7}" y="${y - 5}" width="14" height="10" rx="2" transform="rotate(${i * 45 + 90} ${x} ${y})"/>`;
  }).join("");
  svg.innerHTML = `<defs><clipPath id="hype-face"><circle cx="100" cy="100" r="66"/></clipPath></defs>
    <circle class="bezel" cx="100" cy="100" r="94"/>
    <g data-ring>${notches}<circle class="ring" cx="100" cy="100" r="76" stroke-dasharray="36 11.7"/></g>
    <circle class="face" cx="100" cy="100" r="68"/>
    <path class="glass" d="M50 46h100l-50 54zM50 154h100l-50-54z"/>
    <g clip-path="url(#hype-face)" data-slides></g>`;
  const slot = svg.querySelector("[data-slides]")!;
  const aliens = list.map((a) => {
    const el = alienSvg(a, { class: "alien", x: "44", y: "40", width: "112", height: "124", opacity: "0" });
    slot.append(el);
    return el;
  });
  return {
    svg,
    ring: svg.querySelector<SVGGElement>("[data-ring]")!,
    glass: svg.querySelector<SVGPathElement>(".glass")!,
    aliens,
  };
}

/** Green sparks off the pointer. Returns the function that stops them. */
function sparks() {
  if (!matchMedia("(pointer: fine)").matches) return () => {};
  const pool = Array.from({ length: 28 }, () => {
    const s = div("hype-spark");
    s.setAttribute("aria-hidden", "true");
    document.body.append(s);
    return s;
  });
  const glyphs = ["+", "×", "·", "◇", "▪"];
  let i = 0;
  let last = 0;
  const move = (e: PointerEvent) => {
    const now = performance.now();
    if (now - last < 28) return;
    last = now;
    const s = pool[i++ % pool.length];
    s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    gsap.killTweensOf(s);
    gsap.fromTo(
      s,
      { x: e.clientX - 5, y: e.clientY - 7, opacity: 1, scale: 1, rotation: 0 },
      {
        x: `+=${gsap.utils.random(-40, 40)}`,
        y: `+=${gsap.utils.random(-50, 10)}`,
        opacity: 0,
        scale: 0.3,
        rotation: gsap.utils.random(-120, 120),
        duration: gsap.utils.random(0.5, 0.9),
        ease: "power2.out",
      },
    );
  };
  addEventListener("pointermove", move, { passive: true });
  return () => {
    removeEventListener("pointermove", move);
    pool.forEach((s) => (gsap.killTweensOf(s), s.remove()));
  };
}
