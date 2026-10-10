(() => {
    const root = document.getElementById("chartsContent");
    root.classList.add("learning-content");
    const upcards = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const labels = { hit: "Hit", stand: "Stand", double: "Double", split: "Split", surrender: "Surrender" };
    root.innerHTML = `
        <p class="learning-lead">Find the move. Build the instinct.</p>
        <p>Explore the trainer’s opening-hand recommendations: dealer stands on soft 17, doubling after splits and late surrender. Pair decisions take priority.</p>
        <div class="learning-toolbar">
            <label>Hand type <select id="chartType"><option value="hard">Hard totals</option><option value="soft">Soft totals</option><option value="pair">Pairs</option></select></label>
            <label><input id="chartDouble" type="checkbox" checked> Can afford double / split</label>
            <label><input id="chartSurrender" type="checkbox" checked> Surrender available</label>
        </div>
        <p class="chart-legend">H = Hit · S = Stand · D = Double · P = Split · R = Surrender</p>
        <div class="chart-scroll" tabindex="0" role="region" aria-label="Strategy chart; scroll horizontally on smaller screens"><table class="strategy-table"><caption>Choose a cell to explore a move</caption><thead></thead><tbody></tbody></table></div>
        <div id="chartDetail" class="learning-card" role="status" aria-live="polite">Choose any cell to see the recommended action.</div>
        <p class="learning-note">These are the coach’s fixed recommendations, not deck-specific or card-counting advice. Practice can use 1–8 decks; single- and double-deck optimal strategies differ. Split hands cannot surrender. Split aces receive one additional card and finish; split 21 pays 1:1. When doubling soft 18 is unavailable, stand against 3–6.</p>
        <p class="learning-note">Further reading: <a href="https://wizardofodds.com/games/blackjack/strategy/calculator/" target="_blank" rel="noopener noreferrer">Wizard of Odds strategy calculator</a> and <a href="https://wizardofodds.com/games/blackjack/basics/" target="_blank" rel="noopener noreferrer">blackjack basics</a>. Rules affect strategy; basic strategy does not guarantee a win.</p>`;
    const type = document.getElementById("chartType");
    const afford = document.getElementById("chartDouble");
    const surrender = document.getElementById("chartSurrender");
    const detail = document.getElementById("chartDetail");
    const card = (rank) => ({ rank: rank === 11 ? "A" : String(rank), suit: "♠" });
    function move(kind, value, dealer) {
        if (kind === "soft") {
            // Soft 18 doubles against 3–6, but stands if doubling is unavailable.
            if (value === 18 && dealer >= 3 && dealer <= 6 && !afford.checked) return "stand";
            return softStrategy([card(11), card(value - 11)], dealer, afford.checked);
        }
        if (kind === "pair") {
            const hand = [card(value), card(value)];
            return pairStrategy(hand, dealer, afford.checked) ||
                (value === 11 ? softStrategy(hand, dealer, afford.checked) : hardStrategy(value * 2, dealer, afford.checked, surrender.checked));
        }
        return hardStrategy(value, dealer, afford.checked, surrender.checked);
    }
    function render() {
        const kind = type.value;
        const rows = kind === "pair" ? [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] : kind === "soft" ? [20, 19, 18, 17, 16, 15, 14, 13] : [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4];
        root.querySelector("thead").innerHTML = '<tr><th scope="col">Your hand</th>' + upcards.map(v => `<th scope="col">${v === 11 ? "A" : v}</th>`).join("") + '</tr>';
        const body = root.querySelector("tbody");
        body.replaceChildren();
        for (const value of rows) {
            const row = document.createElement("tr");
            const heading = document.createElement("th");
            heading.scope = "row";
            const handLabel = kind === "pair" ? `${value === 11 ? "A" : value}, ${value === 11 ? "A" : value}` : kind === "soft" ? `A, ${value - 11} (${value})` : String(value);
            heading.textContent = handLabel;
            row.append(heading);
            for (const dealer of upcards) {
                const action = move(kind, value, dealer);
                const cell = document.createElement("td");
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.action = action;
                button.className = `chart-action chart-${action}`;
                button.textContent = { hit: "H", stand: "S", double: "D", split: "P", surrender: "R" }[action];
                button.setAttribute("aria-label", `${handLabel} against dealer ${dealer === 11 ? "Ace" : dealer}: ${labels[action]}`);
                button.addEventListener("click", () => {
                    root.querySelectorAll("[aria-pressed]").forEach(b => b.removeAttribute("aria-pressed"));
                    button.setAttribute("aria-pressed", "true");
                    const explanation = { hit: "Take another card to improve your hand.", stand: "Keep your total and let the dealer play.", double: "Match your wager and take exactly one more card.", split: "Separate the pair into two hands with matching wagers.", surrender: "End the opening hand and recover half the wager (rounded down in this trainer)." }[action];
                    detail.textContent = `${handLabel} vs ${dealer === 11 ? "Ace" : dealer} → ${labels[action]}. ${explanation}`;
                });
                cell.append(button);
                row.append(cell);
            }
            body.append(row);
        }
        detail.textContent = "Choose any cell to see the recommended action.";
    }
    [type, afford, surrender].forEach(control => control.addEventListener("change", render));
    render();
})();
