// ----- Card / Deck helpers -----
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const MAX_HANDS = 4;
const DEALER_HITS_SOFT_17 = false;
const bankrollAmtEl = document.getElementById("bankrollAmt");
const betInputEl = document.getElementById("betInput");
let sessionId = crypto.randomUUID();
window.BLACKJACK_SESSION_ID = sessionId;
window.API_BASE = window.API_BASE || "http://localhost:3001";

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ rank, suit });
        }
    }
    return deck;
}

function shuffle(deck) {
    // Fisher–Yates
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function cardToString(card) {
    return `${card.rank}${card.suit}`;
}
function buildAndShuffleShoe(deckCount) {
    deck = [];
    for (let i = 0; i < deckCount; i++) deck.push(...createDeck());
    shuffle(deck);

    // Typical casino: stop dealing with ~1 to 1.5 decks remaining.
    const minUndealtDecks = 1.0;
    const maxUndealtDecks = 1.5;

    const undealtDecks =
        minUndealtDecks + Math.random() * (maxUndealtDecks - minUndealtDecks);

    cutCardRemaining = Math.floor(undealtDecks * 52);

    shoeNeedsShuffle = false;
}
function cardValueForSplit(card) {
    if (card.rank === "A") return 11;                 // treat Ace as its own (no A+K split)
    if (["K", "Q", "J"].includes(card.rank)) return 10;
    return Number(card.rank);                         // "2".."10"
}
function isTenValue(card) {
    return card && (card.rank === "10" || ["K", "Q", "J"].includes(card.rank));
}
function handValue(hand) {
    // Count Aces as 11 initially, then reduce to 1 as needed
    let total = 0;
    let aces = 0;

    for (const c of hand) {
        if (c.rank === "A") {
            total += 11;
            aces += 1;
        } else if (["K", "Q", "J"].includes(c.rank)) {
            total += 10;
        } else {
            total += Number(c.rank);
        }
    }

    while (total > 21 && aces > 0) {
        total -= 10; // convert one Ace from 11 to 1
        aces -= 1;
    }
    return total;
}
function isSoftHand(hand) {
    let total = 0;
    let aces = 0;

    for (const c of hand) {
        if (c.rank === "A") {
            total += 11;
            aces += 1;
        } else if (isTenValue(c)) {
            total += 10;
        } else {
            total += Number(c.rank);
        }
    }

    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }

    return aces > 0;
}
function isBlackjack(hand) {
    return (
        hand.length === 2 &&
        !hand._fromSplit &&
        hand.some((card) => card.rank === "A") &&
        hand.some(isTenValue)
    );
}
function dealerHasBlackjack() {
    return isBlackjack(dealerHand);
}

// Betting helpers
function updateBankrollUI() {
    bankrollAmtEl.textContent = bankroll;
}

function getBetAmount() {
    const bet = Math.floor(Number(betInputEl.value));
    if (!Number.isFinite(bet) || bet <= 0) return 0;
    return bet;
}

function currentHand() {
    return playerHands ? playerHands[activeHandIndex] : playerHand;
}

// ----- Game state -----
let deck = [];
let playerHand = [];
let dealerHand = [];
let inRound = false;
let shoeNeedsShuffle = false;
let cutCardRemaining = 0; // when deck.length <= this, cut card is "reached"
let bankroll = 1000;
let currentBet = 0;
let playerHands = null;      // null when not split, otherwise [hand1, hand2]
let activeHandIndex = 0;
let bets = null;
let handOutcomes = null; // null when not split; otherwise like ["", ""] or [null, null]
let didDouble = false;
let didSplit = false;
let awaitingInsurance = false;
let insuranceBet = 0;
let strategyDecisions = [];
let activeStrategyDecisionId = null;
const reviewHands = [];
const archivedReviewRounds = new Set();

// ----- UI elements -----
const dealerCardsEl = document.getElementById("dealerCards");
const dealerTotalEl = document.getElementById("dealerTotal");
const playerHandsUIEl = document.getElementById("playerHandsUI");
const statusEl = document.getElementById("status");
const strategyLogEl = document.getElementById("strategyLog");
const statsRoundsEl = document.getElementById("statsRounds");
const statsHandsEl = document.getElementById("statsHands");
const statsCorrectEl = document.getElementById("statsCorrect");
const statsAccuracyEl = document.getElementById("statsAccuracy");
const statsActualEl = document.getElementById("statsActual");
const statsEvEl = document.getElementById("statsEv");
const statsWageredEl = document.getElementById("statsWagered");
const statsHintsEl = document.getElementById("statsHints");
const statsOutcomesEl = document.getElementById("statsOutcomes");
const statsInsuranceEl = document.getElementById("statsInsurance");
const statsHistoryEl = document.getElementById("statsHistory");
const statsNoteEl = document.getElementById("statsNote");
const sessionStatsTab = document.getElementById("sessionStatsTab");
const userStatsTab = document.getElementById("userStatsTab");
const gamePageEl = document.getElementById("gamePage");
const reviewPageEl = document.getElementById("reviewPage");
const reviewSummaryEl = document.getElementById("reviewSummary");
const reviewHandsEl = document.getElementById("reviewHands");
const openReviewBtn = document.getElementById("openReviewBtn");
const closeReviewBtn = document.getElementById("closeReviewBtn");

const newGameBtn = document.getElementById("newGameBtn");
const hitBtn = document.getElementById("hitBtn");
const standBtn = document.getElementById("standBtn");
const surrenderBtn = document.getElementById("surrenderBtn");
const deckCountSelect = document.getElementById("deckCountSelect");
const doubleBtn = document.getElementById("doubleBtn");
const splitBtn = document.getElementById("splitBtn");
const insuranceBtn = document.getElementById("insuranceBtn");
const noInsuranceBtn = document.getElementById("noInsuranceBtn");
const resetBankrollBtn = document.getElementById("resetBankrollBtn");

const BASIC_STRATEGY_EDGE_ESTIMATE = -0.005;
const sessionStats = {
    rounds: 0,
    hands: 0,
    decisions: 0,
    correctDecisions: 0,
    hints: 0,
    mainWagered: 0,
    actualNet: 0,
    insuranceOffered: 0,
    insuranceTaken: 0,
    outcomes: {
        win: 0,
        lose: 0,
        push: 0,
        blackjack: 0,
        surrender: 0
    },
    history: []
};
let activeStatsView = "session";
let statsSyncTimer = null;
let statsSyncPromise = Promise.resolve();

