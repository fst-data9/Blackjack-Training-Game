#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runGameplayScenarios } from "./gameplay-scenarios.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const gamePath = path.join(rootDir, "blackjack-game.js");

const roundCount = Number(process.argv[2] || 1000);
const seed = Number(process.argv[3] || 123456789);
assert.ok(Number.isInteger(roundCount) && roundCount > 0, "Round count must be a positive integer");
assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, "Seed must be a uint32");
function randomGenerator(initialSeed) {
    let value = initialSeed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}
const actionRandom = randomGenerator(seed ^ 0x9e3779b9);
const maxActionsPerRound = 80;

function scoreRecordedCards(cards) {
    const ranks = cards.map(card => card.slice(0, -1));
    const low = ranks.reduce((sum, rank) => sum + (rank === "A" ? 1 : ["J", "Q", "K"].includes(rank) ? 10 : Number(rank)), 0);
    return low + (ranks.includes("A") && low + 10 <= 21 ? 10 : 0);
}

class ClassList {
    constructor() {
        this.classes = new Set();
    }

    add(name) {
        this.classes.add(name);
    }

    toggle(name, force) {
        const enabled = force === undefined ? !this.classes.has(name) : !!force;
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
    }
}

class Element {
    constructor(tagName = "div", id = "") {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.children = [];
        this.style = {};
        this.className = "";
        this.classList = new ClassList();
        this.listeners = {};
        this.disabled = false;
        this.value = "";
        this.textContent = "";
        this.alt = "";
        this.src = "";
    }

    append(...children) {
        for (const child of children) this.appendChild(child);
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    addEventListener(type, handler) {
        this.listeners[type] ||= [];
        this.listeners[type].push(handler);
    }

    click() {
        if (this.disabled) return;
        for (const handler of this.listeners.click || []) handler({ target: this });
    }

    focus() {}

    set disabled(value) {
        this._disabled = Boolean(value);
    }

    get disabled() {
        return this._disabled;
    }

    setAttribute(name, value) {
        this[name] = String(value);
    }

    querySelectorAll(selector) {
        const matches = [];
        const wanted = selector.toUpperCase();

        function visit(node) {
            for (const child of node.children) {
                if (child.tagName === wanted) matches.push(child);
                visit(child);
            }
        }

        visit(this);
        return matches;
    }

    set innerHTML(value) {
        this.children = [];
        this._innerHTML = value;
    }

    get innerHTML() {
        return this._innerHTML || "";
    }
}

function makeDocument() {
    const elements = new Map();
    const ids = [
        "bankrollAmt",
        "betInput",
        "dealerCards",
        "dealerTotal",
        "playerHandsUI",
        "status",
        "strategyLog",
        "statsRounds",
        "statsHands",
        "statsCorrect",
        "statsAccuracy",
        "statsActual",
        "statsEv",
        "statsWagered",
        "statsHints",
        "statsOutcomes",
        "statsInsurance",
        "statsHistory",
        "gamePage",
        "reviewPage",
        "reviewSummary",
        "reviewHands",
        "openReviewBtn",
        "closeReviewBtn",
        "newGameBtn",
        "hitBtn",
        "standBtn",
        "surrenderBtn",
        "deckCountSelect",
        "doubleBtn",
        "splitBtn",
        "insuranceBtn",
        "noInsuranceBtn"
    ];

    const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
    for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, new Element("div", id));
    for (const id of ids) assert.ok(elements.has(id), `Missing real HTML element: ${id}`);

    for (const id of [
        "newGameBtn",
        "hitBtn",
        "standBtn",
        "surrenderBtn",
        "doubleBtn",
        "splitBtn",
        "insuranceBtn",
        "noInsuranceBtn"
    ]) {
        elements.get(id).tagName = "BUTTON";
    }

    elements.get("betInput").value = "1";
    elements.get("deckCountSelect").value = "6";

    return {
        getElementById(id) {
            return elements.get(id) || null;
        },
        createElement(tagName) {
            return new Element(tagName);
        },
        elements
    };
}

