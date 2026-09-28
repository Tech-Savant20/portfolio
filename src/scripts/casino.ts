import { gsap } from "gsap";
import { createHands, type Side, type Spot } from "./hands";
import { initWatch } from "./watch";
import { soundOn } from "./sound-pref";
import { findSecret } from "./secrets";
import { MAX_BET, MIN_BET, rankOf, suitOf, type Card } from "../lib/blackjack";

/**
 * The casino table (src/pages/casino.astro). The Worker deals and scores every
 * hand (/api/casino/*); this only sends bets and moves and animates what comes
 * back: cards fly from the shoe with the dealer's right hand following them,
 * the hole card turns over at the end, and the aura counts up or down. The bet
 * sits on the felt as chips: they fly in from the chip buttons, the dealer pays
 * winnings out beside them or sweeps them away, and the same bet goes back down
 * for the next hand.
 */

interface PublicHand {
  bet: number;
  player: Card[];
  dealer: (Card | null)[];
  playerTotal: number;
  dealerTotal: number;
  done: boolean;
  outcome: "blackjack" | "win" | "push" | "lose" | "bust" | null;
  payout: number | null;
  canDouble: boolean;
}

interface Me {
  nickname: string;
  aura: number;
  hands: number;
  best: number;
  rank: number;
  canRefill: boolean;
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  getResponse: (id: string) => string | undefined;
};

const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