function suitCode(suit) {
    // match your suit symbols to filename letters
    if (suit === "♠") return "S";
    if (suit === "♥") return "H";
    if (suit === "♦") return "D";
    if (suit === "♣") return "C";
    return "";
}
function cardImageSrc(card) {
    return `images/cards/${card.rank}${suitCode(card.suit)}.svg`;
}
function setStatus(msg, result = null) {
    statusEl.textContent = msg;
    for (const type of ["win", "lose", "push", "mixed"]) {
        statusEl.classList.toggle(`result-${type}`, result === type);
    }
    statusEl.classList.toggle("round-result", Boolean(result));
}
function resultTypeForOutcome(outcome) {
    if (outcome === "win" || outcome === "blackjack") return "win";
    if (outcome === "push") return "push";
    return "lose";
}
function formatMoney(amount) {
    const sign = amount < 0 ? "-" : "";
    return `${sign}$${Math.abs(amount).toFixed(2).replace(/\.00$/, "")}`;
}
function netForOutcome(bet, outcome) {
    if (outcome === "push") return 0;
    if (outcome === "win") return bet;
    if (outcome === "blackjack") return bet + Math.floor(bet / 2);
    if (outcome === "surrender") return -bet + Math.floor(bet / 2);
    return -bet;
}
function addHistory(entry) {
    sessionStats.history.unshift(entry);
}
function recordOutcomeStats({ outcome, bet, label }) {
    const net = netForOutcome(bet, outcome);
    sessionStats.hands += 1;
    sessionStats.mainWagered += bet;
    sessionStats.actualNet += net;
    sessionStats.outcomes[outcome] = (sessionStats.outcomes[outcome] || 0) + 1;
    addHistory(`${label}: ${outcome.toUpperCase()} (${formatMoney(net)})`);
    updateStatsUI();
}
function renderStatsUI(stats, history, note) {
    const accuracy =
        stats.decisions > 0
            ? Math.round((stats.correctDecisions / stats.decisions) * 100)
            : 0;
    const evEstimate = stats.mainWagered * BASIC_STRATEGY_EDGE_ESTIMATE;
    const wins = stats.outcomes.win + stats.outcomes.blackjack;
    const losses = stats.outcomes.lose + stats.outcomes.surrender;

    statsNoteEl.textContent = note;
    statsRoundsEl.textContent = String(stats.rounds);
    statsHandsEl.textContent = String(stats.hands);
    statsCorrectEl.textContent = `${stats.correctDecisions} / ${stats.decisions}`;
    statsAccuracyEl.textContent = `${accuracy}%`;
    statsActualEl.textContent = formatMoney(stats.actualNet);
    statsEvEl.textContent = formatMoney(evEstimate);
    statsWageredEl.textContent = formatMoney(stats.mainWagered);
    statsHintsEl.textContent = String(stats.hints);
    statsOutcomesEl.textContent = `${wins} / ${losses} / ${stats.outcomes.push}`;
    statsInsuranceEl.textContent = `${stats.insuranceTaken} / ${stats.insuranceOffered} offers`;

    statsHistoryEl.innerHTML = "";
    if (history.length === 0) {
        const item = document.createElement("li");
        item.textContent = "No completed hands yet.";
        statsHistoryEl.appendChild(item);
        return;
    }

    for (const entry of history) {
        const item = document.createElement("li");
        item.textContent = entry;
        statsHistoryEl.appendChild(item);
    }
}

function sessionStatsPayload() {
    return {
        rounds: sessionStats.rounds,
        hands: sessionStats.hands,
        decisions: sessionStats.decisions,
        correctDecisions: sessionStats.correctDecisions,
        hints: sessionStats.hints,
        mainWageredCents: Math.round(sessionStats.mainWagered * 100),
        actualNetCents: Math.round(sessionStats.actualNet * 100),
        insuranceOffered: sessionStats.insuranceOffered,
        insuranceTaken: sessionStats.insuranceTaken,
        wins: sessionStats.outcomes.win,
        losses: sessionStats.outcomes.lose,
        pushes: sessionStats.outcomes.push,
        blackjacks: sessionStats.outcomes.blackjack,
        surrenders: sessionStats.outcomes.surrender
    };
}

function syncSessionStats() {
    const body = JSON.stringify({ sessionId, stats: sessionStatsPayload() });
    statsSyncPromise = statsSyncPromise.catch(() => {}).then(async () => {
        const API_BASE = window.API_BASE || "http://localhost:3001";
        const response = await fetch(`${API_BASE}/api/session-stats`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body
        });
        if (!response.ok && response.status !== 409) {
            console.error("Failed to sync session stats:", response.status);
        }
    });
    return statsSyncPromise;
}

function queueSessionStatsSync() {
    clearTimeout(statsSyncTimer);
    statsSyncTimer = setTimeout(syncSessionStats, 180);
}

function updateStatsUI() {
    queueSessionStatsSync();
    if (activeStatsView === "session") {
        statsCorrectEl.disabled = false;
        renderStatsUI(sessionStats, sessionStats.history, "This browser session");
    }
}

function emptyStats() {
    return {
        rounds: 0,
        hands: 0,
        decisions: 0,
        correctDecisions: 0,
        hints: 0,
        mainWagered: 0,
        actualNet: 0,
        insuranceOffered: 0,
        insuranceTaken: 0,
        outcomes: { win: 0, lose: 0, push: 0, blackjack: 0, surrender: 0 }
    };
}

