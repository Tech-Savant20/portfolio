import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionAllowed } from "./motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * Certifications as a deck of cards. When the section scrolls in, the deck is
 * shuffled and dealt face down (a fan on wide screens; on phones it stays a
 * deck you tap to deal from). One card wiggles to show the cards can be
 * touched. If nobody does, they turn themselves over once the visitor scrolls
 * on, or after a few seconds, so nobody skimming misses them.
 *
 * Without the script, or with reduced motion, the cards are simply face up.
 */

type Effect = "riffle" | "spin" | "overhand";

const EFFECTS: Effect[] = ["riffle", "spin", "overhand"];
/** CC0 clips from Kenney's Casino Audio, trimmed to each effect's length. */
const SOUNDS: Record<Effect, string> = {
  riffle: "/sounds/shuffle-riffle.mp3",
  spin: "/sounds/shuffle-spin.mp3",
  overhand: "/sounds/shuffle-overhand.mp3",
};
const VOLUME = 0.35;
const SOUND_KEY = "deck-sound";
const HINT_AFTER = 1.5;
const AUTO_REVEAL_AFTER = 6;
/** The deck's resting spot, from the top of the stage. */
const DECK_Y = 12;

interface Card {
  el: HTMLElement;
  inner: HTMLElement;
  flip: HTMLButtonElement;
  verify: HTMLAnchorElement | null;
  up: boolean;
  /** Out of the deck and in its place: the fan on desktop, the grid on phones. */
  dealt: boolean;
  slot: number;
}

const phone = () => matchMedia("(max-width: 767px)").matches;

