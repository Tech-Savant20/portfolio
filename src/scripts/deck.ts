import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionAllowed } from "./motion";
import { createHands, type Side, type Spot } from "./hands";
import { setSoundOn, soundOn } from "./sound-pref";
import { initWatch } from "./watch";

gsap.registerPlugin(ScrollTrigger);

/**
 * Certifications as a deck of cards, handled by a dealer's hands. When the
 * section scrolls in, the hands shuffle the deck (a random effect: classic
 * riffle with a bridge, a spin, or an overhand), sweep it into a face-down
 * ribbon, and a wave runs through it as a hint. Clicking any card turns the
 * ribbon over like dominoes and the cards slide apart into readable spots;
 * after that each card flips on its own. If nobody clicks, the ribbon turns
 * over when the visitor scrolls on, or after a few seconds.
 *
 * Without the script, or with reduced motion, the cards are simply face up.
 */

type Effect = "riffle" | "spin" | "overhand";
type State = "deck" | "ribbon" | "spread";

const EFFECTS: Effect[] = ["riffle", "spin", "overhand"];
/** CC0 clips from Kenney's Casino Audio, cut to each effect's length. */
const SOUNDS: Record<Effect, string> = {
  riffle: "/sounds/shuffle-riffle.mp3",
  spin: "/sounds/shuffle-spin.mp3",
  overhand: "/sounds/shuffle-overhand.mp3",
};
const VOLUME = 0.35;
const HINT_AFTER = 1.5;
const AUTO_REVEAL_AFTER = 6;
/** The deck's resting spot, from the top of the stage. */
const DECK_Y = 12;
const GAP = 14;

interface Card {
  el: HTMLElement;
  inner: HTMLElement;
  flip: HTMLButtonElement;
  verify: HTMLAnchorElement | null;
  up: boolean;
  slot: number;
}

const phone = () => matchMedia("(max-width: 767px)").matches;