async function showUserStats() {
    activeStatsView = "user";
    sessionStatsTab.setAttribute("aria-selected", "false");
    userStatsTab.setAttribute("aria-selected", "true");
    statsCorrectEl.disabled = true;
    statsNoteEl.textContent = "Loading your saved stats…";

    try {
        await syncSessionStats();
        const API_BASE = window.API_BASE || "http://localhost:3001";
        const response = await fetch(`${API_BASE}/api/users/me/stats`, { credentials: "include" });
        if (response.status === 401) {
            renderStatsUI(emptyStats(), [], "Log in to see stats across all your sessions.");
            return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load user stats");
        if (activeStatsView !== "user") return;

        const totals = data.stats;
        const userStats = {
            rounds: totals.rounds,
            hands: totals.hands,
            decisions: totals.decisions,
            correctDecisions: totals.correct_decisions,
            hints: totals.hints,
            mainWagered: totals.main_wagered_cents / 100,
            actualNet: totals.actual_net_cents / 100,
            insuranceOffered: totals.insurance_offered,
            insuranceTaken: totals.insurance_taken,
            outcomes: {
                win: totals.wins,
                lose: totals.losses,
                push: totals.pushes,
                blackjack: totals.blackjacks,
                surrender: totals.surrenders
            }
        };
        const history = data.history.map((hand) => {
            const label = `Round ${hand.round_index}, Hand ${hand.hand_index + 1}`;
            return `${label}: ${hand.outcome.toUpperCase()} (${formatMoney(hand.payout_cents / 100)})`;
        });
        const sessionLabel = totals.sessions === 1 ? "1 saved session" : `${totals.sessions} saved sessions`;
        renderStatsUI(userStats, history, `All-time totals across ${sessionLabel}`);
    } catch (err) {
        renderStatsUI(emptyStats(), [], err.message);
    }
}

function showSessionStats() {
    activeStatsView = "session";
    sessionStatsTab.setAttribute("aria-selected", "true");
    userStatsTab.setAttribute("aria-selected", "false");
    statsCorrectEl.disabled = false;
    renderStatsUI(sessionStats, sessionStats.history, "This browser session");
}

function clearSessionStats() {
    sessionStats.rounds = 0;
    sessionStats.hands = 0;
    sessionStats.decisions = 0;
    sessionStats.correctDecisions = 0;
    sessionStats.hints = 0;
    sessionStats.mainWagered = 0;
    sessionStats.actualNet = 0;
    sessionStats.insuranceOffered = 0;
    sessionStats.insuranceTaken = 0;
    sessionStats.outcomes = { win: 0, lose: 0, push: 0, blackjack: 0, surrender: 0 };
    sessionStats.history.length = 0;
    roundIndex = 0;
    updateStatsUI();
}

function decisionCardState() {
    const hand = currentHand() || [];
    return {
        cards: hand.map((card) => ({ rank: card.rank, suit: card.suit })),
        dealerUpcard: dealerHand[0]
            ? { rank: dealerHand[0].rank, suit: dealerHand[0].suit }
            : null,
        playerTotal: handValue(hand)
    };
}

function archiveRoundForReview(outcomes = {}) {
    if (archivedReviewRounds.has(roundIndex)) return;
    archivedReviewRounds.add(roundIndex);

    const decisionsByHand = new Map();
    for (const decision of strategyDecisions.filter((item) => item.action)) {
        const decisions = decisionsByHand.get(decision.handNumber) || [];
        decisions.push(decision);
        decisionsByHand.set(decision.handNumber, decisions);
    }

    for (const [handNumber, decisions] of decisionsByHand) {
        if (!decisions.some((decision) => decision.result === "incorrect")) continue;

        reviewHands.push({
            round: roundIndex,
            handNumber,
            outcome: outcomes[handNumber] || "complete",
            decisions: decisions.map((decision) => ({
                number: decision.number,
                action: decision.action,
                recommendation: decision.recommendation,
                result: decision.result,
                cards: decision.cards.map((card) => ({ ...card })),
                dealerUpcard: decision.dealerUpcard ? { ...decision.dealerUpcard } : null,
                playerTotal: decision.playerTotal
            }))
        });
    }
}

function appendReviewCards(container, label, cards) {
    const row = document.createElement("div");
    row.className = "review-card-row";

    const rowLabel = document.createElement("strong");
    rowLabel.textContent = label;
    row.appendChild(rowLabel);

    for (const card of cards) {
        const image = document.createElement("img");
        image.src = cardImageSrc(card);
        image.alt = cardToString(card);
        row.appendChild(image);
    }
    container.appendChild(row);
}

function renderReviewPage() {
    reviewHandsEl.innerHTML = "";
    reviewSummaryEl.textContent = reviewHands.length === 1
        ? "1 hand contains a strategy mistake."
        : `${reviewHands.length} hands contain strategy mistakes.`;

    if (reviewHands.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No incorrect decisions to review yet.";
        reviewHandsEl.appendChild(empty);
        return;
    }

    for (const hand of [...reviewHands].reverse()) {
        const article = document.createElement("article");
        article.className = "review-hand";

        const heading = document.createElement("h2");
        heading.textContent = `Round ${hand.round}, Hand ${hand.handNumber} - ${hand.outcome.toUpperCase()}`;
        article.appendChild(heading);

        for (const decision of hand.decisions) {
            const item = document.createElement("section");
            item.className = "review-decision";
            item.classList.toggle("incorrect", decision.result === "incorrect");

            const title = document.createElement("div");
            title.className = "review-decision-title";
            title.textContent = `Decision ${decision.number}: ${decision.result === "correct" ? "Correct" : "Incorrect"}`;
            item.appendChild(title);

            appendReviewCards(item, `Your hand (${decision.playerTotal})`, decision.cards);
            if (decision.dealerUpcard) appendReviewCards(item, "Dealer", [decision.dealerUpcard]);

            const moves = document.createElement("div");
            moves.className = "review-moves";
            moves.textContent = `You chose ${actionLabel(decision.action)}. Basic strategy: ${actionLabel(decision.recommendation)}.`;
            item.appendChild(moves);
            article.appendChild(item);
        }

        reviewHandsEl.appendChild(article);
    }
}

function showReviewPage() {
    renderReviewPage();
    gamePageEl.hidden = true;
    reviewPageEl.hidden = false;
    closeReviewBtn.focus();
}

function hideReviewPage() {
    reviewPageEl.hidden = true;
    gamePageEl.hidden = false;
    openReviewBtn.focus();
}
function renderHand(containerEl, hand, { hideSecondCard = false } = {}) {
    const existing = containerEl.querySelectorAll("img");

    // 1) If the hand got smaller (new round), clear and rebuild once
    if (existing.length > hand.length) {
        containerEl.innerHTML = "";
    }

    // 2) Ensure we have one <img> per card; append only NEW cards
    const existingCount = containerEl.querySelectorAll("img").length;
    for (let idx = existingCount; idx < hand.length; idx++) {
        const img = document.createElement("img");
        img.alt = "Card";

        // Only new cards should animate
        img.classList.add("dealt");
        img.style.animationDelay = `${(idx - existingCount) * 60}ms`;

        containerEl.appendChild(img);
    }

    // 3) Update src for each card image (no re-creation, so no flashing)
    const imgs = containerEl.querySelectorAll("img");
    hand.forEach((card, idx) => {
        const hidden = hideSecondCard && idx === 1;
        imgs[idx].src = hidden ? "images/cards/RED_BACK.svg" : cardImageSrc(card);
        imgs[idx].alt = hidden ? "Hidden card" : `${card.rank}${card.suit}`;
    });
}
function makeHandPanel(index, hand, bet, isActive) {
    const panel = document.createElement("div");
    panel.className = "hand-panel";
    panel.classList.toggle("active", isActive);
    panel.classList.toggle("inactive", playerHands && !isActive);

    const header = document.createElement("div");
    header.className = "hand-header";

    const title = document.createElement("span");
    title.textContent = `Hand ${index + 1}`;

    const wager = document.createElement("span");
    wager.className = "hand-bet";
    wager.textContent = bet > 0 ? `Bet: $${bet}` : "";

    const cards = document.createElement("div");
    cards.className = "cards hand";

    const total = document.createElement("div");
    const suffix = hand._splitAcesLocked ? " (split ace)" : "";
    total.textContent = `Total: ${handValue(hand)}${suffix}`;

    header.append(title, wager);
    panel.append(header, cards, total);
    panel._handRef = hand;
    panel._titleEl = title;
    panel._wagerEl = wager;
    panel._cardsEl = cards;
    panel._totalEl = total;
    renderHand(cards, hand);

    return panel;
}

let renderedHandPanels = [];

function updateHandPanel(panel, index, hand, bet, isActive) {
    panel.classList.toggle("active", isActive);
    panel.classList.toggle("inactive", playerHands && !isActive);
    panel._titleEl.textContent = `Hand ${index + 1}`;
    panel._wagerEl.textContent = bet > 0 ? `Bet: $${bet}` : "";
    const suffix = hand._splitAcesLocked ? " (split ace)" : "";
    panel._totalEl.textContent = `Total: ${handValue(hand)}${suffix}`;
    renderHand(panel._cardsEl, hand);
}

function renderPlayerHandsUI() {
    const hands = playerHands ? playerHands : [playerHand];
    for (let count = 1; count <= MAX_HANDS; count++) {
        playerHandsUIEl.classList.toggle(`hand-count-${count}`, hands.length === count);
    }
    const needsRebuild =
        renderedHandPanels.length !== hands.length ||
        renderedHandPanels.some((panel, index) => panel._handRef !== hands[index]);

    if (needsRebuild) {
        playerHandsUIEl.innerHTML = "";
        renderedHandPanels = hands.map((hand, index) => {
            const isActive = playerHands ? index === activeHandIndex : true;
            const bet = playerHands ? bets[index] : currentBet;
            const panel = makeHandPanel(index, hand, bet, isActive);
            playerHandsUIEl.appendChild(panel);
            return panel;
        });
        return;
    }

    hands.forEach((hand, index) => {
        const isActive = playerHands ? index === activeHandIndex : true;
        const bet = playerHands ? bets[index] : currentBet;
        updateHandPanel(renderedHandPanels[index], index, hand, bet, isActive);
    });
}
function render({ hideDealerHoleCard = false } = {}) {
    // The dealer's hole card must never be exposed while a round is active.
    // Callers may request concealment outside a round, but cannot override this invariant.
    const concealDealerHoleCard = inRound || hideDealerHoleCard;

    // dealer
    renderHand(dealerCardsEl, dealerHand, { hideSecondCard: concealDealerHoleCard });

    // player UI
    renderPlayerHandsUI();

    // dealer totals
    if (concealDealerHoleCard) {
        dealerTotalEl.textContent = dealerHand[0]
            ? `Total: ${handValue([dealerHand[0]])} (+ hidden)`
            : "Total: 0";
    } else {
        dealerTotalEl.textContent = `Total: ${handValue(dealerHand)}`;
    }

    // buttons
    const hand = currentHand();
    const handBet = playerHands ? bets[activeHandIndex] : currentBet;

    const handFinished =
        (hand && hand._done) ||
        (playerHands && handOutcomes && handOutcomes[activeHandIndex] === "surrender");

    const actionBlocked = !inRound || awaitingInsurance || handFinished || hand._splitAcesLocked;
    const insuranceWager = insuranceAmount();

    newGameBtn.disabled = inRound;
    newGameBtn.textContent = inRound ? "Round Active" : "Deal";
    hitBtn.disabled = actionBlocked;
    standBtn.disabled = actionBlocked;

    // Late surrender: initial two-card hand only, before split or any other player action.
    surrenderBtn.disabled = actionBlocked || !!playerHands || hand.length !== 2;

    // double: first decision only + must afford to match current hand bet
    doubleBtn.disabled = actionBlocked || hand.length !== 2 || bankroll < handBet;

    const canSplit =
        !actionBlocked &&
        hand.length === 2 &&
        cardValueForSplit(hand[0]) === cardValueForSplit(hand[1]) &&
        bankroll >= handBet &&
        (!playerHands || playerHands.length < MAX_HANDS);

    splitBtn.disabled = !canSplit;
    insuranceBtn.textContent = insuranceWager > 0 ? `Insurance $${insuranceWager}` : "Insurance";
    insuranceBtn.disabled = !awaitingInsurance || insuranceWager <= 0 || bankroll < insuranceWager;
    noInsuranceBtn.disabled = !awaitingInsurance;
    deckCountSelect.disabled = inRound;
    resetBankrollBtn.disabled = inRound;
}

function dealerUpValue() {
    if (!dealerHand[0]) return 0;
    if (dealerHand[0].rank === "A") return 11;
    if (isTenValue(dealerHand[0])) return 10;
    return Number(dealerHand[0].rank);
}

function actionLabel(action) {
    return {
        hit: "Hit",
        stand: "Stand",
        double: "Double",
        split: "Split",
        surrender: "Surrender",
        insurance: "Insurance",
        noInsurance: "No Insurance"
    }[action] || action;
}

function pairStrategy(hand, upcard, canSplit) {
    if (!canSplit || hand.length !== 2 || cardValueForSplit(hand[0]) !== cardValueForSplit(hand[1])) {
        return null;
    }

    const pairValue = cardValueForSplit(hand[0]);

    if (pairValue === 11 || pairValue === 8) return "split";
    if (pairValue === 10 || pairValue === 5) return null;
    if (pairValue === 9) return [2, 3, 4, 5, 6, 8, 9].includes(upcard) ? "split" : "stand";
    if (pairValue === 7) return upcard >= 2 && upcard <= 7 ? "split" : "hit";
    if (pairValue === 6) return upcard >= 2 && upcard <= 6 ? "split" : "hit";
    if (pairValue === 4) return upcard === 5 || upcard === 6 ? "split" : "hit";
    if (pairValue === 2 || pairValue === 3) return upcard >= 2 && upcard <= 7 ? "split" : "hit";

    return null;
}

function hardStrategy(total, upcard, canDouble, canSurrender) {
    if (canSurrender && total === 16 && upcard >= 9) return "surrender";
    if (canSurrender && total === 15 && upcard === 10) return "surrender";

    if (total >= 17) return "stand";
    if (total >= 13 && total <= 16) return upcard >= 2 && upcard <= 6 ? "stand" : "hit";
    if (total === 12) return upcard >= 4 && upcard <= 6 ? "stand" : "hit";
    if (total === 11) return canDouble && upcard !== 11 ? "double" : "hit";
    if (total === 10) return canDouble && upcard >= 2 && upcard <= 9 ? "double" : "hit";
    if (total === 9) return canDouble && upcard >= 3 && upcard <= 6 ? "double" : "hit";
    return "hit";
}

function softStrategy(hand, upcard, canDouble) {
    const total = handValue(hand);

    if (total >= 19) return "stand";

    if (total === 18) {
        if (canDouble && upcard >= 3 && upcard <= 6) return "double";
        if ([2, 7, 8].includes(upcard)) return "stand";
        return "hit";
    }

    if (total === 17) return canDouble && upcard >= 3 && upcard <= 6 ? "double" : "hit";
    if (total === 15 || total === 16) return canDouble && upcard >= 4 && upcard <= 6 ? "double" : "hit";
    if (total === 13 || total === 14) return canDouble && upcard >= 5 && upcard <= 6 ? "double" : "hit";

    return "hit";
}

function recommendedAction() {
    if (!inRound) return null;
    if (awaitingInsurance) return "noInsurance";

    const hand = currentHand();
    if (!hand || hand._done || hand._splitAcesLocked) return null;

    const handBet = playerHands ? bets[activeHandIndex] : currentBet;
    const upcard = dealerUpValue();
    const canDouble = hand.length === 2 && bankroll >= handBet;
    const canSurrender = !playerHands && hand.length === 2;
    const canSplit =
        hand.length === 2 &&
        bankroll >= handBet &&
        (!playerHands || playerHands.length < MAX_HANDS);

    const pairMove = pairStrategy(hand, upcard, canSplit);
    if (pairMove) return pairMove;

    if (isSoftHand(hand)) return softStrategy(hand, upcard, canDouble);
    return hardStrategy(handValue(hand), upcard, canDouble, canSurrender);
}

function renderStrategyLog() {
    strategyLogEl.innerHTML = "";

    if (strategyDecisions.length === 0) {
        const empty = document.createElement("div");
        empty.className = "strategy-feedback";
        empty.innerHTML = "<strong>Strategy coach</strong><div class=\"strategy-detail\">Make a decision to see feedback.</div>";
        strategyLogEl.appendChild(empty);
        return;
    }

    for (const decision of strategyDecisions) {
        const box = document.createElement("div");
        box.className = "strategy-feedback";
        box.classList.toggle("correct", decision.result === "correct");
        box.classList.toggle("incorrect", decision.result === "incorrect");

        const title = document.createElement("div");
        title.className = "strategy-title";

        const label = document.createElement("span");
        label.textContent = `Decision ${decision.number}`;

        const hand = document.createElement("span");
        hand.textContent = `Hand ${decision.handNumber}`;

        title.append(label, hand);
        box.appendChild(title);

        if (!decision.action) {
            const prompt = document.createElement("div");
            prompt.className = "strategy-detail";
            prompt.textContent = "Make your move, or reveal the basic strategy suggestion.";
            box.appendChild(prompt);
        } else {
            const result = document.createElement("div");
            result.className = "strategy-result";
            result.textContent = decision.result === "correct" ? "Correct move" : "Review this move";
            box.appendChild(result);

            const yourMove = document.createElement("div");
            yourMove.className = "strategy-detail";
            yourMove.textContent = `You chose: ${actionLabel(decision.action)}`;
            box.appendChild(yourMove);

            const suggested = document.createElement("div");
            suggested.className = "strategy-detail";
            suggested.textContent = `Basic strategy: ${actionLabel(decision.recommendation)}`;
            box.appendChild(suggested);
        }

        if (decision.revealed && !decision.action) {
            const hint = document.createElement("div");
            hint.className = "strategy-hint";
            hint.textContent = `Suggested move: ${actionLabel(decision.recommendation)}`;
            box.appendChild(hint);
        }

        if (!decision.action && !decision.revealed) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Reveal Suggestion";
            button.addEventListener("click", () => revealStrategySuggestion(decision.id));
            box.appendChild(button);
        }

        strategyLogEl.appendChild(box);
    }
}

