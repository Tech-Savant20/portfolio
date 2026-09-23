/**
 * Hidden things to find on the site. Finding one shows a toast and bumps the
 * "n / 5 secrets found" counter in the footer. Progress is kept per browser.
 */

export const SECRETS = {
  omnitrix: "The Omnitrix: you clicked the dealer's watch",
  terminal: "The terminal: press ` on any page",
  konami: "Alien mode: the Konami code",
  xray: "X-ray: type xray in the terminal",
  cardshark: "Card shark: shuffle the deck three times",
} as const;

export type SecretId = keyof typeof SECRETS;

const KEY = "secrets-found";
const TOTAL = Object.keys(SECRETS).length;

function read(): SecretId[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is SecretId => x in SECRETS) : [];
  } catch {
    return [];
  }
}

export function foundSecrets(): SecretId[] {
  return read();
}

/** Marks a secret found. Only the first time counts, and only then does a toast show. */
export function findSecret(id: SecretId) {
  const list = read();
  if (list.includes(id)) return;
  list.push(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  showCount();
  toast(`Secret found: ${SECRETS[id].split(":")[0]} · ${list.length} / ${TOTAL}`);
}

export function showCount() {
  const n = read().length;
  document.querySelectorAll<HTMLElement>("[data-secrets]").forEach((el) => {
    el.textContent = `${n} / ${TOTAL} secrets found`;
    el.classList.toggle("has-found", n > 0);
  });
}

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** A small note in the corner; also read out by screen readers. */
export function toast(message: string) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "site-toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add("is-on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove("is-on"), 3200);
}

/** ↑ ↑ ↓ ↓ ← → ← → B A: the site turns Omnitrix green for a while. */
export function initKonami() {
  const code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let at = 0;
  addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    at = k === code[at] ? at + 1 : k === code[0] ? 1 : 0;
    if (at < code.length) return;
    at = 0;
    alienMode();
  });
}

let alienTimer = 0;
export function alienMode() {
  const root = document.documentElement;
  root.classList.add("alien-mode");
  findSecret("konami");
  toast("Alien mode: the whole site is on the Omnitrix for 15 seconds");
  window.clearTimeout(alienTimer);
  alienTimer = window.setTimeout(() => root.classList.remove("alien-mode"), 15000);
}