export function initDeck() {
  const root = document.querySelector<HTMLElement>("[data-deck-root]");
  const stage = root?.querySelector<HTMLElement>("[data-deck]");
  if (!root || !stage || !motionAllowed()) return;

  const cards: Card[] = [...stage.querySelectorAll<HTMLElement>("[data-card]")].map((el) => ({
    el,
    inner: el.querySelector<HTMLElement>("[data-card-inner]")!,
    flip: el.querySelector<HTMLButtonElement>("[data-card-flip]")!,
    verify: el.querySelector<HTMLAnchorElement>(".verify"),
    up: true,
    dealt: false,
    slot: 0,
  }));
  const n = cards.length;
  if (!n) return;

  const hintEl = root.querySelector<HTMLElement>("[data-deck-hint]");
  const shuffleBtn = root.querySelector<HTMLButtonElement>("[data-deck-shuffle]");
  const revealBtn = root.querySelector<HTMLButtonElement>("[data-deck-reveal]");
  const soundBtn = root.querySelector<HTMLButtonElement>("[data-deck-sound]");

  root.classList.add("deck-ready");
  /** True while a shuffle is playing; cards and buttons ignore clicks then. */
  let busy = false;

  // ------------------------------------------------------------- geometry

  let mode = phone() ? "phone" : "desk";
  const size = () => ({ w: stage.clientWidth, cw: cards[0].el.offsetWidth, ch: cards[0].el.offsetHeight });
  const GAP = 14;

  /** A neat pile: each card a hair above the one below it. */
  const deckSpot = (i: number) => ({ x: -i * 0.6, y: DECK_Y - i * 0.9, rotation: 0 });

  const slotSpot = (k: number) => {
    const { w, cw, ch } = size();
    if (mode === "phone") {
      // Two columns under the deck; an odd last card sits in the middle.
      const lone = k === n - 1 && n % 2 === 1;
      const col = k % 2 ? 1 : -1;
      return { x: lone ? 0 : col * (cw / 2 + GAP / 2), y: ch + 32 + Math.floor(k / 2) * (ch + GAP), rotation: 0 };
    }
    // Desktop: a poker-hand fan across the width, with a slight arc.
    const off = k - (n - 1) / 2;
    const spread = Math.min(cw * 1.08, (w - cw) / Math.max(1, n - 1));
    return { x: off * spread, y: DECK_Y + 8 + off * off * 7, rotation: off * 4.5 };
  };

  const fitStage = () => {
    const { ch } = size();
    stage.style.height =
      mode === "phone" ? `${ch + 32 + Math.ceil(n / 2) * (ch + GAP)}px` : `${ch + DECK_Y + 70}px`;
  };

  /** Puts every card where it belongs right now, without animating. */
  const place = () => {
    fitStage();
    cards.forEach((c, i) => {
      gsap.set(c.el, { ...(c.dealt ? slotSpot(c.slot) : deckSpot(i)), zIndex: c.dealt ? 20 + c.slot : i + 1 });
    });
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

  const topOfDeck = () => cards.filter((c) => !c.dealt).at(-1);

  /** Phones: the top card flies into the next free place and turns face up. */
  const dealTop = (delay = 0) => {
    const c = topOfDeck();
    if (!c) return;
    c.slot = cards.filter((x) => x.dealt).length;
    c.dealt = true;
    gsap.set(c.el, { zIndex: 40 + c.slot });
    gsap.to(c.el, { ...slotSpot(c.slot), duration: 0.7, ease: "power3.out", delay });
    setFace(c, true, delay + 0.1);
  };

  // -------------------------------------------------------------- shuffles

  /** Fisher–Yates on the real order, so the deal and the tab order both change. */
  const reorder = () => {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    cards.forEach((c, i) => {
      stage.append(c.el);
      gsap.set(c.el, { zIndex: i + 1 });
    });
  };

  const gather = () => {
    const tl = gsap.timeline();
    cards.forEach((c, i) => {
      c.dealt = false;
      if (c.up) setFace(c, false);
      tl.to(c.el, { ...deckSpot(i), duration: 0.45, ease: "power3.inOut" }, i * 0.03);
    });
    return tl;
  };

  // Each effect is timed to its clip: the riffle's zip ends in a snap near 1s,
  // the spin's swoosh lands on a thud near 0.9s, the overhand has four chunks.

  const riffle = () => {
    const { cw } = size();
    const tl = gsap.timeline();
    // Split into two halves, then let them fall together alternately.
    cards.forEach((c, i) => {
      const side = i % 2 ? 1 : -1;
      tl.to(c.el, { x: side * cw * 0.56, y: DECK_Y + 6, rotation: side * 7, duration: 0.3, ease: "power2.out" }, i * 0.015);
    });
    cards.forEach((c, i) => {
      const s = deckSpot(i);
      tl.to(c.el, { x: s.x, y: s.y - 12, rotation: 0, duration: 0.2, ease: "power1.in" }, 0.34 + i * 0.12);
    });
    // The bridge: the deck squares up with a little bounce.
    tl.to(
      cards.map((c) => c.el),
      { y: (i: number) => deckSpot(i).y, duration: 0.3, ease: "back.out(3)" },
      0.98,
    );
    return tl;
  };

  const spin = () => {
    const { cw } = size();
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
    return tl;
  };

  const overhand = () => {
    const { cw, ch } = size();
    const tl = gsap.timeline();
    let pile = [...cards];
    [0.08, 0.48, 0.88, 1.32].forEach((t, b) => {
      const take = 1 + (b % 2);
      const chunk = pile.slice(-take);
      pile = [...chunk, ...pile.slice(0, -take)];
      const els = chunk.map((c) => c.el);
      tl.to(els, { x: cw * 0.2, y: DECK_Y - ch * 0.3, rotation: 5, duration: 0.14, ease: "power2.out" }, t)
        // Slip the chunk under the rest of the deck on the way back down.
        .set(els, { zIndex: (i: number) => -10 * (b + 1) + i }, t + 0.15)
        .to(els, { x: 0, y: DECK_Y, rotation: 0, duration: 0.17, ease: "power2.in" }, t + 0.16);
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

  const dealFan = () => {
    const tl = gsap.timeline();
    cards.forEach((c, i) => {
      c.dealt = true;
      c.slot = i;
      tl.to(c.el, { ...slotSpot(i), duration: 0.55, ease: "power3.out" }, i * 0.09);
    });
    return tl;
  };

  // ----------------------------------------------------------------- sound

  let soundOn = true;
  try {
    soundOn = localStorage.getItem(SOUND_KEY) !== "off";
  } catch {}
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
    if (!soundOn || !a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  };
  const showSound = () => soundBtn?.setAttribute("aria-pressed", String(soundOn));
  showSound();

  // ----------------------------------------------- hint and self-reveal

  let armed = false;
  const timers: gsap.core.Tween[] = [];
  let scrollOn: ScrollTrigger | null = null;

  const disarm = () => {
    armed = false;
    timers.splice(0).forEach((t) => t.kill());
    scrollOn?.kill();
    scrollOn = null;
  };

  const wiggle = () => {
    if (!armed) return;
    const c = mode === "phone" ? topOfDeck() : cards[Math.floor(n / 2)];
    if (!c) return;
    gsap
      .timeline()
      .to(c.inner, { z: 60, duration: 0.25, ease: "power2.out" })
      .to(c.el, { rotation: "+=5", duration: 0.09, repeat: 5, yoyo: true, ease: "sine.inOut" }, 0.1)
      .to(c.inner, { z: 0, duration: 0.3, ease: "power2.inOut" }, 0.72);
  };

  const revealAll = () => {
    disarm();
    if (mode === "phone") {
      const left = cards.filter((c) => !c.dealt).length;
      for (let k = 0; k < left; k++) dealTop(k * 0.18);
    }
    cards.filter((c) => c.dealt && !c.up).forEach((c, k) => setFace(c, true, k * 0.14));
    refresh();
  };

  const autoReveal = () => {
    if (armed) revealAll();
  };

  /** Only after the scroll-in shuffle: someone who shuffles by hand is already playing. */
  const arm = () => {
    armed = true;
    timers.push(gsap.delayedCall(HINT_AFTER, wiggle), gsap.delayedCall(AUTO_REVEAL_AFTER, autoReveal));
    // Scrolling on past the deck counts as "not going to click".
    scrollOn = ScrollTrigger.create({ trigger: stage, start: "top 12%", onEnter: autoReveal });
  };

  const refresh = () => {
    const down = cards.filter((c) => !c.dealt || !c.up).length;
    if (revealBtn) revealBtn.disabled = down === 0 || busy;
    if (shuffleBtn) shuffleBtn.disabled = busy;
    if (!hintEl) return;
    if (busy) hintEl.textContent = "Shuffling…";
    else if (mode === "phone" && topOfDeck()) hintEl.textContent = `${n} certifications · tap the deck to deal`;
    else if (down) hintEl.textContent = `${n} certifications · tap a card to turn it over`;
    else hintEl.textContent = `${n} certifications · tap one to turn it back`;
  };

  // ------------------------------------------------------------------ flow

  const shuffle = async (byHand: boolean) => {
    if (busy) return;
    busy = true;
    disarm();
    refresh();
    await gather();
    reorder();
    const effect = pick();
    if (byHand) playSound(effect);
    await play[effect]();
    if (mode === "desk") await dealFan();
    busy = false;
    refresh();
    if (!byHand) arm();
  };

  const onCard = (c: Card) => {
    if (busy) return;
    disarm();
    if (!c.dealt) dealTop();
    else setFace(c, !c.up);
    refresh();
  };

  cards.forEach((c) => c.flip.addEventListener("click", () => onCard(c)));
  shuffleBtn?.addEventListener("click", () => shuffle(true));
  revealBtn?.addEventListener("click", () => {
    if (!busy) revealAll();
  });
  soundBtn?.addEventListener("click", () => {
    soundOn = !soundOn;
    try {
      localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
    } catch {}
    showSound();
  });

  // Start as a face-down deck, waiting to be seen.
  cards.forEach((c) => {
    c.up = false;
    c.el.classList.add("is-down");
    c.flip.setAttribute("aria-pressed", "false");
    if (c.verify) c.verify.tabIndex = -1;
    gsap.set(c.inner, { rotationY: 180 });
  });
  place();
  refresh();

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    loadSounds();
    void shuffle(false);
  };
  ScrollTrigger.create({ trigger: stage, start: "top 75%", once: true, onEnter: begin });
  if (stage.getBoundingClientRect().top < innerHeight * 0.75) begin();

  // Resizing re-places the cards; crossing the phone breakpoint deals everything out.
  new ResizeObserver(() => {
    if (busy) return;
    const next = phone() ? "phone" : "desk";
    if (next !== mode) {
      mode = next;
      if (started) cards.forEach((c, i) => ((c.dealt = true), (c.slot = i)));
    }
    place();
    refresh();
  }).observe(stage);
}