function clearStrategyLog() {
    strategyDecisions = [];
    activeStrategyDecisionId = null;
    renderStrategyLog();
}

function activeStrategyDecision() {
    return strategyDecisions.find((decision) => decision.id === activeStrategyDecisionId) || null;
}

function showDecisionPrompt() {
    if (!recommendedAction()) {
        renderStrategyLog();
        return;
    }

    const existing = activeStrategyDecision();
    if (existing && !existing.action) {
        renderStrategyLog();
        return;
    }

    const decisionNumber = strategyDecisions.length + 1;
    const handNumber = playerHands ? activeHandIndex + 1 : 1;
    activeStrategyDecisionId = crypto.randomUUID();
    strategyDecisions.push({
        id: activeStrategyDecisionId,
        number: decisionNumber,
        handNumber,
        recommendation: recommendedAction(),
        action: null,
        result: null,
        revealed: false,
        ...decisionCardState()
    });
    renderStrategyLog();
}

function revealStrategySuggestion(decisionId = activeStrategyDecisionId) {
    const decision = strategyDecisions.find((item) => item.id === decisionId);
    const recommendation = decision ? decision.recommendation : recommendedAction();
    if (!recommendation) {
        renderStrategyLog();
        return;
    }

    if (decision) {
        decision.revealed = true;
        sessionStats.hints += 1;
        updateStatsUI();
    }
    renderStrategyLog();
}

