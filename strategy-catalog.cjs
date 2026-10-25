// Shared by the browser, server validation, and server-rendered strategy guide.
(function (root) {
    const systems = 'https://wizardofodds.com/gambling/betting-systems/';
    const paper = 'https://probabilityandfinance.com/articles/57.pdf';
    const basics = 'https://wizardofodds.com/games/blackjack/basics/';
    const entries = [
        { id: 'flat', kind: 'betting', name: 'Flat bet', origin: 'Established baseline',
            rules: 'Wager one base unit every round.', example: 'With a $10 unit: $10, $10, $10, regardless of results.',
            pro: 'A consistent stake makes hand strategies easier to compare.', con: 'Losses still accumulate; a fixed stake does not create an advantage.', source: systems },
        { id: 'martingale', kind: 'betting', name: 'Martingale', origin: 'Established progression',
            rules: 'Double the previous opening bet after a net loss; reset to one unit after a net profit. Hold after break-even.', example: 'With a $10 unit, loss → loss → profit gives next bets $20 → $40 → $10.',
            pro: 'Simple rules; short losing sequences can be followed by recovery.', con: 'Stakes grow rapidly. Limits, split losses and partial payouts defeat the idea of guaranteed recovery.', source: systems },
        { id: 'paroli', kind: 'betting', name: 'Paroli · three wins', origin: 'Adapted positive progression',
            rules: 'Double after profit. Reset after a loss or three profitable rounds in the cycle; break-even pauses the cycle. The three-win reset is our chosen variant.', example: 'Three profits with a $10 unit: wager $10, $20, $40, then restart at $10.',
            pro: 'Losses reset the stake instead of escalating it.', con: 'A later loss can consume earlier gains; winning sequences are unpredictable.', source: 'https://wizardofodds.com/gambling/anti-martingale/' },
        { id: 'dalembert', kind: 'betting', name: 'D’Alembert', origin: 'Established progression',
            rules: 'Add one base unit after a loss; subtract one after profit, with a minimum of one unit. Hold after break-even.', example: 'With a $10 unit, loss → loss → profit gives next bets $20 → $30 → $20.',
            pro: 'Stakes rise more slowly than doubling.', con: 'Still increases exposure after losses; a long deficit can exhaust the bankroll.', source: paper },
        { id: 'fibonacci', kind: 'betting', name: 'Fibonacci', origin: 'Adapted negative progression',
            rules: 'Use 1, 1, 2, 3, 5, 8… units, starting at the second 1. Move forward one place after loss and back two after profit. Moving before the first entry restarts at the second 1; break-even holds.', example: 'From the second 1: loss → loss → profit gives next stakes 2 → 3 → 1 units.',
            pro: 'A defined sequence makes loss escalation easy to inspect.', con: 'Later stakes become large. Recovery arguments for even-money bets do not transfer directly to blackjack.', source: 'https://wizardofodds.com/gambling/fibonacci/' },
        { id: 'wave', kind: 'betting', name: 'Wave', origin: 'Original experiment',
            rules: 'Repeat 1, 2, 3, 2 base units. Advance after every round, including break-even, without looking at wins or losses.', example: '$10, $20, $30, $20, $10, $20…',
            pro: 'Predictable exposure without chasing losses.', con: 'The pattern has no information about the shoe and wagers more than flat betting.', source: null },
        { id: 'pulse', kind: 'betting', name: 'Pulse', origin: 'Original experiment',
            rules: 'Repeat four one-unit bets followed by one five-unit bet. Advance after every round, including break-even.', example: '$10, $10, $10, $10, $50, then repeat.',
            pro: 'Demonstrates how occasional larger stakes affect the result curve.', con: 'One badly timed pulse can outweigh several small wins; its timing has no predictive value.', source: null },
        { id: 'basic', kind: 'playing', name: 'Trainer basic strategy', origin: 'Trainer baseline',
            rules: 'Use the same hard-total, soft-total and pair recommendations as Practice, subject to legal actions and affordability.', example: 'Hard 16 against dealer 10: surrender on the original two-card hand, otherwise hit.',
            pro: 'Uses the dealer upcard and available actions.', con: 'Fixed trainer recommendations are not a deck-composition model and do not guarantee profit.', source: basics },
        { id: 'mimic', kind: 'playing', name: 'Mimic the dealer', origin: 'Known poor strategy',
            rules: 'Hit below 17 and stand at 17 or higher, including soft 17. Never double, split or surrender.', example: 'Stand on soft 17 even against dealer 10.',
            pro: 'Easy comparison that isolates the cost of ignoring player options.', con: 'Player busts lose immediately, so copying the dealer does not create symmetry.', source: basics },
        { id: 'never-bust', kind: 'playing', name: 'Never bust', origin: 'Known poor strategy',
            rules: 'Use basic strategy, but replace any recommended hit on a hard total of 12 or more with stand. Keep other recommended actions.', example: 'Hard 16 against 10 stands if surrender is unavailable.',
            pro: 'Avoids busts caused by hitting hard 12 or higher.', con: 'Standing on weak totals sacrifices opportunities to improve. Doubles can still bust.', source: basics },
        { id: 'chase20', kind: 'playing', name: 'Chase 20', origin: 'Original experiment',
            rules: 'Hit everything below 20 and stand on 20 or 21. Never double, split or surrender.', example: 'Hit hard 19, regardless of the dealer upcard.',
            pro: 'A deliberately extreme way to explore the tradeoff between improvement and busting.', con: 'Throws away strong hands by repeatedly risking a bust. Not recommended play.', source: null },
        { id: 'split-party', kind: 'playing', name: 'Split party', origin: 'Original experiment',
            rules: 'Split every matching-value pair when legal and affordable, including tens and fives. Otherwise use basic strategy.', example: 'Two tens split against any dealer upcard, up to four hands.',
            pro: 'Highlights how splitting changes total exposure and hand count.', con: 'Breaks up strong totals and spends more on unfavorable splits. Not recommended play.', source: null },
    ];
    const catalog = { entries, betting: entries.filter(entry => entry.kind === 'betting'), playing: entries.filter(entry => entry.kind === 'playing') };
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    else root.BlackjackStrategies = catalog;
})(typeof globalThis === 'object' ? globalThis : this);
