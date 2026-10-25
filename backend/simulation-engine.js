import catalog from '../strategy-catalog.cjs';
import { createBettingPlan } from './betting-strategies.js';
// Versioned, deterministic server simulation. Money is integer cents; payouts
// round down to whole dollars to match the browser trainer's settlement rules.
export const ENGINE_VERSION = 3;
export const ACTIONS = ['hit', 'stand', 'double', 'split', 'surrender'];
export function validateConfig(input) {
  const fail = () => { throw new Error('Invalid simulation settings'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const { rounds, bankroll, baseBet, tableLimit, betting, insurance, playing = 'basic', overrides = {} } = input;
  if (![1000, 10000, 100000].includes(rounds)) fail();
  for (const value of [bankroll, baseBet, tableLimit]) {
    if (!Number.isInteger(value) || value < 100 || value > 100000000 || value % 100) fail();
  }
  if (baseBet > bankroll || baseBet > tableLimit || !catalog.betting.some(entry => entry.id === betting) || !catalog.playing.some(entry => entry.id === playing) || typeof insurance !== 'boolean') fail();
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).length > 360) fail();
  const clean = {};
  for (const [key, action] of Object.entries(overrides)) {
    const match = /^(hard|soft|pair):(\d+):(\d+)$/.exec(key);
    if (!match || !ACTIONS.includes(action)) fail();
    const [, type, total, up] = match;
    const [min, max] = type === 'hard' ? [4, 20] : type === 'soft' ? [12, 20] : [2, 11];
    if (+total < min || +total > max || +up < 2 || +up > 11 || key !== `${type}:${+total}:${+up}`) fail();
    if (action === 'split' && type !== 'pair') fail();
    clean[key] = action;
  }
  return { rounds, bankroll, baseBet, tableLimit, betting, insurance, playing, overrides: clean };
}
export function score(cards) {
  let total = cards.reduce((a, b) => a + b, 0);
  let aces = cards.filter(card => card === 11).length;
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export function basicAction(cards, up, { double, split, surrender }) {
  const { total, soft } = score(cards);
  if (split && cards.length === 2 && cards[0] === cards[1]) {
    const pair = cards[0];
    if ([11, 8].includes(pair)) return 'split';
    if (pair === 9) return [2, 3, 4, 5, 6, 8, 9].includes(up) ? 'split' : 'stand';
    if ([2, 3, 7].includes(pair)) return up <= 7 ? 'split' : 'hit';
    if (pair === 6) return up <= 6 ? 'split' : 'hit';
    if (pair === 4) return [5, 6].includes(up) ? 'split' : 'hit';
  }
  if (soft) {
    if (total >= 19) return 'stand';
    if (total === 18) {
      if (up >= 3 && up <= 6) return double ? 'double' : 'stand';
      return [2, 7, 8].includes(up) ? 'stand' : 'hit';
    }
    const lower = total === 17 ? 3 : total >= 15 ? 4 : total >= 13 ? 5 : 99;
    return double && up >= lower && up <= 6 ? 'double' : 'hit';
  }
  if (surrender && ((total === 16 && up >= 9) || (total === 15 && up === 10))) return 'surrender';
  if (total >= 17) return 'stand';
  if (total >= 13) return up <= 6 ? 'stand' : 'hit';
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (double && ((total === 11 && up !== 11) || (total === 10 && up <= 9) || (total === 9 && up >= 3 && up <= 6))) return 'double';
  return 'hit';
}
export function selectAction(cards, up, available, overrides, playing = 'basic') {
  const { total, soft } = score(cards);
  const pairKey = cards.length === 2 && cards[0] === cards[1] ? `pair:${cards[0]}:${up}` : '';
  const action = overrides[pairKey] || overrides[`${soft ? 'soft' : 'hard'}:${total}:${up}`];
  // An unavailable custom action falls back to the selected legal playing preset.
  if (action && (['hit', 'stand'].includes(action) || available[action])) return action;
  const basic = basicAction(cards, up, available);
  if (playing === 'mimic') return total < 17 ? 'hit' : 'stand';
  if (playing === 'chase20') return total < 20 ? 'hit' : 'stand';
  if (playing === 'never-bust' && !soft && total >= 12 && basic === 'hit') return 'stand';
  if (playing === 'split-party' && available.split) return 'split';
  return basic;
}
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
const half = cents => Math.floor(cents / 200) * 100;
export function playRound(config, balance, bet, draw) {
  const player = [draw()];
  const dealer = [draw()];
  player.push(draw()); dealer.push(draw());
  balance -= bet;
  let wagered = bet;
  const outcomes = { win: 0, lose: 0, push: 0, blackjack: 0, surrender: 0 };
  const insuranceBet = config.insurance && dealer[0] === 11 && balance >= half(bet) ? half(bet) : 0;
  balance -= insuranceBet; wagered += insuranceBet;
  const natural = score(player).total === 21;
  if (score(dealer).total === 21) {
    balance += insuranceBet * 3 + (natural ? bet : 0);
    outcomes[natural ? 'push' : 'lose']++;
    return { balance, wagered, outcomes };
  }
  if (natural) {
    balance += bet * 2 + half(bet); outcomes.blackjack++;
    return { balance, wagered, outcomes };
  }
  const hands = [{ cards: player, bet, surrendered: false, splitAces: false }];
  for (let i = 0; i < hands.length; i++) {
    const hand = hands[i];
    while (!hand.splitAces && score(hand.cards).total < 21) {
      const two = hand.cards.length === 2;
      const available = {
        double: two && balance >= hand.bet,
        split: two && hand.cards[0] === hand.cards[1] && hands.length < 4 && balance >= hand.bet,
        surrender: two && hands.length === 1,
      };
      const action = selectAction(hand.cards, dealer[0], available, config.overrides, config.playing);
      if (action === 'stand') break;
      if (action === 'surrender') { hand.surrendered = true; break; }
      if (action === 'double') {
        balance -= hand.bet; wagered += hand.bet; hand.bet *= 2;
        hand.cards.push(draw()); break;
      }
      if (action === 'split') {
        balance -= hand.bet; wagered += hand.bet;
        const splittingAces = hand.cards[0] === 11;
        const other = { cards: [hand.cards.pop()], bet: hand.bet, surrendered: false, splitAces: splittingAces };
        hand.splitAces = splittingAces;
        hand.cards.push(draw()); other.cards.push(draw());
        hands.splice(i + 1, 0, other);
      } else hand.cards.push(draw());
    }
  }
  if (hands.some(hand => !hand.surrendered && score(hand.cards).total <= 21)) {
    while (score(dealer).total < 17) dealer.push(draw());
  }
  const dealerTotal = score(dealer).total;
  for (const hand of hands) {
    const total = score(hand.cards).total;
    const outcome = hand.surrendered ? 'surrender' : total > 21 ? 'lose' : dealerTotal > 21 || total > dealerTotal ? 'win' : total === dealerTotal ? 'push' : 'lose';
    outcomes[outcome]++;
    balance += outcome === 'surrender' ? half(hand.bet) : outcome === 'win' ? hand.bet * 2 : outcome === 'push' ? hand.bet : 0;
  }
  return { balance, wagered, outcomes };
}
export function simulate(config, seed) {
  const random = seededRandom(seed);
  let shoe = [], cut = 0;
  function shuffle() {
    shoe = Array.from({ length: 6 * 52 }, (_, i) => [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10][i % 13]);
    for (let i = shoe.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
    cut = Math.floor((1 + random() * 0.5) * 52);
  }
  const draw = () => { if (!shoe.length) throw new Error('Shoe exhausted'); return shoe.pop(); };
  const plan = createBettingPlan(config);
  let balance = config.bankroll, nextBet = plan.current(), peak = balance;
  const result = { roundsPlayed: 0, handsPlayed: 0, totalWagered: 0, maxDrawdown: 0, largestBet: 0,
    outcomes: { win: 0, lose: 0, push: 0, blackjack: 0, surrender: 0 },
    roundOutcomes: { profit: 0, loss: 0, even: 0 }, points: [{ round: 0, profit: 0 }], stopReason: 'completed' };
  const interval = Math.ceil(config.rounds / 500);
  for (let round = 1; round <= config.rounds; round++) {
    if (balance < nextBet) { result.stopReason = 'insufficient_bankroll'; break; }
    if (shoe.length <= cut) shuffle();
    const before = balance;
    const settlement = playRound(config, balance, nextBet, draw);
    balance = settlement.balance;
    result.totalWagered += settlement.wagered;
    result.largestBet = Math.max(result.largestBet, nextBet);
    for (const key of Object.keys(result.outcomes)) { result.outcomes[key] += settlement.outcomes[key]; result.handsPlayed += settlement.outcomes[key]; }
    const net = balance - before;
    result.roundOutcomes[net > 0 ? 'profit' : net < 0 ? 'loss' : 'even']++;
    nextBet = plan.settle(net);
    peak = Math.max(peak, balance); result.maxDrawdown = Math.max(result.maxDrawdown, peak - balance);
    result.roundsPlayed = round;
    if (round % interval === 0) result.points.push({ round, profit: balance - config.bankroll });
  }
  if (result.points.at(-1).round !== result.roundsPlayed) result.points.push({ round: result.roundsPlayed, profit: balance - config.bankroll });
  return { ...result, finalBankroll: balance, profit: balance - config.bankroll };
}