function evaluateDecision(action) {
    const decision = activeStrategyDecision();
    const recommendation = decision ? decision.recommendation : recommendedAction();
    if (!recommendation) return;

    const target = decision || {
        id: crypto.randomUUID(),
        recommendation,
        action: null,
        result: null,
        revealed: false,
        number: strategyDecisions.length + 1,
        handNumber: playerHands ? activeHandIndex + 1 : 1,
        ...decisionCardState()
    };

    if (!decision) {
        strategyDecisions.push(target);
        activeStrategyDecisionId = target.id;
    }

    target.action = action;
    sessionStats.decisions += 1;
    if (action === recommendation) {
        target.result = "correct";
        sessionStats.correctDecisions += 1;
    } else {
        target.result = "incorrect";
    }

    activeStrategyDecisionId = null;
    renderStrategyLog();
    updateStatsUI();
}

// helper functions to send hand data to postgres
async function recordHandToDb({ outcome, hand = playerHand, handIndex = 0, bet = currentBet }) {
    try {
        const betCents = Math.round(bet * 100);

        const payload = {
            sessionId,
            roundIndex,
            handIndex,

            betCents,
            outcome,
            payoutCents: calcPayoutCents(outcome, betCents),

            playerCards: hand.map(cardToString),
            dealerCards: dealerHand.map(cardToString),
            dealerUpcard: dealerHand[0] ? cardToString(dealerHand[0]) : null,

            didSplit: !!didSplit,
            didDouble: !!hand._doubled,
            didSurrender: outcome === "surrender"
        };

        const API_BASE = window.API_BASE || "http://localhost:3001";

        window.__BJ_DB_PENDING__ ||= [];

        // ✅ create the promise first
        const p = fetch(`${API_BASE}/api/hands`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).then(async (res) => {
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error("Failed to record hand:", res.status, text);
            }
            return res;
        });

        // ✅ track it
        window.__BJ_DB_PENDING__.push(p);

        // ✅ cleanup
        p.finally(() => {
            const i = window.__BJ_DB_PENDING__.indexOf(p);
            if (i >= 0) window.__BJ_DB_PENDING__.splice(i, 1);
        });

        // ✅ await it so single-hand runs still behave
        await p;
    } catch (err) {
        console.error("Failed to record hand:", err);
    }
}

let roundIndex = 0; // increment each new round

function calcPayoutCents(outcome, bet) {
    // This should match your bankroll logic, but expressed as net payout for the DB.
    // Convention (recommended):
    //  - win: +bet
    //  - lose: -bet
    //  - push: 0
    //  - blackjack: +1.5*bet
    //  - surrender: -0.5*bet
    if (bet <= 0) return 0;

    if (outcome === "push") return 0;
    if (outcome === "win") return bet;
    if (outcome === "blackjack") return bet + Math.floor(bet / 2);
    if (outcome === "surrender") return -Math.floor(bet / 2);
    return -bet; // lose default
}

