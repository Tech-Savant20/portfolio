import { foundSecrets, SECRETS, toast, type SecretId } from "./secrets";
import { soundOn } from "./sound-pref";

/**
 * Game mode: the joystick buttons ([data-game-toggle], in the nav and the menu)
 * switch html.game-mode on and off and remember it. Base.astro applies the saved
 * choice before first paint, so pages open in the right mode.
 *
 * While it's on: the violet arcade skin (global.css), a "Player 1" splash when
 * it starts, and a HUD at the bottom (Base.astro) with this week's aura from
 * the casino, the six secrets as quests (click for a hint to the next one),
 * and the way in to /casino.
 */
export function gameModeOn() {
  return document.documentElement.classList.contains("game-mode");
}

export function setGameMode(on: boolean, announce = true) {
  document.documentElement.classList.toggle("game-mode", on);
  try {
    localStorage.setItem("game-mode", on ? "on" : "off");
  } catch {}
  syncToggles();
  if (on) {
    updateHud();
    if (announce) pressStart();
  } else if (announce) toast("Game mode off.");
  dispatchEvent(new CustomEvent("gamemode", { detail: on }));
}

function syncToggles() {
  const on = gameModeOn();
  document.querySelectorAll<HTMLElement>("[data-game-toggle]").forEach((b) => {
    b.setAttribute("aria-pressed", String(on));
    const label = b.querySelector("[data-game-label]");
    if (label) label.textContent = on ? "Game mode on" : "Game mode off";
  });
}

// ---- the splash ----

let audio: AudioContext | null = null;
/** The classic coin: two quick square-wave notes. */
function coin() {
  if (!soundOn()) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(988, t);
    osc.frequency.setValueAtTime(1319, t + 0.08);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  } catch {}
}

function pressStart() {
  coin();
  toast("Game mode on. The casino is open.");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelector(".game-splash")?.remove();
  const el = document.createElement("div");
  el.className = "game-splash";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<p class="gs-top">Player 1</p><p class="gs-big">Press start</p><p class="gs-sub">aura · quests · blackjack</p>`;
  document.body.append(el);
  el.addEventListener("animationend", (e) => {
    if (e.target === el) el.remove();
  });
}

// ---- the HUD ----

let auraLoaded = false;

async function loadAura() {
  const el = document.querySelector("[data-hud-aura-value]");
  if (!el || auraLoaded) return;
  auraLoaded = true;
  try {
    const res = await fetch("/api/casino/me", { credentials: "same-origin" });
    const data = (await res.json()) as { player: { aura: number; rank: number } | null };
    const a = data.player;
    el.textContent = (a?.aura ?? 1000).toLocaleString("en-IN");
    el.closest("[data-hud-aura]")?.setAttribute(
      "title",
      a ? `Your aura this week · rank ${a.rank}` : "Everyone starts the week on 1,000 aura",
    );
  } catch {
    auraLoaded = false;
  }
}

function updateHud() {
  const found = foundSecrets();
  const total = Object.keys(SECRETS).length;
  const s = document.querySelector("[data-hud-secrets]");
  if (s) s.textContent = `${found.length} / ${total}`;
  if (gameModeOn()) void loadAura();
}

/** A hint for the next secret not found yet. */
function nextQuest() {
  const found = foundSecrets();
  const next = (Object.keys(SECRETS) as SecretId[]).find((id) => !found.includes(id));
  if (!next) return toast("All six quests done. You found every secret.");
  const [name, how] = SECRETS[next].split(": ");
  toast(`Quest: ${name}. ${how.charAt(0).toUpperCase()}${how.slice(1)}.`);
}

export function initGameMode() {
  document.querySelectorAll<HTMLElement>("[data-game-toggle]").forEach((b) => {
    if (b.dataset.gameBound) return;
    b.dataset.gameBound = "1";
    b.addEventListener("click", () => setGameMode(!gameModeOn()));
  });
  syncToggles();

  const quest = document.querySelector<HTMLElement>("[data-hud-quest]");
  if (quest && !quest.dataset.bound) {
    quest.dataset.bound = "1";
    quest.addEventListener("click", nextQuest);
    // Secrets found here (secrets.ts) or in another tab update the count.
    addEventListener("secretfound", updateHud);
    addEventListener("storage", updateHud);
  }
  updateHud();
}