async function api<T>(path: string, body?: unknown): Promise<{ status: number; data: T & { ok: boolean; error?: string; message?: string } }> {
  const res = await fetch(`/api/casino/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({ ok: false, error: "network" }));
  return { status: res.status, data };
}

// ------------------------------------------------------------------------- sound

let audio: AudioContext | null = null;
function blip(kind: "card" | "chip" | "win" | "lose") {
  if (!soundOn()) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const out = audio.createGain();
    out.connect(audio.destination);
    if (kind === "card" || kind === "chip") {
      // A short filtered noise: a card sliding on felt, or a chip clack.
      const len = kind === "card" ? 0.07 : 0.035;
      const buf = audio.createBuffer(1, Math.ceil(audio.sampleRate * len), audio.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 2;
      const src = audio.createBufferSource();
      src.buffer = buf;
      const f = audio.createBiquadFilter();
      f.type = kind === "card" ? "bandpass" : "highpass";
      f.frequency.value = kind === "card" ? 1800 : 3200;
      out.gain.value = kind === "card" ? 0.35 : 0.5;
      src.connect(f).connect(out);
      src.start(t);
    } else {
      const notes = kind === "win" ? [523, 659, 784] : [392, 330];
      notes.forEach((hz, i) => {
        const o = audio!.createOscillator();
        o.type = "triangle";
        o.frequency.value = hz;
        const g = audio!.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.3);
        o.connect(g).connect(out);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.32);
      });
    }
  } catch {}
}

// ------------------------------------------------------------------------- table

export function initCasino() {
  const root = document.querySelector<HTMLElement>("[data-casino]");
  const stage = root?.querySelector<HTMLElement>("[data-casino-stage]");
  if (!root || !stage) return;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;

  const dealerBox = $("[data-dealer-cards]");
  const playerBox = $("[data-player-cards]");
  const dealerTotal = $("[data-dealer-total]");
  const playerTotal = $("[data-player-total]");
  const banner = $("[data-banner]");
  const shoe = $("[data-shoe]");
  const loading = $("[data-loading]");
  const joinForm = $<HTMLFormElement>("[data-join]");
  const joinError = $("[data-join-error]");
  const auraEl = $("[data-aura]");
  const meEl = $("[data-me]");
  const betEl = $("[data-bet]");
  const betting = $("[data-betting]");
  const actions = $("[data-actions]");
  const dealBtn = $<HTMLButtonElement>("[data-deal]");
  const clearBtn = $<HTMLButtonElement>("[data-clear]");
  const refillBtn = $<HTMLButtonElement>("[data-refill]");
  const chipBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-chip]")];
  const actBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-act]")];
  const backTpl = document.querySelector<HTMLTemplateElement>("[data-card-back]");

  let me: Me | null = null;
  let hand: PublicHand | null = null;
  let bet = 0;
  let busy = false;
  let shownAura = 0;

  // ---- the dealer's hands, resting at the table's edge ----
  const hands = createHands(stage);
  initWatch(stage);
  const size = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const hw = hands?.width() || 90;
    return { w, h, hw };
  };
  const sign = (s: Side) => (s === "left" ? -1 : 1);
  const restSpot = (s: Side): Spot => {
    const { w, h, hw } = size();
    return { x: sign(s) * (w / 2 - hw * 0.62), y: h - hw * 0.72, rotation: -sign(s) * 16 };
  };
  const rest = () => (["left", "right"] as Side[]).forEach((s) => hands?.set(s, restSpot(s), "rest"));
  rest();
  addEventListener("resize", rest);

  /** Where a card in a row sits, in stage coordinates for the hands. */
  const stagePoint = (el: HTMLElement) => {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - (s.left + s.width / 2), y: r.top - s.top + r.height * 0.75 };
  };

  // ---- cards ----
  const makeCard = (code: Card | null) => {
    const el = document.createElement("div");
    el.className = "pc";
    const inner = document.createElement("div");
    inner.className = "pc-inner";
    const face = document.createElement("div");
    face.className = "pc-face";
    const back = document.createElement("div");
    back.className = "pc-back";
    if (backTpl) back.append(backTpl.content.cloneNode(true));
    inner.append(face, back);
    el.append(inner);
    if (code) paintFace(el, code);
    gsap.set(inner, { rotationY: 180 });
    return el;
  };

  const paintFace = (el: HTMLElement, code: Card) => {
    const face = el.querySelector<HTMLElement>(".pc-face")!;
    const r = rankOf(code);
    const s = SUIT[suitOf(code) as keyof typeof SUIT];
    face.classList.toggle("red", suitOf(code) === "H" || suitOf(code) === "D");
    face.innerHTML = `<span class="pc-corner tl">${r}<small>${s}</small></span><span class="pc-pip">${s}</span><span class="pc-corner br">${r}<small>${s}</small></span>`;
    el.dataset.code = code;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `${r} of ${{ "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" }[s]}`);
  };

  /** Spreads the cards in a row around its centre. */
  const layout = (box: HTMLElement, tl?: gsap.core.Timeline, at = 0) => {
    const cards = [...box.querySelectorAll<HTMLElement>(".pc")];
    const cw = cards[0]?.offsetWidth ?? 80;
    const step = Math.min(cw * 0.62, (box.clientWidth - cw) / Math.max(1, cards.length - 1));
    cards.forEach((c, i) => {
      const x = (i - (cards.length - 1) / 2) * step;
      const rot = (i - (cards.length - 1) / 2) * 2.5;
      if (tl) tl.to(c, { x, rotation: rot, duration: 0.35, ease: "power2.out" }, at);
      else gsap.set(c, { x, rotation: rot });
    });
  };

  /** Deals one card from the shoe into a row, the right hand sweeping it in. */
  const dealCard = (tl: gsap.core.Timeline, box: HTMLElement, code: Card | null, at: number, faceUp: boolean) => {
    const el = makeCard(code);
    el.style.zIndex = String(10 + box.children.length);
    box.append(el);
    // Final spot first, then fly in from the shoe.
    const cards = [...box.querySelectorAll<HTMLElement>(".pc")];
    const cw = el.offsetWidth || 80;
    const step = Math.min(cw * 0.62, (box.clientWidth - cw) / Math.max(1, cards.length - 1));
    const x = (cards.length - 1 - (cards.length - 1) / 2) * step;
    const b = box.getBoundingClientRect();
    const sh = shoe.getBoundingClientRect();
    const from = { x: sh.left + sh.width / 2 - (b.left + b.width / 2), y: sh.top - b.top };
    gsap.set(el, { x: from.x, y: from.y, rotation: -18, scale: 0.8, opacity: 0 });
    layout(box, tl, at);
    tl.to(el, { x, y: 0, rotation: (cards.length - 1 - (cards.length - 1) / 2) * 2.5, scale: 1, opacity: 1, duration: 0.42, ease: "power3.out" }, at)
      .call(() => blip("card"), [], at + 0.05);
    if (faceUp) tl.to(el.querySelector(".pc-inner"), { rotationY: 0, duration: 0.4, ease: "power2.inOut" }, at + 0.28);
    if (hands && !reduced()) {
      tl.call(
        () => {
          const p = stagePoint(el);
          const t2 = gsap.timeline();
          hands.to(t2, "right", { x: p.x + size().hw * 0.2, y: p.y, rotation: -6 }, "push", 0, 0.24, "power2.out");
        },
        [],
        at + 0.18,
      );
    }
    return el;
  };

  const handsHome = (tl: gsap.core.Timeline, at: number | string) => {
    if (hands && !reduced()) hands.to(tl, "right", restSpot("right"), "rest", at, 0.5);
  };

  const flipUp = (tl: gsap.core.Timeline, el: HTMLElement, code: Card, at: number | string) => {
    tl.call(() => paintFace(el, code), [], at).to(el.querySelector(".pc-inner"), { rotationY: 0, duration: 0.45, ease: "power2.inOut" }, at);
  };

  const clearTable = (tl: gsap.core.Timeline) => {
    const old = [...stage.querySelectorAll<HTMLElement>(".pc")];
    if (!old.length) return;
    tl.to(old, { x: "-=260", y: "+=40", opacity: 0, rotation: -25, duration: 0.4, ease: "power2.in", stagger: 0.03 }, 0).call(() =>
      old.forEach((c) => c.remove()),
    );
  };

  const setTotals = () => {
    playerTotal.textContent = hand ? String(hand.playerTotal) : "";
    dealerTotal.textContent = hand ? String(hand.dealerTotal) : "";
  };

  // ---- banner and aura ----
  const say = (text: string, tone: "good" | "bad" | "" = "") => {
    banner.textContent = text;
    banner.className = `banner ${tone}`;
    gsap.fromTo(banner, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" });
  };
  const hush = () => gsap.to(banner, { opacity: 0, duration: 0.25 });

  const showAura = (to: number) => {
    const from = shownAura;
    shownAura = to;
    const o = { v: from };
    gsap.to(o, {
      v: to,
      duration: reduced() ? 0 : Math.min(1.2, 0.3 + Math.abs(to - from) / 400),
      ease: "power2.out",
      onUpdate: () => (auraEl.textContent = Math.round(o.v).toLocaleString("en-IN")),
    });
  };

  const renderMe = () => {
    if (!me) return;
    meEl.textContent = `${me.nickname} · #${me.rank} this week · ${me.hands} hand${me.hands === 1 ? "" : "s"}`;
    refillBtn.hidden = !me.canRefill;
  };

  // ---- chips on the felt ----
  const betStack = $("[data-bet-stack]");
  const winStack = $("[data-win-stack]");
  const betAmount = $("[data-bet-amount]");
  const CHIP_VALUES = [250, 100, 50, 25, 10, 5];
  /** The fewest chips that make up an amount, biggest at the bottom. */
  const chipsFor = (v: number) => {
    const out: number[] = [];
    for (const c of CHIP_VALUES) while (v >= c) out.push(c), (v -= c);
    return out;
  };
  const chipEl = (v: number, i: number) => {
    const el = document.createElement("span");
    el.className = `tchip c${v}`;
    el.textContent = String(v);
    // Each chip sits a little higher than the one under it.
    gsap.set(el, { y: -i * 7, rotation: ((i * 37) % 11) - 5 });
    return el;
  };
  /** Rebuilds the bet stack for an amount; `from` flies the top chip in from a button. */
  let swept = false;
  const renderStack = (v: number, from?: HTMLElement) => {
    const same = betStack.dataset.v === String(v) && !swept;
    betStack.dataset.v = String(v);
    betAmount.textContent = v ? String(v) : "";
    if (same) return;
    betStack.replaceChildren(...chipsFor(v).map(chipEl));
    winStack.replaceChildren();
    const top = betStack.lastElementChild as HTMLElement | null;
    if (!top || reduced()) {
      swept = false;
      return;
    }
    if (swept) {
      // After a hand is settled, the same bet goes back down for the next one.
      swept = false;
      gsap.from(betStack.children, { opacity: 0, y: "-=14", duration: 0.3, stagger: 0.03, ease: "power2.out" });
    } else if (from) {
      const a = from.getBoundingClientRect();
      const b = top.getBoundingClientRect();
      gsap.from(top, {
        x: a.left + a.width / 2 - (b.left + b.width / 2),
        y: a.top + a.height / 2 - (b.top + b.height / 2),
        rotation: 90,
        duration: 0.45,
        ease: "power3.out",
      });
    }
  };
  /** Moves every chip in a stack by (dx, dy) and fades it out. */
  const sweep = (tl: gsap.core.Timeline, stack: HTMLElement, dx: number, dy: number, at: number | string) => {
    const chips = [...stack.children];
    if (!chips.length) return;
    tl.to(chips, { x: `+=${dx}`, y: `+=${dy}`, opacity: 0, duration: 0.5, ease: "power2.in", stagger: 0.03 }, at);
  };
  /** Settles the chips once a hand ends: paid, taken or left where they are. */
  const settleChips = (tl: gsap.core.Timeline, h: PublicHand) => {
    const net = (h.payout ?? 0) - h.bet;
    const felt = stage.getBoundingClientRect();
    const spot = betStack.getBoundingClientRect();
    const toDealer = felt.top + felt.height * 0.12 - spot.top;
    const toPlayer = felt.bottom + 40 - spot.top;
    const dealerX = felt.left + felt.width / 2 - spot.left;
    if (net > 0) {
      // The dealer pays out beside the bet, then you collect both.
      const pay = chipsFor(net).map(chipEl);
      winStack.replaceChildren(...pay);
      tl.from(pay, { x: dealerX, y: toDealer, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.06 }, ">-0.1");
      sweep(tl, betStack, 0, toPlayer, "+=0.7");
      sweep(tl, winStack, 0, toPlayer, "<");
    } else if (h.payout === 0) {
      sweep(tl, betStack, dealerX, toDealer, ">");
    }
  };

  // ---- controls ----
  const setBet = (v: number, from?: HTMLElement) => {
    bet = v;
    betEl.textContent = String(bet);
    if (!hand || hand.done) renderStack(bet, from);
    // Bets go in steps of 5, so the most you can stake is rounded down to one.
    const room = Math.floor(Math.min(MAX_BET, me?.aura ?? 0) / 5) * 5;
    chipBtns.forEach((b) => (b.disabled = busy || bet + Number(b.dataset.chip) > room));
    dealBtn.disabled = busy || bet < MIN_BET || bet > room;
    clearBtn.disabled = busy || bet === 0;
  };

  const phase = () => {
    const playing = !!hand && !hand.done;
    betting.hidden = playing || !me;
    actions.hidden = !playing;
    actBtns.forEach((b) => {
      b.disabled = busy || (b.dataset.act === "double" && !(hand?.canDouble && (me?.aura ?? 0) >= (hand?.bet ?? 0)));
    });
    setBet(Math.min(bet, Math.floor(Math.min(MAX_BET, me?.aura ?? 0) / 5) * 5));
  };

  chipBtns.forEach((b) =>
    b.addEventListener("click", () => {
      blip("chip");
      setBet(bet + Number(b.dataset.chip), b);
    }),
  );
  clearBtn.addEventListener("click", () => {
    const tl = gsap.timeline();
    sweep(tl, betStack, 0, 120, 0);
    void tl.then(() => setBet(0));
  });

  // ---- the flow ----
  const outcomeText = (h: PublicHand) => {
    const net = (h.payout ?? 0) - h.bet;
    switch (h.outcome) {
      case "blackjack":
        return { t: `Blackjack! +${net}`, tone: "good" as const };
      case "win":
        return { t: `You win +${net}`, tone: "good" as const };
      case "push":
        return { t: "Push. Bet returned", tone: "" as const };
      case "bust":
        return { t: `Bust −${h.bet}`, tone: "bad" as const };
      default:
        return { t: `Dealer wins −${h.bet}`, tone: "bad" as const };
    }
  };

  const finish = async (tl: gsap.core.Timeline, h: PublicHand, aura: number) => {
    tl.call(() => {
      setTotals();
      const o = outcomeText(h);
      say(o.t, o.tone);
      blip(o.tone === "good" ? "win" : o.tone === "bad" ? "lose" : "chip");
      showAura(aura);
      if (h.outcome === "blackjack") findSecret("highroller");
    });
    settleChips(tl, h);
    handsHome(tl, ">");
    await tl;
    swept = (h.payout ?? 0) !== h.bet;
    const fresh = await api<{ player: Me }>("me");
    if (fresh.data.player) me = fresh.data.player;
    renderMe();
    void loadBoard();
  };

  const deal = async () => {
    if (busy || bet < MIN_BET) return;
    busy = true;
    phase();
    hush();
    const { status, data } = await api<{ hand: PublicHand; aura: number }>("deal", { bet });
    if (status === 409 && data.hand) {
      // A hand was already in play (another tab): pick it up.
      hand = data.hand;
      redraw();
      busy = false;
      phase();
      return;
    }
    if (!data.ok || !data.hand) {
      say(data.message ?? "Couldn't deal. Try again.", "bad");
      busy = false;
      phase();
      return;
    }
    const h = data.hand;
    const tl = gsap.timeline();
    clearTable(tl);
    const start = tl.duration();
    // Player, dealer, player, dealer (the dealer's second card face down).
    dealCard(tl, playerBox, h.player[0], start, true);
    dealCard(tl, dealerBox, h.dealer[0], start + 0.3, true);
    dealCard(tl, playerBox, h.player[1], start + 0.6, true);
    const hole = dealCard(tl, dealerBox, null, start + 0.9, false);
    showAura(data.aura - (h.done ? (h.payout ?? 0) : 0));
    hand = h;
    if (h.done) {
      // Someone had blackjack: the hole card turns straight over.
      const code = h.dealer[1];
      if (code) flipUp(tl, hole, code, start + 1.5);
      await finish(tl, h, data.aura);
    } else {
      tl.call(setTotals, [], start + 1.3);
      handsHome(tl, start + 1.35);
      await tl;
    }
    busy = false;
    phase();
  };

  const act = async (action: string) => {
    if (busy || !hand || hand.done) return;
    busy = true;
    phase();
    const { data } = await api<{ hand: PublicHand; aura: number }>("act", { action });
    if (!data.ok || !data.hand) {
      say(data.message ?? "That didn't work. Try again.", "bad");
      busy = false;
      phase();
      return;
    }
    const prev = hand;
    const h = data.hand;
    hand = h;
    const tl = gsap.timeline();
    let at = 0;
    if (action === "double") {
      showAura(data.aura - (h.done ? (h.payout ?? 0) : 0));
      blip("chip");
      renderStack(h.bet, actBtns.find((b) => b.dataset.act === "double"));
    }
    // New player cards.
    for (let i = prev.player.length; i < h.player.length; i++) {
      dealCard(tl, playerBox, h.player[i], at, true);
      at += 0.35;
    }
    if (h.done) {
      // Turn the hole card, then the dealer's draws.
      const holeEl = dealerBox.querySelectorAll<HTMLElement>(".pc")[1];
      const code = h.dealer[1];
      if (holeEl && code) flipUp(tl, holeEl, code, at + 0.2);
      at += 0.7;
      for (let i = 2; i < h.dealer.length; i++) {
        const c = h.dealer[i];
        if (c) dealCard(tl, dealerBox, c, at, true);
        at += 0.5;
      }
      await finish(tl, h, data.aura);
    } else {
      tl.call(setTotals, [], at + 0.2);
      handsHome(tl, at + 0.2);
      await tl;
    }
    busy = false;
    phase();
  };

  dealBtn.addEventListener("click", () => void deal());
  actBtns.forEach((b) => b.addEventListener("click", () => void act(b.dataset.act ?? "")));
  // Keyboard: H hit, S stand, D double / deal, when nothing's being typed.
  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (hand && !hand.done) {
      if (k === "h") void act("hit");
      else if (k === "s") void act("stand");
      else if (k === "d" && hand.canDouble) void act("double");
    } else if (k === "d" && !betting.hidden) void deal();
  });

  refillBtn.addEventListener("click", async () => {
    refillBtn.disabled = true;
    const { data } = await api<{ aura: number }>("refill", {});
    refillBtn.disabled = false;
    if (!data.ok) return say(data.message ?? "No refill right now.", "bad");
    if (me) {
      me.aura = data.aura;
      me.canRefill = false;
    }
    showAura(data.aura);
    renderMe();
    phase();
  });

  /** Puts a hand in play back on the table, without animation (after a reload). */
  const redraw = () => {
    stage.querySelectorAll(".pc").forEach((c) => c.remove());
    if (!hand) return;
    const place = (box: HTMLElement, codes: (Card | null)[]) => {
      codes.forEach((code) => {
        const el = makeCard(code);
        box.append(el);
        if (code) gsap.set(el.querySelector(".pc-inner"), { rotationY: 0 });
      });
      layout(box);
    };
    place(playerBox, hand.player);
    place(dealerBox, hand.dealer);
    renderStack(hand.bet);
    setTotals();
  };

  // ---- the leaderboard ----
  const topEl = document.querySelector<HTMLElement>("[data-top]")!;
  const championEl = document.querySelector<HTMLElement>("[data-champion]")!;
  const seasonEl = document.querySelector<HTMLElement>("[data-season]")!;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  async function loadBoard() {
    const { data } = await api<{ season: string; top: { nickname: string; aura: number; hands: number }[]; champion: { nickname: string; aura: number } | null }>("board");
    if (!data.ok) return;
    const monday = new Date(`${data.season}T00:00:00Z`);
    seasonEl.textContent = `Season of ${monday.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })} · resets Monday`;
    topEl.innerHTML = data.top.length
      ? data.top
          .map(
            (t, i) =>
              `<li class="${me && t.nickname === me.nickname ? "you" : ""}"><span class="r">${i + 1}</span><span class="n">${esc(t.nickname)}</span><span class="a">${t.aura.toLocaleString("en-IN")}</span></li>`,
          )
          .join("")
      : `<li class="empty">No hands played yet this week. Be the first.</li>`;
    championEl.hidden = !data.champion;
    if (data.champion) championEl.textContent = `Last week's champion: ${data.champion.nickname} (${data.champion.aura.toLocaleString("en-IN")})`;
  }

  // ---- joining ----
  let widgetId: string | undefined;
  let onToken: ((t: string) => void) | null = null;
  const holder = joinForm.querySelector<HTMLElement>("[data-turnstile]")!;
  const w = window as Window & { turnstile?: TurnstileApi };
  let requested = false;
  const loadTurnstile = () => {
    if (requested) return;
    requested = true;
    const render = () => {
      if (!w.turnstile || widgetId !== undefined) return;
      widgetId = w.turnstile.render(holder, {
        sitekey: holder.dataset.sitekey,
        action: "casino",
        theme: "dark",
        appearance: "interaction-only",
        callback: (t: string) => {
          onToken?.(t);
          onToken = null;
        },
      });
    };
    if (w.turnstile) return render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.addEventListener("load", render, { once: true });
    s.addEventListener("error", () => (requested = false));
    document.head.append(s);
  };
  const tokenWithin = (ms: number) =>
    new Promise<string | undefined>((resolve) => {
      const now = widgetId !== undefined ? w.turnstile?.getResponse(widgetId) : undefined;
      if (now) return resolve(now);
      const timer = setTimeout(() => {
        onToken = null;
        resolve(undefined);
      }, ms);
      onToken = (t) => {
        clearTimeout(timer);
        resolve(t);
      };
    });

  joinForm.addEventListener("focusin", loadTurnstile, { once: true });
  joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    joinError.hidden = true;
    const submit = joinForm.querySelector<HTMLButtonElement>("[data-join-submit]")!;
    submit.disabled = true;
    loadTurnstile();
    const token = await tokenWithin(10_000);
    if (!token) {
      joinError.textContent = "The quick check didn't finish. Try again in a moment.";
      joinError.hidden = false;
      submit.disabled = false;
      return;
    }
    const nickname = String(new FormData(joinForm).get("nickname") ?? "");
    const { data } = await api<{ player: Me }>("join", { nickname, token });
    submit.disabled = false;
    if (!data.ok || !data.player) {
      joinError.textContent =
        data.message ?? (data.error === "verification" ? "The quick check failed. Try again." : "Couldn't sit you down. Try again.");
      joinError.hidden = false;
      if (widgetId !== undefined) w.turnstile?.reset(widgetId);
      return;
    }
    me = data.player;
    joinForm.hidden = true;
    shownAura = 0;
    showAura(me.aura);
    renderMe();
    phase();
    void loadBoard();
    say(`Welcome, ${me.nickname}. Place a bet.`);
  });

  // ---- start ----
  (async () => {
    const [{ data }] = await Promise.all([api<{ player: Me | null; hand: PublicHand | null }>("me"), loadBoard()]);
    loading.hidden = true;
    if (!data.ok) {
      say("The casino is closed right now.", "bad");
      return;
    }
    if (!data.player) {
      joinForm.hidden = false;
      betting.hidden = true;
      return;
    }
    me = data.player;
    showAura(me.aura);
    renderMe();
    hand = data.hand;
    if (hand) redraw();
    phase();
  })();
}
