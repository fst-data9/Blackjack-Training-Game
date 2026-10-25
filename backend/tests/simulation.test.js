import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import express from 'express';
import { validateConfig, score, basicAction, selectAction, playRound, simulate } from '../simulation-engine.js';
import catalog from '../../strategy-catalog.cjs';
import { createBettingPlan } from '../betting-strategies.js';
import { registerSimulationRoutes, runSimulation } from '../simulation-routes.js';
const config = { rounds: 1000, bankroll: 1000000, baseBet: 1000, tableLimit: 100000, betting: 'flat', playing: 'basic', insurance: false, overrides: {} };
function round(cards, settings = {}, balance = 100000, bet = 1000) {
  return playRound({ ...config, ...settings }, balance, bet, () => { assert.ok(cards.length, 'unexpected draw'); return cards.shift(); });
}

test('strict bounded input and overrides', () => {
  assert.deepEqual(validateConfig(config), config);
  for (const change of [{ rounds: 100001 }, { bankroll: 100.5 }, { baseBet: 1000001 }, { tableLimit: 100 }, { insurance: 'false' }, { betting: 'code' }, { overrides: { 'hard:16:10': 'split' } }, { overrides: { 'hard:99:10': 'hit' } }, { overrides: [] }, { overrides: { '__proto__': null, 'pair:11:11': 'eval' } }]) {
    assert.throws(() => validateConfig({ ...config, ...change }));
  }
});

test('basic decisions match browser strategy across card and legality matrix', () => {
  const source = fs.readFileSync(new URL('../../blackjack-game.js', import.meta.url), 'utf8');
  const context = vm.createContext({ handValue: cards => score(cards).total, cardValueForSplit: card => card });
  vm.runInContext(source.slice(source.indexOf('function pairStrategy('), source.indexOf('function recommendedAction(')), context);
  for (let a = 2; a <= 11; a++) for (let b = 2; b <= 11; b++) for (let up = 2; up <= 11; up++) {
    for (const double of [true, false]) for (const split of [true, false]) for (const surrender of [true, false]) {
      const cards = [a, b];
      const expected = context.pairStrategy(cards, up, split) || (score(cards).soft ? context.softStrategy(cards, up, double) : context.hardStrategy(score(cards).total, up, double, surrender));
      assert.equal(basicAction(cards, up, { double, split, surrender }), expected, `${cards} vs ${up}`);
    }
  }
});

test('opening blackjack, dealer peek, insurance and whole-dollar rounding', () => {
  assert.equal(round([11, 10, 10, 9]).balance, 101500);
  assert.equal(round([11, 11, 10, 10]).balance, 100000);
  assert.equal(round([10, 11, 9, 10], { insurance: true }).balance, 100000);
  assert.equal(round([10, 11, 9, 7], { insurance: true }).balance, 100500);
  assert.equal(round([11, 10, 10, 9], {}, 100000, 500).balance, 100700);
  assert.equal(round([10, 10, 6, 9], {}, 100000, 500).balance, 99700);
  assert.equal(round([10, 11, 9, 10], { insurance: true }, 1000).balance, 0);
});

test('double, surrender, soft 17, custom decisions and legal fallbacks', () => {
  assert.equal(round([5, 6, 6, 10, 10, 10]).balance, 102000);
  assert.equal(round([10, 10, 6, 9]).outcomes.surrender, 1);
  assert.equal(round([10, 11, 8, 6]).balance, 101000); // dealer stands soft 17
  assert.equal(round([10, 6, 6, 10, 10], { overrides: { 'hard:16:6': 'hit' } }).balance, 99000);
  assert.equal(selectAction([8, 8], 6, { split: false, double: false, surrender: false }, { 'pair:8:6': 'split' }), 'stand');
  assert.equal(selectAction([10, 4, 2], 10, { split: false, double: false, surrender: false }, { 'hard:16:10': 'surrender' }), 'hit');
  assert.equal(selectAction([8, 8], 6, { split: true, double: true, surrender: true }, { 'pair:8:6': 'hit', 'hard:16:6': 'stand' }), 'hit');
});

