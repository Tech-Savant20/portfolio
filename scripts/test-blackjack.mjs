// Tests for src/lib/blackjack.ts. Run: node --test scripts/test-blackjack.mjs
// (Node 22.12+ loads the .ts module directly with type stripping.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handValue,
  isBlackjack,
  isBust,
  dealerPlays,
  settle,
  shuffle,
  freshDeck,
  validBet,
} from "../src/lib/blackjack.ts";

test("hand values count aces as 11 only when that doesn't bust", () => {
  assert.deepEqual(handValue(["AS", "KD"]), { total: 21, soft: true });
  assert.deepEqual(handValue(["AS", "AD"]), { total: 12, soft: true });
  assert.deepEqual(handValue(["AS", "AD", "9C"]), { total: 21, soft: true });
  assert.deepEqual(handValue(["AS", "6D", "9C"]), { total: 16, soft: false });
  assert.deepEqual(handValue(["10S", "QD", "2C"]), { total: 22, soft: false });
  assert.deepEqual(handValue(["AS", "AD", "AH", "AC"]), { total: 14, soft: true });
});

test("blackjack is exactly two cards making 21", () => {
  assert.equal(isBlackjack(["AS", "JD"]), true);
  assert.equal(isBlackjack(["7S", "7D", "7C"]), false);
  assert.equal(isBust(["KS", "QD", "2C"]), true);
});

test("the dealer stands on soft 17 and draws below 17", () => {
  const drawFrom = (cards) => () => cards.shift();
  assert.deepEqual(dealerPlays(["AS", "6D"], drawFrom(["5C"])), ["AS", "6D"]);
  assert.deepEqual(dealerPlays(["10S", "6D"], drawFrom(["5C"])), ["10S", "6D", "5C"]);
  // 2+3+4+A is a soft 20: stand.
  assert.deepEqual(dealerPlays(["2S", "3D"], drawFrom(["4C", "AH", "7S"])), ["2S", "3D", "4C", "AH"]);
  // Soft 16 draws; the ace drops to 1 and it keeps drawing to 17 or more.
  assert.deepEqual(dealerPlays(["AS", "5D"], drawFrom(["KC", "5H"])), ["AS", "5D", "KC", "5H"]);
});

test("settlement pays 3:2 for blackjack, 1:1 for a win, returns the stake on a push", () => {
  assert.deepEqual(settle(["AS", "KD"], ["10S", "9D"], 100), { outcome: "blackjack", payout: 250 });
  assert.deepEqual(settle(["AS", "KD"], ["AH", "QC"], 100), { outcome: "push", payout: 100 });
  assert.deepEqual(settle(["10S", "9D"], ["AH", "QC"], 100), { outcome: "lose", payout: 0 });
  assert.deepEqual(settle(["10S", "9D"], ["10H", "7C"], 100), { outcome: "win", payout: 200 });
  assert.deepEqual(settle(["10S", "7D"], ["10H", "7C"], 100), { outcome: "push", payout: 100 });
  assert.deepEqual(settle(["10S", "6D"], ["10H", "6C", "9S"], 100), { outcome: "win", payout: 200 });
  assert.deepEqual(settle(["10S", "6D", "8C"], ["10H", "6C", "9S"], 100), { outcome: "bust", payout: 0 });
  assert.deepEqual(settle(["5S", "6D", "10C"], ["10H", "QC"], 200), { outcome: "win", payout: 400 });
});

test("a shuffle keeps every card exactly once", () => {
  let seed = 7;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const deck = shuffle(freshDeck(), rnd);
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
  assert.notDeepEqual(deck, freshDeck());
});

test("bets must be whole, in range, affordable and in steps of 5", () => {
  assert.equal(validBet(10, 1000), true);
  assert.equal(validBet(500, 1000), true);
  assert.equal(validBet(505, 1000), false);
  assert.equal(validBet(5, 1000), false);
  assert.equal(validBet(100, 50), false);
  assert.equal(validBet(12.5, 1000), false);
  assert.equal(validBet("100", 1000), false);
});
