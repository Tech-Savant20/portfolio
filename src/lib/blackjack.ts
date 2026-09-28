/**
 * Blackjack rules for the casino, shared by the Worker (which deals and
 * scores, so results can't be faked) and the page (which only shows them).
 *
 * Classic rules: one 52-card shoe per player, reshuffled when it runs low;
 * blackjack pays 3:2; the dealer stands on all 17s, soft ones included; you
 * may double on your first two cards; no split, no insurance. The dealer checks
 * for blackjack before you act, so a dealer blackjack ends the hand at once.
 */

export const SUITS = ["S", "H", "D", "C"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
/** e.g. "AS", "10H", "QD". */
export type Card = string;

export const MIN_BET = 10;
export const MAX_BET = 500;
export const START_AURA = 1000;
export const REFILL_AURA = 500;
/** Reshuffle before a hand when fewer cards than this are left. */
export const RESHUFFLE_BELOW = 15;

export const rankOf = (c: Card) => c.slice(0, -1) as Rank;
export const suitOf = (c: Card) => c.slice(-1) as Suit;

export function freshDeck(): Card[] {
  return SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`));
}

/** Fisher–Yates with a caller-supplied source of random integers in [0, n). */
export function shuffle(cards: Card[], randomInt: (n: number) => number): Card[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Best total, and whether an ace is still counting as 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === "A") {
      aces++;
      total += 1;
    } else if (r === "J" || r === "Q" || r === "K") total += 10;
    else total += Number(r);
  }
  // One ace can count as 11 if that doesn't bust.
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;
export const isBust = (cards: Card[]) => handValue(cards).total > 21;

/** The dealer draws to 17 and stands on every 17, soft or hard. */
export function dealerPlays(dealer: Card[], draw: () => Card): Card[] {
  const out = [...dealer];
  while (handValue(out).total < 17) out.push(draw());
  return out;
}

export type Outcome = "blackjack" | "win" | "push" | "lose" | "bust";

/**
 * The result of a finished hand and what goes back to the player, counting the
 * stake: a win returns twice the bet, blackjack two and a half times, a push
 * the bet itself, a loss nothing. `bet` is the full stake (doubled already).
 */
export function settle(player: Card[], dealer: Card[], bet: number): { outcome: Outcome; payout: number } {
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);
  if (p > 21) return { outcome: "bust", payout: 0 };
  if (pBJ && !dBJ) return { outcome: "blackjack", payout: Math.floor(bet * 2.5) };
  if (dBJ && !pBJ) return { outcome: "lose", payout: 0 };
  if (pBJ && dBJ) return { outcome: "push", payout: bet };
  if (d > 21 || p > d) return { outcome: "win", payout: bet * 2 };
  if (p === d) return { outcome: "push", payout: bet };
  return { outcome: "lose", payout: 0 };
}

export const validBet = (bet: unknown, aura: number): bet is number =>
  typeof bet === "number" && Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet <= aura && bet % 5 === 0;