test('split aces receive one card each, cannot hit or re-split, and 21 pays ordinary winnings', () => {
  const aces = round([11, 9, 11, 8, 10, 5, 5], { overrides: { 'pair:11:9': 'split', 'hard:16:9': 'hit' } });
  assert.equal(aces.balance, 100000); assert.equal(aces.outcomes.win, 1); assert.equal(aces.outcomes.lose, 1); assert.equal(aces.outcomes.blackjack, 0);
  assert.equal(aces.wagered, 2000);
  const split = round([8, 6, 8, 10, 8, 8, 8, 8, 8, 8, 10]);
  assert.equal(split.outcomes.win, 4); assert.equal(split.wagered, 4000);
});

test('seeded runs, accounting, bounds and worker agree up to 100k rounds', async () => {
  for (const rounds of [1000, 10000, 100000]) {
    const settings = { ...config, rounds, bankroll: 100000000 };
    const result = simulate(settings, 42);
    assert.equal(result.roundsPlayed, rounds);
    assert.equal(result.profit, result.finalBankroll - settings.bankroll);
    assert.equal(Object.values(result.roundOutcomes).reduce((a, b) => a + b), rounds);
    assert.equal(Object.values(result.outcomes).reduce((a, b) => a + b), result.handsPlayed);
    assert.ok(result.points.length <= 502);
    assert.equal(result.points.at(-1).profit, result.profit);
    assert.deepEqual(await runSimulation(settings, 42), result);
  }
  const stopped = simulate({ ...config, bankroll: 1000, betting: 'martingale' }, 1);
  assert.equal(stopped.stopReason, 'insufficient_bankroll');
  assert.ok(stopped.roundsPlayed < config.rounds);
  assert.ok(stopped.finalBankroll >= 0);
  const capped = simulate({ ...config, betting: 'martingale', tableLimit: 2000 }, 42);
  assert.ok(capped.largestBet <= 2000);
  await assert.rejects(runSimulation(config, 42, AbortSignal.abort()));
});