function createHarness() {
    const document = makeDocument();
    const recordedHands = [];
    let uuidIndex = 0;
    const gameMath = Object.create(Math);
    gameMath.random = randomGenerator(seed);
    const context = {
        console,
        document,
        location: { hostname: "localhost", protocol: "file:" },
        navigator: { userAgent: "blackjack-sim" },
        crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidIndex).padStart(12, "0")}` },
        fetch: async (url, options) => {
            if (url.endsWith("/api/hands")) recordedHands.push(JSON.parse(options.body));
            return { ok: true, text: async () => "", json: async () => ({}) };
        },
        Math: gameMath,
        setTimeout,
        clearTimeout,
        window: {}
    };
    context.window = context;

    vm.createContext(context);
    vm.runInContext(fs.readFileSync(gamePath, "utf8"), context, { filename: gamePath });

    return {
        context,
        recordedHands,
        elements: document.elements,
        inspect(expression) {
            return vm.runInContext(expression, context);
        },
        click(id) {
            document.getElementById(id).click();
        },
        state() {
            return context.window.__BJ_TEST__.state();
        },
        buttons() {
            return context.window.__BJ_TEST__.buttons();
        },
        dealCards(cards) {
            // Inject the shoe in the VM, keeping deterministic fixtures out of production hooks.
            context.fixtureCards = cards.map(([rank, suit = "♠"]) => ({ rank, suit }));
            vm.runInContext("deck = fixtureCards.slice().reverse(); shoeNeedsShuffle = false; cutCardRemaining = 0;", context);
            this.click("newGameBtn");
        },
        assertSettlement() {
            const state = this.state();
            const records = recordedHands.filter((hand) => hand.roundIndex === state.roundIndex);
            assert.equal(records.length, state.handCount, `Round ${state.roundIndex}: each hand must be recorded exactly once`);
            assert.deepEqual(records.map((hand) => hand.handIndex).sort((a, b) => a - b),
                Array.from({ length: state.handCount }, (_, index) => index));
            for (const record of records) {
                const dollars = record.betCents / 100;
                const expectedNet = record.outcome === "blackjack" ? dollars + Math.floor(dollars / 2)
                    : record.outcome === "surrender" ? -dollars + Math.floor(dollars / 2)
                    : record.outcome === "win" ? dollars : record.outcome === "push" ? 0 : -dollars;
                assert.equal(record.payoutCents, expectedNet * 100, "Saved hand payout differs from monetary rules");
                if (!["surrender", "blackjack"].includes(record.outcome)) {
                    const player = scoreRecordedCards(record.playerCards);
                    const dealer = scoreRecordedCards(record.dealerCards);
                    const expectedOutcome = player > 21 ? "lose" : dealer > 21 || player > dealer ? "win" : player === dealer ? "push" : "lose";
                    assert.equal(record.outcome, expectedOutcome, "Outcome differs from recorded cards");
                }
            }
            if (state.handCount > 1) {
                assert.equal(vm.runInContext("playerHands.every(hand => hand._done)", context), true,
                    `Round ${state.roundIndex}: ended with an unfinished split hand`);
            }
        }
    };
}

function assertRoundState(state, round, step) {
    if (!Number.isFinite(state.bankroll)) {
        throw new Error(`Round ${round}, step ${step}: bankroll is not finite`);
    }
    if (state.bankroll < 0) {
        throw new Error(`Round ${round}, step ${step}: bankroll went negative`);
    }
    if (state.handCount < 1 || state.handCount > state.maxHands) {
        throw new Error(`Round ${round}, step ${step}: invalid hand count ${state.handCount}`);
    }
    if (state.activeHandIndex < 0 || state.activeHandIndex >= state.handCount) {
        throw new Error(`Round ${round}, step ${step}: invalid active hand index`);
    }
    for (const total of state.playerTotals) {
        if (!Number.isInteger(total) || total < 2 || total > 31) {
            throw new Error(`Round ${round}, step ${step}: suspicious player total ${total}`);
        }
    }
}

function assertActionAvailability(game) {
    const state = game.state();
    const buttons = game.buttons();
    const hand = game.inspect("currentHand()");
    const finished = Boolean(hand._done);
    const playable = state.inRound && !state.awaitingInsurance && !finished;
    const bet = game.inspect("playerHands ? bets[activeHandIndex] : currentBet");
    const value = card => card.rank === "A" ? 11 : ["J", "Q", "K"].includes(card.rank) ? 10 : Number(card.rank);
    const expected = {
        deal: !state.inRound,
        hit: playable,
        stand: playable,
        surrender: playable && state.handCount === 1 && !game.inspect("didSplit") && hand.length === 2,
        double: playable && hand.length === 2 && state.bankroll >= bet,
        split: playable && hand.length === 2 && value(hand[0]) === value(hand[1]) && state.bankroll >= bet && state.handCount < 4,
        insurance: state.awaitingInsurance && Math.floor(state.currentBet / 2) > 0 && state.bankroll >= Math.floor(state.currentBet / 2),
        noInsurance: state.awaitingInsurance,
    };
    assert.deepEqual({ ...buttons }, expected, "Button availability differs from independent gameplay rules");
}

function chooseAction(buttons) {
    if (buttons.insurance || buttons.noInsurance) {
        return actionRandom() < 0.25 && buttons.insurance ? "insuranceBtn" : "noInsuranceBtn";
    }

    const weighted = [];
    if (buttons.split) weighted.push("splitBtn", "splitBtn", "splitBtn");
    if (buttons.double) weighted.push("doubleBtn");
    if (buttons.surrender) weighted.push("surrenderBtn");
    if (buttons.hit) weighted.push("hitBtn", "hitBtn", "hitBtn");
    if (buttons.stand) weighted.push("standBtn", "standBtn");

    if (weighted.length === 0) return null;
    return weighted[Math.floor(actionRandom() * weighted.length)];
}

// Random play can miss rare card sequences and cannot establish the intended
// transition rules. Run fixed regression scenarios on every simulation run.
function splitAceFixture(firstCard, secondCard, extraCards = []) {
    const game = createHarness();
    game.elements.get("betInput").value = "20";
    game.dealCards([["A"], ["9"], ["A", "♥"], ["8"], [firstCard], [secondCard], ...extraCards.map(rank => [rank])]);
    assert.equal(game.buttons().split, true);
    game.click("splitBtn");
    return game;
}

function assertPlayingHand(game, index) {
    assert.equal(game.state().inRound, true, "A split round must remain active while another hand needs play");
    assert.equal(game.state().activeHandIndex, index);
    assert.equal(game.buttons().deal, false);
    assert.equal(game.buttons().hit, true);
    assert.equal(game.buttons().stand, true);
    assert.equal(game.recordedHands.length, 0, "Do not settle before the remaining hands finish");
    assert.ok(game.elements.get("dealerCards").querySelectorAll("img")[1].src.endsWith("/RED_BACK.svg"));
}

function assertAceSettlement(game, bankroll, outcomes) {
    assert.equal(game.state().inRound, false);
    game.assertSettlement();
    assert.equal(game.state().bankroll, bankroll);
    assert.deepEqual(game.recordedHands.map(hand => hand.outcome), outcomes);
    assert.ok(game.recordedHands.every(hand => hand.didSplit && hand.outcome !== "blackjack"),
        "Split 21 pays as a regular hand, never a natural blackjack");
    const stats = game.context.window.__BJ_TEST__.stats();
    assert.equal(stats.hands, 2);
    assert.equal(stats.actualNet, bankroll - 1000);
}

const firstAce21 = splitAceFixture("K", "5", ["5"]);
assertPlayingHand(firstAce21, 1);
firstAce21.click("hitBtn");
assertAceSettlement(firstAce21, 1040, ["win", "win"]);

const secondAce21 = splitAceFixture("5", "Q");
assertPlayingHand(secondAce21, 0);
secondAce21.click("standBtn");
assertAceSettlement(secondAce21, 1000, ["lose", "win"]);

const bothAces21 = splitAceFixture("10", "J");
assertAceSettlement(bothAces21, 1040, ["win", "win"]);

const hitAce21 = splitAceFixture("5", "6", ["5"]);
assertPlayingHand(hitAce21, 0);
hitAce21.click("hitBtn");
assertPlayingHand(hitAce21, 1);
hitAce21.click("standBtn");
assertAceSettlement(hitAce21, 1020, ["win", "push"]);

const bustAce = splitAceFixture("9", "6", ["5", "K"]);
assertPlayingHand(bustAce, 0);
bustAce.click("hitBtn"); // Soft 20 becomes hard 15.
assertPlayingHand(bustAce, 0);
bustAce.click("hitBtn");
assertPlayingHand(bustAce, 1);
bustAce.click("standBtn");
assertAceSettlement(bustAce, 980, ["lose", "push"]);

const scenarioCoverage = runGameplayScenarios(createHarness);

const game = createHarness();
const startingBankroll = Math.max(1000, roundCount * 20);
game.context.window.__BJ_TEST__.setBankroll(startingBankroll);

let completed = 0;
let maxHandsSeen = 1;
let insurancePrompts = 0;
let expectedHands = 0;

for (let round = 1; round <= roundCount; round++) {
    if (!game.buttons().deal) {
        throw new Error(`Round ${round}: Deal button was not available`);
    }

    const previousRoundIndex = game.state().roundIndex;
    const decisionsBeforeRound = game.context.__BJ_TEST__.stats().decisions;
    game.elements.get("betInput").value = String([1, 2, 3, 25][round % 4]);
    game.click("newGameBtn");

    if (game.state().roundIndex === previousRoundIndex) {
        throw new Error(`Round ${round}: deal did not start a round (${game.state().status})`);
    }

    let sawInsuranceThisRound = false;
    for (let step = 1; step <= maxActionsPerRound + 1; step++) {
        const state = game.state();
        assertRoundState(state, round, step);
        assertActionAvailability(game);
        const decisions = game.inspect("strategyDecisions");
        assert.equal(new Set(decisions.map(item => item.id)).size, decisions.length, "Duplicate strategy decision IDs");
        assert.equal(decisions.filter(item => item.action).length,
            game.context.__BJ_TEST__.stats().decisions - decisionsBeforeRound,
            "Decision records and decision count disagree");
        if (state.inRound) {
            const dealerImages = game.elements.get("dealerCards").querySelectorAll("img");
            if (!dealerImages[1] || !dealerImages[1].src.endsWith("/RED_BACK.svg")) {
                throw new Error(`Round ${round}, step ${step}: dealer hole card was visible during play`);
            }
        }
        maxHandsSeen = Math.max(maxHandsSeen, state.handCount);
        if (state.awaitingInsurance) sawInsuranceThisRound = true;

        if (!state.inRound) {
            game.assertSettlement();
            expectedHands += state.handCount;
            completed += 1;
            if (sawInsuranceThisRound) insurancePrompts += 1;
            break;
        }

        if (step > maxActionsPerRound) {
            throw new Error(`Round ${round}: exceeded ${maxActionsPerRound} actions`);
        }

        const action = chooseAction(game.buttons());
        if (!action) {
            throw new Error(`Round ${round}, step ${step}: no legal action while round active`);
        }

        game.click(action);

    }
}

const finalState = game.state();
const stats = game.context.window.__BJ_TEST__.stats();
if (stats.rounds !== roundCount) {
    throw new Error(`Stats recorded ${stats.rounds} rounds, expected ${roundCount}`);
}
if (stats.hands !== expectedHands) {
    throw new Error(`Stats recorded ${stats.hands} hands, expected ${expectedHands}`);
}
if (stats.actualNet !== finalState.bankroll - startingBankroll) {
    throw new Error(
        `Actual return ${stats.actualNet} does not match bankroll change ${finalState.bankroll - startingBankroll}`
    );
}
if (stats.correctDecisions > stats.decisions) {
    throw new Error("Correct decision count exceeds total decisions");
}
const recordedOutcomes = Object.values(stats.outcomes).reduce((sum, count) => sum + count, 0);
if (recordedOutcomes !== stats.hands) {
    throw new Error(`Outcome count ${recordedOutcomes} does not match hand count ${stats.hands}`);
}
if (stats.insuranceTaken > stats.insuranceOffered) {
    throw new Error("Insurance taken count exceeds offers");
}

game.click("resetBankrollBtn");
if (game.state().bankroll !== 1000) {
    throw new Error(`Reset bankroll produced ${game.state().bankroll}, expected 1000`);
}

game.click("openReviewBtn");
if (!game.elements.get("gamePage").hidden || game.elements.get("reviewPage").hidden) {
    throw new Error("Review button did not open the review page");
}
if (
    stats.correctDecisions < stats.decisions &&
    game.elements.get("reviewHands").children.length === 0
) {
    throw new Error("Incorrect decisions were not added to the review page");
}
game.click("closeReviewBtn");
if (game.elements.get("gamePage").hidden || !game.elements.get("reviewPage").hidden) {
    throw new Error("Back button did not return to the game page");
}

console.log(
    JSON.stringify(
        {
            ok: true,
            deterministicScenarios: 5 + Object.values(scenarioCoverage).filter(value => value === true).length,
            scenarioCoverage,
            seed,
            roundsRequested: roundCount,
            roundsCompleted: completed,
            finalBankroll: finalState.bankroll,
            stats,
            maxHandsSeen,
            insurancePrompts
        },
        null,
        2
    )
);