export function initDeck() {
  const root = document.querySelector<HTMLElement>("[data-deck-root]");
  const stage = root?.querySelector<HTMLElement>("[data-deck]");
  const pile = stage?.querySelector<HTMLElement>("[data-pile]");
  if (!root || !stage || !pile || !motionAllowed()) return;

  const cards: Card[] = [...pile.querySelectorAll<HTMLElement>("[data-card]")].map((el, i) => ({
    el,
    inner: el.querySelector<HTMLElement>("[data-card-inner]")!,
    flip: el.querySelector<HTMLButtonElement>("[data-card-flip]")!,
    verify: el.querySelector<HTMLAnchorElement>(".verify"),
    up: true,
    slot: i,
  }));
  const n = cards.length;
  if (!n) return;

  const hintEl = root.querySelector<HTMLElement>("[data-deck-hint]");
  const shuffleBtn = root.querySelector<HTMLButtonElement>("[data-deck-shuffle]");
  const revealBtn = root.querySelector<HTMLButtonElement>("[data-deck-reveal]");
  const soundBtn = root.querySelector<HTMLButtonElement>("[data-deck-sound]");

  root.classList.add("deck-ready");
  // Dev only: lets a test slow the whole animation down to inspect it frame by frame.
  if (import.meta.env.DEV) (window as unknown as { __gsap: typeof gsap }).__gsap = gsap;
  const hands = createHands(stage);
  initWatch(stage);

  /** True while a shuffle or the reveal wave is playing; clicks wait. */
  let busy = false;
  let state: State = "deck";
  let started = false;
  let mode = phone() ? "phone" : "desk";

  // ------------------------------------------------------------- geometry

  const size = () => {
    const cw = cards[0].el.offsetWidth;
    const hw = hands?.width() || cw * 0.95;
    return { w: stage.clientWidth, cw, ch: cards[0].el.offsetHeight, hw, u: hw / 200 };
  };

  /** A neat pile: each card a hair above the one below it. */
  const deckSpot = (i: number) => ({ x: -i * 0.6, y: DECK_Y - i * 0.9, rotation: 0 });

  /** Face-down ribbon: a tight overlapping line across the middle of the table. */
  const ribbonSpot = (k: number) => {
    const { w, cw } = size();
    const step = Math.min(cw * 0.35, (w - cw) / Math.max(1, n - 1));
    return { x: (k - (n - 1) / 2) * step, y: DECK_Y + 6, rotation: 0 };
  };

  /** Where each card ends up readable: a fan on desktop, two columns on phones. */
  const slotSpot = (k: number) => {
    const { w, cw, ch } = size();
    if (mode === "phone") {
      const lone = k === n - 1 && n % 2 === 1;
      const col = k % 2 ? 1 : -1;
      return { x: lone ? 0 : col * (cw / 2 + GAP / 2), y: ch + 32 + Math.floor(k / 2) * (ch + GAP), rotation: 0 };
    }
    const off = k - (n - 1) / 2;
    const spread = Math.min(cw * 1.08, (w - cw) / Math.max(1, n - 1));
    return { x: off * spread, y: DECK_Y + 8 + off * off * 7, rotation: off * 4.5 };
  };

  const stageHeight = () => {
    const { ch, u } = size();
    // Room under the cards for the hands to rest with the watch in view.
    const rest = 150 * u + 24;
    if (mode !== "phone") return ch + DECK_Y + 70 + rest;
    // Phones only make room for the two-column grid once the cards are spread into it.
    return state === "spread" ? ch + 32 + Math.ceil(n / 2) * (ch + GAP) + rest : ch + DECK_Y + 40 + rest;
  };

  // ---------------------------------------------------------------- hands

  const sign = (side: Side) => (side === "left" ? -1 : 1);

  const restSpot = (side: Side): Spot => {
    const { w, hw, u } = size();
    return { x: sign(side) * (w / 2 - hw * 0.42), y: stageHeight() - 150 * u - 10, rotation: -sign(side) * 14 };
  };

  const offSpot = (side: Side): Spot => ({ ...restSpot(side), y: stageHeight() + size().hw * 1.4 });

  /** Holding the deck from below, thumbs over its bottom corners. */
  const holdSpot = (side: Side, x = 0): Spot => {
    const { cw, ch } = size();
    return { x: x + sign(side) * cw * 0.2, y: DECK_Y + ch * 0.8, rotation: -sign(side) * 12 };
  };

  /** Phones have room for one hand: the left, with the watch. */
  const sides = (): Side[] => (mode === "phone" ? ["left"] : ["left", "right"]);

  const handsIn = (tl: gsap.core.Timeline, at: number) => {
    if (!hands) return;
    for (const s of sides()) hands.to(tl, s, holdSpot(s), "hold", at, 0.5, "power3.out");
  };

  // ---------------------------------------------------------------- faces

  const setFace = (c: Card, up: boolean, delay = 0) => {
    c.up = up;
    c.el.classList.toggle("is-down", !up);
    c.flip.setAttribute("aria-pressed", String(up));
    if (c.verify) c.verify.tabIndex = up ? 0 : -1;
    // Lift toward the viewer while turning, then settle.
    gsap.to(c.inner, { z: 70, duration: 0.3, ease: "power2.out", delay, overwrite: "auto" });
    gsap.to(c.inner, { z: 0, duration: 0.4, ease: "power2.in", delay: delay + 0.3 });
    gsap.to(c.inner, { rotationY: up ? 0 : 180, duration: 0.75, ease: "back.out(1.4)", delay });
  };

  // ---------------------------------------------------------------- place

  /** Puts everything where it belongs right now, without animating. */
  const place = () => {
    stage.style.height = `${stageHeight()}px`;
    cards.forEach((c, i) => {
      const spot = state === "spread" ? slotSpot(c.slot) : state === "ribbon" ? ribbonSpot(i) : deckSpot(i);
      gsap.set(c.el, { ...spot, zIndex: state === "spread" ? 20 + c.slot : i + 1 });
    });
    if (!hands) return;
    hands.show("right", mode !== "phone");
    for (const s of ["left", "right"] as Side[]) hands.set(s, started ? restSpot(s) : offSpot(s), "rest");
  };

  // -------------------------------------------------------------- shuffles

  /** Fisher–Yates on the real order, so the ribbon and the tab order both change. */
  const reorder = () => {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    cards.forEach((c, i) => {
      pile.append(c.el);
      gsap.set(c.el, { zIndex: i + 1 });
    });
  };

  /** Cards back into one face-down deck while the hands come up to take it. */
  const gather = () => {
    const tl = gsap.timeline();
    cards.forEach((c, i) => {
      if (c.up) setFace(c, false);
      tl.to(c.el, { ...deckSpot(i), duration: 0.45, ease: "power3.inOut" }, i * 0.03);
    });
    handsIn(tl, 0);
    return tl;
  };

  /**
   * The classic hand riffle: split the deck, bend both halves up with the
   * thumbs, let the corners fall alternately so the cards interleave, push the
   * halves together, then arch them into the bridge and let them cascade.
   * Timed to its clip: the zip runs under the riffle, the cascade at ~1.8 s.
   */
  const riffle = () => {
    const { cw, ch } = size();
    const tl = gsap.timeline();
    const els = cards.map((c) => c.el);
    const left = cards.filter((_, i) => i % 2 === 0).map((c) => c.el);
    const right = cards.filter((_, i) => i % 2 === 1).map((c) => c.el);
    const hx = cw * 0.56;
    const halfHold = (side: Side, x: number): Spot => ({ x: x + sign(side) * cw * 0.1, y: DECK_Y + ch * 0.82, rotation: -sign(side) * 10 });

    // Split.
    tl.to(left, { x: -hx, y: DECK_Y + 4, rotation: -4, duration: 0.3, ease: "power2.out", stagger: 0.01 }, 0)
      .to(right, { x: hx, y: DECK_Y + 4, rotation: 4, duration: 0.3, ease: "power2.out", stagger: 0.01 }, 0);
    hands?.to(tl, "left", halfHold("left", -hx), "grip", 0, 0.3);
    if (mode !== "phone") hands?.to(tl, "right", halfHold("right", hx), "grip", 0, 0.3);

    // Bend: each half tilts up around its outer edge until the inner corners meet.
    tl.set(left, { transformOrigin: "0% 50%" }, 0.3)
      .set(right, { transformOrigin: "100% 50%" }, 0.3)
      .to(left, { x: -cw * 0.47, rotation: -2, rotationY: 34, transformPerspective: 700, duration: 0.25, ease: "power2.out" }, 0.3)
      .to(right, { x: cw * 0.47, rotation: 2, rotationY: -34, transformPerspective: 700, duration: 0.25, ease: "power2.out" }, 0.3);
    hands?.to(tl, "left", halfHold("left", -cw * 0.47), "grip", 0.3, 0.25);
    if (mode !== "phone") hands?.to(tl, "right", halfHold("right", cw * 0.47), "grip", 0.3, 0.25);

    // Riffle: corners fall alternately into one pile.
    cards.forEach((c, i) => {
      const s = deckSpot(i);
      tl.to(c.el, { x: s.x, y: s.y - 6, rotation: 0, rotationY: 0, duration: 0.14, ease: "power1.in" }, 0.6 + i * 0.13);
    });
    const done = 0.6 + (n - 1) * 0.13 + 0.14;

    // Push together.
    tl.set(els, { transformOrigin: "50% 50%" }, done);
    handsIn(tl, done - 0.25);

    // Bridge: the deck bows up, then cascades flat.
    const bridge = Math.max(done + 0.1, 1.45);
    tl.to(els, { rotationX: -26, scaleY: 0.93, y: (i: number) => deckSpot(i).y - 10, transformPerspective: 700, duration: 0.3, ease: "power2.out", stagger: 0.012 }, bridge);
    if (hands) for (const s of sides()) hands.to(tl, s, { ...holdSpot(s), y: holdSpot(s).y - 14 }, "grip", bridge, 0.3);
    tl.to(els, { rotationX: 0, scaleY: 1, y: (i: number) => deckSpot(i).y, duration: 0.3, ease: "back.out(2.2)", stagger: 0.05 }, bridge + 0.35);
    handsIn(tl, bridge + 0.4);
    return tl;
  };

  const spin = () => {
    const { cw, ch } = size();
    const tl = gsap.timeline();
    const start = Math.random() * Math.PI * 2;
    cards.forEach((c, i) => {
      const a = start + (i / n) * Math.PI * 2;
      const r = cw * gsap.utils.random(0.65, 0.95);
      tl.to(
        c.el,
        {
          x: Math.cos(a) * r,
          y: DECK_Y + Math.sin(a) * r * 0.45,
          rotation: gsap.utils.random(-220, 220),
          duration: 0.6,
          ease: "power3.out",
        },
        i * 0.03,
      ).to(c.el, { ...deckSpot(i), duration: 0.32, ease: "power4.in" }, 0.62 + i * 0.035);
    });
    if (hands) {
      for (const s of sides()) {
        // Toss up, get out of the way with open hands, clap back together on the catch.
        hands.to(tl, s, { ...holdSpot(s), y: holdSpot(s).y - 30 }, "open", 0, 0.12, "power2.out");
        hands.to(tl, s, { x: sign(s) * cw * 1.05, y: DECK_Y + ch * 0.95, rotation: -sign(s) * 26 }, null, 0.12, 0.38);
        hands.to(tl, s, holdSpot(s), "hold", 0.62, 0.33, "power3.in");
      }
    }
    return tl;
  };

  const overhand = () => {
    const { cw, ch } = size();
    const tl = gsap.timeline();
    let order = [...cards];
    const lift = { x: cw * 0.2, y: DECK_Y - ch * 0.3 };
    [0.08, 0.48, 0.88, 1.32].forEach((t, b) => {
      const take = 1 + (b % 2);
      const chunk = order.slice(-take);
      order = [...chunk, ...order.slice(0, -take)];
      const els = chunk.map((c) => c.el);
      tl.to(els, { ...lift, rotation: 5, duration: 0.14, ease: "power2.out" }, t)
        // Slip the chunk under the rest of the deck on the way back down.
        .set(els, { zIndex: (i: number) => -10 * (b + 1) + i }, t + 0.15)
        .to(els, { x: 0, y: DECK_Y, rotation: 0, duration: 0.17, ease: "power2.in" }, t + 0.16);
      if (hands && mode !== "phone") {
        hands.to(tl, "right", { x: lift.x + cw * 0.2, y: lift.y + ch * 0.8, rotation: -8 }, "grip", t, 0.14, "power2.out");
        hands.to(tl, "right", holdSpot("right"), "hold", t + 0.16, 0.17, "power2.in");
      }
    });
    tl.set(cards.map((c) => c.el), { zIndex: (i: number) => i + 1 }, 1.64);
    tl.to(cards.map((c) => c.el), { x: (i: number) => deckSpot(i).x, y: (i: number) => deckSpot(i).y, duration: 0.12 }, 1.64);
    return tl;
  };

  const play: Record<Effect, () => gsap.core.Timeline> = { riffle, spin, overhand };

  let last: Effect | null = null;
  /** Random, but never the same effect twice in a row. */
  const pick = () => {
    const pool = EFFECTS.filter((e) => e !== last);
    last = pool[Math.floor(Math.random() * pool.length)];
    return last;
  };

  /**
   * Ribbon spread: the deck goes to the left end of the line and a hand slides
   * it right, leaving cards behind at an even pace (top card travels furthest).
   */
  const ribbon = () => {
    const { cw, ch } = size();
    const tl = gsap.timeline();
    const x0 = ribbonSpot(0).x;
    const xl = ribbonSpot(n - 1).x;
    cards.forEach((c, i) => tl.to(c.el, { x: x0 - i * 0.6, y: DECK_Y + 6 - i * 0.9, rotation: 0, duration: 0.3, ease: "power2.inOut" }, 0));

    const pusher: Side = mode === "phone" ? "left" : "right";
    const push = (x: number): Spot => ({ x: x + sign(pusher) * cw * 0.12, y: DECK_Y + 6 + ch * 0.8, rotation: -sign(pusher) * 8 });
    if (hands) {
      hands.to(tl, pusher, push(x0), "push", 0, 0.3);
      if (mode !== "phone") hands.to(tl, "left", restSpot("left"), "rest", 0, 0.5);
    }

    const start = 0.35;
    const sweep = 0.65;
    cards.forEach((c, k) => {
      const s = ribbonSpot(k);
      tl.to(c.el, { x: s.x, y: s.y, duration: Math.max(0.01, (sweep * k) / Math.max(1, n - 1)), ease: "none" }, start);
    });
    if (hands) {
      hands.to(tl, pusher, push(xl), null, start, sweep, "none");
      hands.to(tl, pusher, restSpot(pusher), "rest", start + sweep + 0.1, 0.55);
    }
    return tl;
  };

  // ----------------------------------------------------------------- sound

  let soundIsOn = soundOn();
  const clips = new Map<Effect, HTMLAudioElement>();
  const loadSounds = () => {
    for (const e of EFFECTS) {
      if (clips.has(e)) continue;
      const a = new Audio(SOUNDS[e]);
      a.preload = "auto";
      a.volume = VOLUME;
      clips.set(e, a);
    }
  };
  const playSound = (e: Effect) => {
    const a = clips.get(e);
    if (!soundIsOn || !a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  };
  const showSound = () => soundBtn?.setAttribute("aria-pressed", String(soundIsOn));
  showSound();

  // ------------------------------------------------- hint and self-reveal

  let armed = false;
  const timers: gsap.core.Tween[] = [];
  let scrollOn: ScrollTrigger | null = null;

  const disarm = () => {
    armed = false;
    timers.splice(0).forEach((t) => t.kill());
    scrollOn?.kill();
    scrollOn = null;
  };

  /** A lift that ripples along the ribbon: "these can be picked up". */
  const waveHint = () => {
    if (!armed || state !== "ribbon") return;
    cards.forEach((c, k) =>
      gsap.to(c.el, { y: ribbonSpot(k).y - 18, duration: 0.22, ease: "sine.out", yoyo: true, repeat: 1, delay: k * 0.08 }),
    );
  };

  /**
   * Slides the ribbon apart into the readable spots. With no card given it is
   * the domino wave (Reveal all, auto-reveal): every card turns over as it goes.
   * With a card, the ribbon spreads face down and only that card turns over,
   * so the rest are still there to discover one by one.
   */
  const waveReveal = (only?: Card) => {
    disarm();
    state = "spread";
    busy = true;
    refresh();
    if (mode === "phone") {
      // The table grows to hold the grid, and the hand moves down with its edge.
      gsap.to(stage, { height: stageHeight(), duration: 0.6, ease: "power2.inOut" });
      if (hands) {
        const tl = gsap.timeline();
        hands.to(tl, "left", restSpot("left"), "rest", 0, 0.6);
      }
    }
    cards.forEach((c, k) => {
      const d = k * 0.13;
      c.slot = k;
      if (!only) setFace(c, true, d);
      gsap.set(c.el, { zIndex: 20 + k, delay: d });
      gsap.to(c.el, { ...slotSpot(k), duration: 0.7, ease: "power3.inOut", delay: d + 0.25 });
    });
    // The picked card turns over once it has landed in its spot.
    if (only) setFace(only, true, only.slot * 0.13 + 0.8);
    gsap.delayedCall((n - 1) * 0.13 + 1, () => {
      busy = false;
      refresh();
    });
  };

  const revealAll = () => {
    if (busy) return;
    if (state === "ribbon") return waveReveal();
    disarm();
    cards.filter((c) => !c.up).forEach((c, k) => setFace(c, true, k * 0.14));
    refresh();
  };

  const autoReveal = () => {
    if (armed) revealAll();
  };

  /** Only after the scroll-in shuffle: someone who shuffles by hand is already playing. */
  const arm = () => {
    armed = true;
    timers.push(gsap.delayedCall(HINT_AFTER, waveHint), gsap.delayedCall(AUTO_REVEAL_AFTER, autoReveal));
    // Scrolling on past the deck counts as "not going to click".
    scrollOn = ScrollTrigger.create({ trigger: stage, start: "top 12%", onEnter: autoReveal });
  };

  function refresh() {
    const down = cards.filter((c) => !c.up).length;
    if (revealBtn) revealBtn.disabled = busy || down === 0;
    if (shuffleBtn) shuffleBtn.disabled = busy;
    if (!hintEl) return;
    if (busy && state !== "spread") hintEl.textContent = "Shuffling…";
    else if (state === "ribbon") hintEl.textContent = `${n} certifications · tap any card`;
    else if (down) hintEl.textContent = `${n} certifications · tap a card to turn it over`;
    else hintEl.textContent = `${n} certifications · tap one to turn it back`;
  }

  // ------------------------------------------------------------------ flow

  const shuffle = async (byHand: boolean) => {
    if (busy) return;
    busy = true;
    disarm();
    state = "deck";
    refresh();
    if (mode === "phone") gsap.to(stage, { height: stageHeight(), duration: 0.5, ease: "power2.inOut" });
    await gather();
    reorder();
    const effect = pick();
    if (byHand) playSound(effect);
    await play[effect]();
    await ribbon();
    state = "ribbon";
    busy = false;
    refresh();
    if (!byHand) arm();
  };

  const onCard = (c: Card) => {
    if (busy || state === "deck") return;
    disarm();
    if (state === "ribbon") waveReveal(c);
    else {
      setFace(c, !c.up);
      refresh();
    }
  };

  cards.forEach((c) => c.flip.addEventListener("click", () => onCard(c)));
  shuffleBtn?.addEventListener("click", () => shuffle(true));
  revealBtn?.addEventListener("click", revealAll);
  soundBtn?.addEventListener("click", () => {
    soundIsOn = !soundIsOn;
    setSoundOn(soundIsOn);
    showSound();
  });

  // Start as a face-down deck with the hands out of sight, waiting to be seen.
  cards.forEach((c) => {
    c.up = false;
    c.el.classList.add("is-down");
    c.flip.setAttribute("aria-pressed", "false");
    if (c.verify) c.verify.tabIndex = -1;
    gsap.set(c.inner, { rotationY: 180 });
  });
  place();
  refresh();

  const begin = () => {
    if (started) return;
    started = true;
    loadSounds();
    void shuffle(false);
  };
  ScrollTrigger.create({ trigger: stage, start: "top 75%", once: true, onEnter: begin });
  if (stage.getBoundingClientRect().top < innerHeight * 0.75) begin();

  // Resizing re-places everything; crossing the phone breakpoint re-lays the spread.
  new ResizeObserver(() => {
    if (busy) return;
    mode = phone() ? "phone" : "desk";
    place();
    refresh();
  }).observe(stage);
}