//

function insuranceAmount() {
    return Math.floor(currentBet / 2);
}

function resolveOpeningDeal({ takeInsurance = false } = {}) {
    let insuranceMessage = "";

    if (awaitingInsurance && takeInsurance) {
        const wager = insuranceAmount();
        if (wager <= 0 || bankroll < wager) {
            setStatus("Not enough bankroll for insurance.");
            return true;
        }

        insuranceBet = wager;
        bankroll -= insuranceBet;
        sessionStats.insuranceTaken += 1;
        sessionStats.actualNet -= insuranceBet;
        updateStatsUI();
        updateBankrollUI();
        insuranceMessage = ` Insurance bet: $${insuranceBet}.`;
    }

    awaitingInsurance = false;

    if (dealerHasBlackjack()) {
        if (insuranceBet > 0) {
            bankroll += insuranceBet * 3;
            sessionStats.actualNet += insuranceBet * 3;
            addHistory(`Insurance: WIN (${formatMoney(insuranceBet * 2)})`);
            updateStatsUI();
            updateBankrollUI();
            insuranceMessage += " Insurance wins.";
        }

        if (isBlackjack(playerHand)) {
            endRound(`Push: both have Blackjack.${insuranceMessage}`, "push");
        } else {
            endRound(`Dealer wins: Blackjack.${insuranceMessage}`, "lose");
        }
        return true;
    }

    if (insuranceBet > 0) {
        insuranceMessage += " Insurance loses.";
        addHistory(`Insurance: LOSE (${formatMoney(-insuranceBet)})`);
        updateStatsUI();
        updateBankrollUI();
    }

    if (isBlackjack(playerHand)) {
        endRound(`You win: Blackjack!${insuranceMessage}`, "blackjack");
        return true;
    }

    render({ hideDealerHoleCard: true });
    setStatus(`${insuranceMessage} Your turn: Hit or Stand.`);
    showDecisionPrompt();
    return false;
}

function endRound(message, outcome = "lose") {
    inRound = false;
    const endingBet = currentBet;
    // record hand to DB
    recordHandToDb({ outcome, hand: playerHand, handIndex: 0, bet: endingBet });
    // Payout rules:
    // - lose: you already paid the bet, nothing returned
    // - push: return bet
    // - win: return bet + winnings (1:1)
    // - blackjack: return bet + winnings (3:2)
    // - surrender: return half the bet (rounded down)
    if (endingBet > 0) {
        if (outcome === "push") {
            bankroll += endingBet;
        } else if (outcome === "win") {
            bankroll += endingBet * 2;
        } else if (outcome === "blackjack") {
            bankroll += endingBet * 2 + Math.floor(endingBet / 2);
        } else if (outcome === "surrender") {
            bankroll += Math.floor(endingBet / 2);
        }
        recordOutcomeStats({ outcome, bet: endingBet, label: "Hand 1" });
    }

    currentBet = 0;
    updateBankrollUI();

    betInputEl.disabled = false;

    render({ hideDealerHoleCard: false });
    setStatus(message, resultTypeForOutcome(outcome));
    activeStrategyDecisionId = null;
    renderStrategyLog();
    archiveRoundForReview({ 1: outcome });
}

function checkImmediateOutcomes() {
    const dealerUpcard = dealerHand[0];

    if (dealerUpcard && dealerUpcard.rank === "A") {
        awaitingInsurance = true;
        sessionStats.insuranceOffered += 1;
        updateStatsUI();
        render({ hideDealerHoleCard: true });
        setStatus("Dealer shows Ace. Choose Insurance or No Insurance.");
        showDecisionPrompt();
        return true;
    }

    if (dealerUpcard && isTenValue(dealerUpcard)) {
        return resolveOpeningDeal({ takeInsurance: false });
    }

    if (isBlackjack(playerHand)) {
        endRound("You win: Blackjack!", "blackjack");
        return true;
    }

    showDecisionPrompt();
    return false;
}
function drawCard(hand) {
    const card = deck.pop();
    if (!card) {
        setStatus("No cards left in shoe. Reshuffle needed.");
        return null;
    }

    hand.push(card);

    // If we've reached the cut card, reshuffle AFTER this hand finishes
    if (!shoeNeedsShuffle && deck.length <= cutCardRemaining) {
        shoeNeedsShuffle = true;
    }

    return card;
}
// ----- Actions -----
function startNewGame() {
    if (inRound) {
        setStatus("Finish the current round before starting a new one.");
        return;
    }

    // ✅ If previous round was a split, clear it only when starting a new round
    if (playerHands) {
        playerHands = null;
        bets = null;
        handOutcomes = null;
        activeHandIndex = 0;
    }

    // also clear any per-hand flags from non-split hands
    if (playerHand) {
        delete playerHand._done;
        delete playerHand._result;
    }
    // Get and validate bet before deailing
    const bet = getBetAmount();

    if (bet <= 0) {
        setStatus("Enter a valid bet.");
        return;
    }
    if (bet > bankroll) {
        setStatus("Not enough bankroll for that bet.");
        return;
    }

    roundIndex += 1;
    sessionStats.rounds += 1;
    updateStatsUI();

    // Take the bet "onto the table"
    currentBet = bet;
    bankroll -= currentBet;
    updateBankrollUI();
    didDouble = false;
    didSplit = false;
    awaitingInsurance = false;
    insuranceBet = 0;
    clearStrategyLog();

    // prevent changing bet mid-hand
    betInputEl.disabled = true;

    const deckCount = Number(deckCountSelect.value);

    // If first game, or shoe is low and we've flagged reshuffle -> rebuild shoe
    if (deck.length === 0 || shoeNeedsShuffle) {
        buildAndShuffleShoe(deckCount);
    }

    playerHand = [];
    dealerHand = [];
    inRound = true;

    drawCard(playerHand);
    drawCard(dealerHand);
    drawCard(playerHand);
    drawCard(dealerHand);

    render({ hideDealerHoleCard: true });
    setStatus(`Bet placed: $${currentBet}. Your turn: Hit or Stand.`);

    if (!checkImmediateOutcomes()) {
        showDecisionPrompt();
    }
}

function hit() {
    if (!inRound) return;
    if (awaitingInsurance) return;

    const hand = currentHand();

    // If this hand is already finished, ignore input
    if (hand && (hand._done || hand._splitAcesLocked)) return;
    evaluateDecision("hit");

    drawCard(hand);
    render({ hideDealerHoleCard: true });

    const p = handValue(hand);

    if (p > 21) {
        //
        if (!playerHands) {
            endRound("You bust. Dealer wins.", "lose");
            return;
        }

        // ✅ Split: bust ends only this hand, then move on
        hand._done = true;
        hand._result = "bust";
        setStatus(`Hand ${activeHandIndex + 1} busts.`);
        advanceHandOrResolve();
        return;
    }

    if (p === 21) {
        stand({ auto: true });
        return;
    }

    setStatus(`Playing Hand ${playerHands ? activeHandIndex + 1 : 1}. Hit or Stand?`);
    showDecisionPrompt();
}


