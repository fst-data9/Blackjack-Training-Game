// ----- Card / Deck helpers -----pushchange
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const bankrollAmtEl = document.getElementById("bankrollAmt");
const betInputEl = document.getElementById("betInput");
const sessionId = crypto.randomUUID();
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

// ----- UI elements -----
const dealerCardsEl = document.getElementById("dealerCards");
const dealerTotalEl = document.getElementById("dealerTotal");
const handPanelEls = [
    document.getElementById("handPanel0"),
    document.getElementById("handPanel1"),
];

const playerCardsEls = [
    document.getElementById("playerCards0"),
    document.getElementById("playerCards1"),
];

const playerTotalEls = [
    document.getElementById("playerTotal0"),
    document.getElementById("playerTotal1"),
];

const handBetEls = [
    document.getElementById("handBet0"),
    document.getElementById("handBet1"),
];
const statusEl = document.getElementById("status");

const newGameBtn = document.getElementById("newGameBtn");
const hitBtn = document.getElementById("hitBtn");
const standBtn = document.getElementById("standBtn");
const surrenderBtn = document.getElementById("surrenderBtn");
const deckCountSelect = document.getElementById("deckCountSelect");
const doubleBtn = document.getElementById("doubleBtn");
const splitBtn = document.getElementById("splitBtn");

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
function setStatus(msg) {
    statusEl.textContent = msg;
}
function renderHand(containerEl, hand, { hideSecondCard = false } = {}) {
    const existing = containerEl.querySelectorAll("img");

    // 1) If the hand got smaller (new round), clear and rebuild once
    if (existing.length > hand.length) {
        containerEl.innerHTML = "";
    }

    // 2) Ensure we have one <img> per card; append only NEW cards
    for (let idx = containerEl.querySelectorAll("img").length; idx < hand.length; idx++) {
        const img = document.createElement("img");
        img.alt = "Card";

        // Only new cards should animate
        img.classList.add("dealt");
        img.style.animationDelay = `${idx * 60}ms`;

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
function renderPlayerHandsUI() {
    const hands = playerHands ? playerHands : [playerHand];

    for (let i = 0; i < 2; i++) {
        const panel = handPanelEls[i];

        // hide Hand 2 unless split
        if (!hands[i]) {
            panel.style.display = "none";
            continue;
        }

        panel.style.display = "";

        const isActive = playerHands ? i === activeHandIndex : true;
        panel.classList.toggle("active", isActive);
        panel.classList.toggle("inactive", playerHands && !isActive);

        const bet = playerHands ? bets[i] : currentBet;
        handBetEls[i].textContent = bet > 0 ? `Bet: $${bet}` : "";

        renderHand(playerCardsEls[i], hands[i]);
        playerTotalEls[i].textContent = `Total: ${handValue(hands[i])}`;
    }
}
function render({ hideDealerHoleCard = false } = {}) {
    // dealer
    renderHand(dealerCardsEl, dealerHand, { hideSecondCard: hideDealerHoleCard });

    // player UI
    renderPlayerHandsUI();

    // dealer totals
    if (hideDealerHoleCard) {
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

    hitBtn.disabled = !inRound || handFinished;
    standBtn.disabled = !inRound || handFinished;

    // surrender: first decision only, and usually not after split if you want that rule
    surrenderBtn.disabled = !inRound || handFinished || hand.length !== 2;

    // double: first decision only + must afford to match current hand bet
    doubleBtn.disabled = !inRound || handFinished || hand.length !== 2 || bankroll < handBet;

    const canSplit =
        inRound &&
        hand.length === 2 &&
        cardValueForSplit(hand[0]) === cardValueForSplit(hand[1]) &&
        bankroll >= handBet;

    splitBtn.disabled = !canSplit;
}

// helper functions to send hand data to postgres
async function recordHandToDb({ outcome, message }) {
    try {
        const betCents = Math.round(currentBet * 100);

        const payload = {
            sessionId,
            roundIndex,
            handIndex: 0,

            betCents,
            outcome,
            payoutCents: calcPayoutCents(outcome, betCents),

            playerCards: playerHand.map(cardToString),
            dealerCards: dealerHand.map(cardToString),
            dealerUpcard: dealerHand[0] ? cardToString(dealerHand[0]) : null,

            didSplit: !!didSplit,
            didDouble: !!didDouble,
            didSurrender: outcome === "surrender"
        };

        const API_BASE = window.API_BASE || "http://localhost:3001";

        window.__BJ_DB_PENDING__ ||= [];

        // ✅ create the promise first
        const p = fetch(`${API_BASE}/api/hands`, {
            method: "POST",
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

function endRound(message, outcome = "lose") {
    inRound = false;
    render({ hideDealerHoleCard: false });
    // record hand to DB
    recordHandToDb({ outcome, message });
    // Payout rules:
    // - lose: you already paid the bet, nothing returned
    // - push: return bet
    // - win: return bet + winnings (1:1)
    // - blackjack: return bet + winnings (3:2)
    // - surrender: return half the bet (rounded down)
    if (currentBet > 0) {
        if (outcome === "push") {
            bankroll += currentBet;
        } else if (outcome === "win") {
            bankroll += currentBet * 2;
        } else if (outcome === "blackjack") {
            bankroll += currentBet * 2 + Math.floor(currentBet / 2);
            // Alternative clearer: bankroll += currentBet * 2 + Math.floor(currentBet / 2);
        } else if (outcome === "surrender") {
            bankroll += Math.floor(currentBet / 2);
        }
    }

    currentBet = 0;
    updateBankrollUI();

    betInputEl.disabled = false;

    setStatus(message);
}

function checkImmediateOutcomes() {
    const p = handValue(playerHand);
    const d = handValue(dealerHand);

    // Natural blackjack checks (simple rules)
    if (playerHand.length === 2 && p === 21) {
        if (dealerHand.length === 2 && d === 21) endRound("Push: both have Blackjack.", "push");
        else endRound("You win: Blackjack!", "blackjack");
        return true;
    }
    if (dealerHand.length === 2 && d === 21) {
        endRound("Dealer wins: Blackjack.", "lose");
        return true;
    }
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
    // add round counter
    roundIndex += 1;
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

    // Take the bet "onto the table"
    currentBet = bet;
    bankroll -= currentBet;
    updateBankrollUI();

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

    checkImmediateOutcomes();
}

function hit() {
    if (!inRound) return;

    const hand = currentHand();

    // If this hand is already finished, ignore input
    if (hand && hand._done) return;

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
        stand();
        return;
    }

    setStatus(`Playing Hand ${playerHands ? activeHandIndex + 1 : 1}. Hit or Stand?`);
}


function dealerPlay() {
    while (handValue(dealerHand) < 17) {
        drawCard(dealerHand);
    }
}

function stand() {
    if (!inRound) return;

    const hand = currentHand();

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

    const hand = currentHand();

    if (hand.length !== 2) {
        setStatus("Double is only allowed before hitting.");
        return;
    }

    const i = activeHandIndex;
    const betToDouble = playerHands ? bets[i] : currentBet;

    if (bankroll < betToDouble) {
        setStatus("Not enough bankroll to double.");
        return;
    }

    bankroll -= betToDouble;
    didDouble = true;
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
        stand();
    }
}


function split() {
    if (!inRound) return;

    if (playerHand.length !== 2) {
        setStatus("Split is only allowed with two cards.");
        return;
    }

    const v0 = cardValueForSplit(playerHand[0]);
    const v1 = cardValueForSplit(playerHand[1]);

    if (v0 !== v1) {
        setStatus("Split is only allowed with matching value (e.g., Q+K, 10+J) or a pair.");
        return;
    }

    // Need enough bankroll to place the additional bet (same as currentBet)
    if (bankroll < currentBet) {
        setStatus("Not enough bankroll to split.");
        return;
    }

    // Take the extra bet (DO NOT double currentBet)
    bankroll -= currentBet;
    updateBankrollUI();
    didSplit = true;
    // Split into 2 hands
    const secondCard = playerHand.pop();
    const firstHand = [playerHand[0]];
    const secondHand = [secondCard];

    // Save both hands + per-hand bets
    playerHands = [firstHand, secondHand];
    bets = [currentBet, currentBet];
    activeHandIndex = 0;
    handOutcomes = [null, null];

    // Deal one card to each hand (common rule)
    drawCard(playerHands[0]);
    drawCard(playerHands[1]);

    // Keep compatibility with your hit/stand which uses playerHand
    playerHand = playerHands[0];

    render({ hideDealerHoleCard: true });
    setStatus("Split! Playing Hand 1. Hit or Stand?");
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
        return;
    }

    // Otherwise all hands are finished -> dealer plays once and settle
    dealerPlay();
    render({ hideDealerHoleCard: false });

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

    for (let i = 0; i < playerHands.length; i++) {
        // If this hand surrendered, skip outcome calc (half already refunded in surrender())
        if (handOutcomes && handOutcomes[i] === "surrender") {
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

        bankroll += payoutForOutcome(bet, outcome);
        summary.push(`Hand ${i + 1}: ${outcome.toUpperCase()} (${p} vs ${d})`);

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
    setStatus(summary.join(" | "));
}


function surrender() {
    if (!inRound) return;

    const hand = currentHand();

    if (hand.length !== 2) {
        setStatus("Surrender is only allowed on your first two cards.");
        return;
    }

    // Non-split: your existing payout logic
    if (!playerHands) {
        endRound("You surrendered. Half your bet is returned.", "surrender");
        return;
    }

    // Split: surrender only this hand
    const i = activeHandIndex;

    handOutcomes[i] = "surrender";
    hand._done = true;
    hand._result = "surrender";

    bankroll += Math.floor(bets[i] / 2);
    updateBankrollUI();

    setStatus(`Hand ${i + 1} surrendered.`);
    advanceHandOrResolve();
}

// ----- Wire up buttons -----
newGameBtn.addEventListener("click", startNewGame);
hitBtn.addEventListener("click", hit);
standBtn.addEventListener("click", stand);
surrenderBtn.addEventListener("click", surrender);
doubleBtn.addEventListener("click", double);
splitBtn.addEventListener("click", split);

// Initial render
updateBankrollUI();
render({ hideDealerHoleCard: false });

// starting a session
async function startSession() {
  try {
    const API_BASE = window.API_BASE || "http://localhost:3001";

    await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, userAgent: navigator.userAgent })
    });
  } catch (e) {
    console.error("Failed to start session:", e);
  }
}

startSession();
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


        done() {
            return inRound === false;
        },

        // get current game state
        state() {
            return {
                inRound,
                bankroll,
                currentBet,
                playerTotal: handValue(currentHand()),
                dealerTotal: handValue(dealerHand)
            };
        }
    };
})();