test('API saves one server-generated summary, validates, limits and handles failures', async t => {
  const app = express(); app.use(express.json());
  const inserts = [];
  let fail = false;
  registerSimulationRoutes(app, { authenticateOptional: (req, res, next) => next(), pool: { query: async (...args) => { if (fail) throw new Error('DB unavailable'); inserts.push(args); } } });
  app.use((error, req, res, next) => res.status(500).json({ error: 'Internal server error' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = data => fetch(`http://127.0.0.1:${server.address().port}/api/simulations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post({ ...config, rounds: 999 })).status, 400);
  const response = await post({ ...config, result: { profit: 999999 } });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(inserts.length, 1);
  assert.match(inserts[0][0], /INSERT INTO simulation_runs/);
  assert.equal(inserts[0][1][1], null);
  assert.deepEqual(JSON.parse(inserts[0][1][5]), body.result);
  assert.equal('result' in body.config, false);
  fail = true;
  assert.equal((await post(config)).status, 500);
  assert.equal((await post(config)).status, 500);
  assert.equal((await post(config)).status, 429);
  assert.equal(inserts.length, 1);
});

test('API rejects excess concurrent workers and uses authenticated ownership', async t => {
  const app = express(); app.use(express.json());
  const pending = [], inserts = [];
  registerSimulationRoutes(app, { authenticateOptional: (req, res, next) => { req.user = { id: 'server-user' }; next(); },
    pool: { query: async (...args) => inserts.push(args) },
    run: () => new Promise(resolve => pending.push(resolve)) });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = () => fetch(`http://127.0.0.1:${server.address().port}/api/simulations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, user_id: 'attacker' }) });
  const first = post(), second = post();
  while (pending.length < 2) await new Promise(resolve => setTimeout(resolve, 5));
  const busy = await post(); assert.equal(busy.status, 503);
  pending.forEach(resolve => resolve(simulate(config, 42)));
  assert.equal((await first).status, 201); assert.equal((await second).status, 201);
  assert.ok(inserts.every(([, values]) => values[1] === 'server-user'));
});


test('betting progressions follow documented sequences, pushes, resets and caps', () => {
  function bets(betting, outcomes, tableLimit = 100000) {
    const plan = createBettingPlan({ ...config, betting, tableLimit });
    return [plan.current(), ...outcomes.map(net => plan.settle(net))].map(value => value / 1000);
  }
  assert.deepEqual(bets('martingale', [-1, 0, -1, 1]), [1, 2, 2, 4, 1]);
  assert.deepEqual(bets('paroli', [1, 0, 1, 1, -1]), [1, 2, 2, 4, 1, 1]);
  assert.deepEqual(bets('dalembert', [-1, -1, 0, 1, 1, 1]), [1, 2, 3, 3, 2, 1, 1]);
  assert.deepEqual(bets('fibonacci', [-1, -1, 0, -1, 1, 1, 1]), [1, 2, 3, 3, 5, 2, 1, 1]);
  assert.deepEqual(bets('wave', [0, -1, 1, 0]), [1, 2, 3, 2, 1]);
  assert.deepEqual(bets('pulse', [0, -1, 1, 0, 1]), [1, 1, 1, 1, 5, 1]);
  assert.deepEqual(bets('fibonacci', [-1, -1, -1, -1, 1], 2500), [1, 2, 2.5, 2.5, 2.5, 1]);
  assert.deepEqual(bets('dalembert', [-1, -1, -1, 1], 2500), [1, 2, 2.5, 2.5, 1.5]);
  for (const { id } of catalog.betting) {
    const plan = createBettingPlan({ ...config, betting: id, tableLimit: config.baseBet });
    for (let i = 0; i < 100000; i++) assert.equal(plan.settle(-1), config.baseBet);
  }
});

test('playing presets, custom priority and unavailable-action fallbacks', () => {
  const available = { double: true, split: false, surrender: true };
  assert.equal(selectAction([11, 6], 10, available, {}, 'mimic'), 'stand');
  assert.equal(selectAction([10, 9], 6, available, {}, 'chase20'), 'hit');
  assert.equal(selectAction([10, 6], 10, { ...available, surrender: false }, {}, 'never-bust'), 'stand');
  assert.equal(selectAction([10, 6], 10, available, {}, 'never-bust'), 'surrender');
  assert.equal(selectAction([10, 10], 10, { ...available, split: true }, {}, 'split-party'), 'split');
  assert.equal(selectAction([10, 10], 10, available, {}, 'split-party'), 'stand');
  assert.equal(selectAction([10, 9], 6, available, { 'hard:19:6': 'stand' }, 'chase20'), 'stand');
  assert.equal(selectAction([10, 5, 4], 6, { double: false }, { 'hard:19:6': 'double' }, 'chase20'), 'hit');
  assert.throws(() => validateConfig({ ...config, playing: 'unknown' }));
  const { playing, ...legacy } = config;
  assert.equal(validateConfig(legacy).playing, 'basic');
});

test('every advertised preset runs deterministically with bounded money and chart data', () => {
  for (const betting of catalog.betting) for (const playing of catalog.playing) {
    const settings = validateConfig({ ...config, betting: betting.id, playing: playing.id });
    const result = simulate(settings, 12345);
    assert.deepEqual(simulate(settings, 12345), result);
    assert.ok(result.finalBankroll >= 0);
    assert.ok(result.largestBet <= config.tableLimit);
    assert.ok(result.points.length <= 502);
    assert.equal(result.roundsPlayed, Object.values(result.roundOutcomes).reduce((a, b) => a + b));
    assert.equal(result.profit, result.finalBankroll - config.bankroll);
  }
});