function dealerPlay() {
    while (
        handValue(dealerHand) < 17 ||
        (DEALER_HITS_SOFT_17 && handValue(dealerHand) === 17 && isSoftHand(dealerHand))
    ) {
        drawCard(dealerHand);
    }
}

function stand({ auto = false } = {}) {
    if (!inRound) return;
    if (awaitingInsurance) return;

    const hand = currentHand();
    if (!auto) evaluateDecision("stand");

    // If split, standing ends ONLY the current hand
    if (playerHands) {
        hand._done = true;
        hand._result = "stand";

        setStatus(`Standing on Hand ${activeHandIndex + 1}.`);
        advanceHandOrResolve();
        return;
    }

    // Not split = your original logic
    dealerPlay();

    const p = handValue(playerHand);
    const d = handValue(dealerHand);

    if (d > 21) {
        endRound("Dealer busts. You win!", "win");
        return;
    }

    if (p > d) endRound(`You win! ${p} vs ${d}.`, "win");
    else if (p < d) endRound(`Dealer wins. ${d} vs ${p}.`, "lose");
    else endRound(`Push (tie). ${p} vs ${d}.`, "push");
}


function double() {
    if (!inRound) return;
    if (awaitingInsurance) return;

    const hand = currentHand();

    if (hand._splitAcesLocked) {
        setStatus("Split aces receive one card only.");
        return;
    }

    if (hand.length !== 2) {
        setStatus("Double is only allowed before hitting.");
        return;
    }
    evaluateDecision("double");

    const i = activeHandIndex;
    const betToDouble = playerHands ? bets[i] : currentBet;

    if (bankroll < betToDouble) {
        setStatus("Not enough bankroll to double.");
        return;
    }

    bankroll -= betToDouble;
    didDouble = true;
    hand._doubled = true;
    if (playerHands) {
        bets[i] *= 2;
    } else {
        currentBet *= 2;
    }

    updateBankrollUI();

    // One card only
    drawCard(hand);
    render({ hideDealerHoleCard: true });

    // Hand is finished after doubling
    if (playerHands) {
        hand._done = true;
        hand._result = "double";

        const p = handValue(hand);
        if (p > 21) {
            hand._result = "bust";
            setStatus(`Hand ${i + 1} busts after doubling.`);
        } else {
            setStatus(`Doubled on Hand ${i + 1}.`);
        }

        advanceHandOrResolve();
    } else {
        const p = handValue(hand);
        if (p > 21) {
            endRound("You busted after doubling. Dealer wins.", "lose");
            return;
        }
        stand({ auto: true });
    }
}


function split() {
    if (!inRound) return;
    if (awaitingInsurance) return;

    const hand = currentHand();
    const i = activeHandIndex;
    const handBet = playerHands ? bets[i] : currentBet;

    if (hand.length !== 2) {
        setStatus("Split is only allowed with two cards.");
        return;
    }

    if (playerHands && playerHands.length >= MAX_HANDS) {
        setStatus(`You can split to a maximum of ${MAX_HANDS} hands.`);
        return;
    }

    const v0 = cardValueForSplit(hand[0]);
    const v1 = cardValueForSplit(hand[1]);

    if (v0 !== v1) {
        setStatus("Split is only allowed with matching value (e.g., Q+K, 10+J) or a pair.");
        return;
    }

    // Need enough bankroll to place the additional bet (same as currentBet)
    if (bankroll < handBet) {
        setStatus("Not enough bankroll to split.");
        return;
    }
    evaluateDecision("split");

    // Take the extra bet (DO NOT double currentBet)
    bankroll -= handBet;
    updateBankrollUI();
    didSplit = true;
    const splitAces = hand[0].rank === "A" && hand[1].rank === "A";

    const secondCard = hand.pop();
    const secondHand = [secondCard];
    hand._fromSplit = true;
    secondHand._fromSplit = true;

    if (!playerHands) {
        playerHands = [hand];
        bets = [currentBet];
        handOutcomes = [null];
        activeHandIndex = 0;
    }

    playerHands.splice(i + 1, 0, secondHand);
    bets.splice(i + 1, 0, handBet);
    handOutcomes.splice(i + 1, 0, null);

    // Deal one card to each hand (common rule)
    drawCard(hand);
    drawCard(secondHand);

    if (splitAces) {
        hand._splitAcesLocked = true;
        secondHand._splitAcesLocked = true;
        hand._done = true;
        secondHand._done = true;
    }

    // Keep compatibility with your hit/stand which uses playerHand
    playerHand = playerHands[activeHandIndex];

    render({ hideDealerHoleCard: true });
    if (splitAces) {
        setStatus("Split aces receive one card each.");
        advanceHandOrResolve();
    } else {
        setStatus(`Split! Playing Hand ${activeHandIndex + 1}. Hit or Stand?`);
    }
}

function advanceHandOrResolve() {
    if (!playerHands || playerHands.length === 0) return;

    // Find next hand that is not done AND not surrendered
    let nextIndex = -1;
    for (let i = 0; i < playerHands.length; i++) {
        if (i <= activeHandIndex) continue;

        const handDone = !!playerHands[i]._done;
        const surrendered = handOutcomes && handOutcomes[i] === "surrender";

        if (!handDone && !surrendered) {
            nextIndex = i;
            break;
        }
    }

    // Move to next playable hand if any
    if (nextIndex !== -1) {
        activeHandIndex = nextIndex;
        playerHand = playerHands[activeHandIndex]; // compat

        render({ hideDealerHoleCard: true });
        setStatus(`Playing Hand ${activeHandIndex + 1}. Hit or Stand?`);
        showDecisionPrompt();
        return;
    }

    // Otherwise all hands are finished -> dealer plays once and settle. The
    // settlement function ends the round before rendering the revealed hand.
    dealerPlay();
    settleSplitHands();

    // NOTE: settleSplitHands() calls endRound(), which sets inRound = false
}




function payoutForOutcome(bet, outcome) {
    // returns how much money is RETURNED to bankroll (not net profit)
    if (outcome === "push") return bet;
    if (outcome === "win") return bet * 2;
    if (outcome === "blackjack") return bet * 2 + Math.floor(bet / 2);
    if (outcome === "surrender") return Math.floor(bet / 2);
    return 0; // lose
}

