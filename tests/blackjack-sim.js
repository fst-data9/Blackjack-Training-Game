#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const gamePath = path.join(rootDir, "blackjack-game.js");

const roundCount = Number(process.argv[2] || 1000);
const maxActionsPerRound = 80;

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

    for (const id of ids) elements.set(id, new Element("div", id));

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
            if (!elements.has(id)) elements.set(id, new Element("div", id));
            return elements.get(id);
        },
        createElement(tagName) {
            return new Element(tagName);
        },
        elements
    };
}

function createHarness() {
    const document = makeDocument();
    const context = {
        console,
        document,
        location: { hostname: "localhost", protocol: "file:" },
        navigator: { userAgent: "blackjack-sim" },
        crypto: { randomUUID: () => "sim-session" },
        fetch: async () => ({ ok: true, text: async () => "", json: async () => ({}) }),
        Math,
        setTimeout,
        clearTimeout,
        window: {}
    };
    context.window = context;

    vm.createContext(context);
    vm.runInContext(fs.readFileSync(gamePath, "utf8"), context, { filename: gamePath });

    return {
        context,
        elements: document.elements,
        click(id) {
            document.getElementById(id).click();
        },
        state() {
            return context.window.__BJ_TEST__.state();
        },
        buttons() {
            return context.window.__BJ_TEST__.buttons();
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

function chooseAction(buttons) {
    if (buttons.insurance || buttons.noInsurance) {
        return Math.random() < 0.25 && buttons.insurance ? "insuranceBtn" : "noInsuranceBtn";
    }

    const weighted = [];
    if (buttons.split) weighted.push("splitBtn", "splitBtn", "splitBtn");
    if (buttons.double) weighted.push("doubleBtn");
    if (buttons.surrender) weighted.push("surrenderBtn");
    if (buttons.hit) weighted.push("hitBtn", "hitBtn", "hitBtn");
    if (buttons.stand) weighted.push("standBtn", "standBtn");

    if (weighted.length === 0) return null;
    return weighted[Math.floor(Math.random() * weighted.length)];
}

const game = createHarness();
const startingBankroll = Math.max(1000, roundCount * 20);
game.context.window.__BJ_TEST__.setBankroll(startingBankroll);

let completed = 0;
let maxHandsSeen = 1;
let insurancePrompts = 0;

for (let round = 1; round <= roundCount; round++) {
    if (!game.buttons().deal) {
        throw new Error(`Round ${round}: Deal button was not available`);
    }

    const previousRoundIndex = game.state().roundIndex;
    game.elements.get("betInput").value = "2";
    game.click("newGameBtn");

    if (game.state().roundIndex === previousRoundIndex) {
        throw new Error(`Round ${round}: deal did not start a round (${game.state().status})`);
    }

    let sawInsuranceThisRound = false;
    for (let step = 1; step <= maxActionsPerRound; step++) {
        const state = game.state();
        assertRoundState(state, round, step);
        if (state.inRound) {
            const dealerImages = game.elements.get("dealerCards").querySelectorAll("img");
            if (dealerImages[1] && !dealerImages[1].src.endsWith("/RED_BACK.svg")) {
                throw new Error(`Round ${round}, step ${step}: dealer hole card was visible during play`);
            }
        }
        maxHandsSeen = Math.max(maxHandsSeen, state.handCount);
        if (state.awaitingInsurance) sawInsuranceThisRound = true;

        if (!state.inRound) {
            completed += 1;
            if (sawInsuranceThisRound) insurancePrompts += 1;
            break;
        }

        const action = chooseAction(game.buttons());
        if (!action) {
            throw new Error(`Round ${round}, step ${step}: no legal action while round active`);
        }

        game.click(action);

        if (step === maxActionsPerRound) {
            throw new Error(`Round ${round}: exceeded ${maxActionsPerRound} actions`);
        }
    }
}

const finalState = game.state();
const stats = game.context.window.__BJ_TEST__.stats();
if (stats.rounds !== roundCount) {
    throw new Error(`Stats recorded ${stats.rounds} rounds, expected ${roundCount}`);
}
if (stats.hands < completed) {
    throw new Error(`Stats recorded fewer hands (${stats.hands}) than completed rounds (${completed})`);
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