function settleSplitHands() {
    const d = handValue(dealerHand);
    let summary = [];
    const reviewOutcomes = {};

    for (let i = 0; i < playerHands.length; i++) {
        // If this hand surrendered, skip outcome calc (half already refunded in surrender())
        if (handOutcomes && handOutcomes[i] === "surrender") {
            reviewOutcomes[i + 1] = "surrender";
            summary.push(`Hand ${i + 1}: SURRENDER`);
            continue;
        }

        const hand = playerHands[i];
        const p = handValue(hand);
        const bet = bets[i];

        let outcome;
        if (p > 21) outcome = "lose";
        else if (d > 21) outcome = "win";
        else if (p > d) outcome = "win";
        else if (p < d) outcome = "lose";
        else outcome = "push";
        reviewOutcomes[i + 1] = outcome;

        bankroll += payoutForOutcome(bet, outcome);
        recordOutcomeStats({ outcome, bet, label: `Hand ${i + 1}` });
        summary.push(`Hand ${i + 1}: ${outcome.toUpperCase()} (${p} vs ${d})`);
        recordHandToDb({ outcome, hand, handIndex: i, bet });

        // mark done for UI/buttons
        hand._done = true;
        hand._result = outcome;
    }

    updateBankrollUI();

    // ✅ End the round BUT keep playerHands/bets on screen
    inRound = false;
    currentBet = 0;          // prevent single-hand payout paths
    betInputEl.disabled = false;

    render({ hideDealerHoleCard: false });
    const outcomes = Object.values(reviewOutcomes);
    let resultType = "mixed";
    if (outcomes.every((outcome) => outcome === "win" || outcome === "blackjack")) {
        resultType = "win";
    } else if (outcomes.every((outcome) => outcome === "lose" || outcome === "surrender")) {
        resultType = "lose";
    } else if (outcomes.every((outcome) => outcome === "push")) {
        resultType = "push";
    }
    const splitAcesNote = playerHands.every((hand) => hand._splitAcesLocked)
        ? "Split aces receive one card each and stand automatically. "
        : "";
    setStatus(`${splitAcesNote}${summary.join(" | ")}`, resultType);
    archiveRoundForReview(reviewOutcomes);
}


function surrender() {
    if (!inRound) return;
    if (awaitingInsurance) return;

    const hand = currentHand();

    if (hand.length !== 2) {
        setStatus("Surrender is only allowed on your first two cards.");
        return;
    }

    if (playerHands) {
        setStatus("Surrender is not available after splitting.");
        return;
    }

    // Non-split: your existing payout logic
    if (!playerHands) {
        evaluateDecision("surrender");
        endRound("You surrendered. Half your bet is returned.", "surrender");
        return;
    }
}

function takeInsurance() {
    if (!awaitingInsurance) return;
    evaluateDecision("insurance");
    resolveOpeningDeal({ takeInsurance: true });
}

function declineInsurance() {
    if (!awaitingInsurance) return;
    evaluateDecision("noInsurance");
    resolveOpeningDeal({ takeInsurance: false });
}

// ----- Wire up buttons -----
newGameBtn.addEventListener("click", startNewGame);
hitBtn.addEventListener("click", hit);
standBtn.addEventListener("click", stand);
surrenderBtn.addEventListener("click", surrender);
doubleBtn.addEventListener("click", double);
splitBtn.addEventListener("click", split);
insuranceBtn.addEventListener("click", takeInsurance);
noInsuranceBtn.addEventListener("click", declineInsurance);
resetBankrollBtn.addEventListener("click", () => {
    if (inRound) return;
    bankroll = 1000;
    updateBankrollUI();
    setStatus("Bankroll reset to $1,000. Ready to deal.");
});
sessionStatsTab.addEventListener("click", showSessionStats);
userStatsTab.addEventListener("click", showUserStats);
deckCountSelect.addEventListener("change", () => {
    if (inRound) return;
    shoeNeedsShuffle = true;
    setStatus(`${deckCountSelect.value}-deck shoe selected. A fresh shoe will be shuffled on the next deal.`);
});
openReviewBtn.addEventListener("click", showReviewPage);
closeReviewBtn.addEventListener("click", hideReviewPage);

// Initial render
updateBankrollUI();
render({ hideDealerHoleCard: false });
renderStrategyLog();
updateStatsUI();

// starting a session
async function startSession() {
  try {
    const API_BASE = window.API_BASE || "http://localhost:3001";

    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, userAgent: navigator.userAgent })
    });
    if (response.ok) await syncSessionStats();
  } catch (e) {
    console.error("Failed to start session:", e);
  }
}

startSession();
window.startFreshBlackjackSession = function () {
  sessionId = crypto.randomUUID();
  window.BLACKJACK_SESSION_ID = sessionId;
  clearSessionStats();
  return startSession();
};
window.isBlackjackRoundActive = () => inRound;
window.addEventListener?.("blackjack-auth-change", (event) => {
  if (event.detail?.user && activeStatsView === "user") showUserStats();
  if (!event.detail?.user && activeStatsView === "user") showUserStats();
});
// playing cards thanks to
/* Vectorized Playing Cards 1.3- http://code.google.com/p/vectorized-playing-cards/
Copyright 2011 - Chris Aguilar
Licensed under LGPL 3 - www.gnu.org/copyleft/lesser.html */

/* API TESTING only - DO NOT USE IN PRODUCTION */
(function () {
    const isLocal =
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1" ||
        location.protocol === "file:";

    if (!isLocal) return;

    window.__BJ_FAST__ = false;

    window.__BJ_TEST__ = {
        fastMode(on = true) {
            window.__BJ_FAST__ = !!on;
        },
        flushDb: async () => {
            const pending = window.__BJ_DB_PENDING__ || [];
            await Promise.allSettled([...pending]);
        },

        start(bet = 1) {
            betInputEl.value = String(bet);
            startNewGame();
        },

        hit() {
            hit();
        },

        stand() {
            stand();
        },

        setBankroll(amount) {
            bankroll = Math.max(0, Math.floor(Number(amount) || 0));
            updateBankrollUI();
            render({ hideDealerHoleCard: !inRound });
        },

        buttons() {
            return {
                deal: !newGameBtn.disabled,
                hit: !hitBtn.disabled,
                stand: !standBtn.disabled,
                surrender: !surrenderBtn.disabled,
                double: !doubleBtn.disabled,
                split: !splitBtn.disabled,
                insurance: !insuranceBtn.disabled,
                noInsurance: !noInsuranceBtn.disabled
            };
        },


        done() {
            return inRound === false;
        },

        stats() {
            return {
                rounds: sessionStats.rounds,
                hands: sessionStats.hands,
                decisions: sessionStats.decisions,
                correctDecisions: sessionStats.correctDecisions,
                hints: sessionStats.hints,
                mainWagered: sessionStats.mainWagered,
                actualNet: sessionStats.actualNet,
                insuranceOffered: sessionStats.insuranceOffered,
                insuranceTaken: sessionStats.insuranceTaken,
                outcomes: { ...sessionStats.outcomes }
            };
        },

        // get current game state
        state() {
            const hands = playerHands ? playerHands : [playerHand];
            return {
                inRound,
                roundIndex,
                bankroll,
                currentBet,
                activeHandIndex,
                awaitingInsurance,
                status: statusEl.textContent,
                handCount: hands.length,
                playerTotals: hands.map(handValue),
                dealerTotal: handValue(dealerHand),
                maxHands: MAX_HANDS
            };
        }
    };
})();
