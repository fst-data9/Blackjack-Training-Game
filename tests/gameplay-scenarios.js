import assert from "node:assert/strict";

// Expected results are supplied independently of the game's settlement helpers.
export function runGameplayScenarios(createHarness) {
    const coverage = {};
    function scenario(name, check) {
        try {
            check();
            coverage[name] = true;
        } catch (error) {
            throw new Error(`Scenario failed: ${name}`, { cause: error });
        }
    }
    function deal(ranks, bet = 20, bankroll = 1000) {
        const game = createHarness();
        game.context.__BJ_TEST__.setBankroll(bankroll);
        game.elements.get("betInput").value = String(bet);
        game.dealCards(ranks.map((rank, index) => [rank, ["♠", "♥", "♦", "♣"][index % 4]]));
        return game;
    }
    function finish(game, bankroll, outcomes, nets, bets) {
        assert.equal(game.state().inRound, false);
        game.assertSettlement();
        assert.equal(game.state().bankroll, bankroll);
        assert.deepEqual(game.recordedHands.map(hand => hand.outcome), outcomes);
        assert.deepEqual(game.recordedHands.map(hand => hand.payoutCents), nets);
        assert.deepEqual(game.recordedHands.map(hand => hand.betCents), bets);
        assert.equal(game.context.__BJ_TEST__.stats().hands, outcomes.length);
        assert.equal(game.context.__BJ_TEST__.stats().mainWagered * 100, bets.reduce((sum, bet) => sum + bet, 0));
        assert.equal(game.context.__BJ_TEST__.stats().actualNet, bankroll - 1000);
        assert.equal(game.buttons().deal, true);
        for (const key of ["hit", "stand", "double", "split", "surrender", "insurance", "noInsurance"]) {
            assert.equal(game.buttons()[key], false, `${key} enabled after settlement`);
        }
        assert.equal(game.elements.get("betInput").disabled, false);
        assert.ok(!game.elements.get("dealerCards").querySelectorAll("img")[1].src.endsWith("/RED_BACK.svg"));
    }

    const endings = [
        ["natural blackjack", ["A", "9", "K", "8"], [], 1030, "blackjack", 3000, 2000],
        ["ten upcard dealer blackjack", ["9", "K", "7", "A"], [], 980, "lose", -2000, 2000],
        ["both blackjack", ["A", "K", "Q", "A"], [], 1000, "push", 0, 2000],
        ["stand win", ["10", "9", "9", "8"], ["standBtn"], 1020, "win", 2000, 2000],
        ["stand loss", ["10", "9", "6", "8"], ["standBtn"], 980, "lose", -2000, 2000],
        ["stand push", ["10", "9", "7", "8"], ["standBtn"], 1000, "push", 0, 2000],
        ["dealer bust", ["10", "6", "8", "9", "K"], ["standBtn"], 1020, "win", 2000, 2000],
        ["dealer draws to win", ["10", "6", "8", "9", "5"], ["standBtn"], 980, "lose", -2000, 2000],
        ["dealer stands soft 17", ["10", "6", "8", "A", "K"], ["standBtn"], 1020, "win", 2000, 2000],
        ["player bust", ["10", "9", "6", "8", "K"], ["hitBtn"], 980, "lose", -2000, 2000],
        ["hit to 21", ["10", "9", "6", "8", "5"], ["hitBtn"], 1020, "win", 2000, 2000],
        ["double win", ["5", "9", "6", "8", "K"], ["doubleBtn"], 1040, "win", 4000, 4000],
        ["double loss", ["5", "9", "6", "8", "2"], ["doubleBtn"], 960, "lose", -4000, 4000],
        ["double push", ["5", "9", "6", "8", "6"], ["doubleBtn"], 1000, "push", 0, 4000],
        ["double bust", ["10", "9", "6", "8", "K"], ["doubleBtn"], 960, "lose", -4000, 4000],
        ["surrender", ["10", "9", "6", "8"], ["surrenderBtn"], 990, "surrender", -1000, 2000],
    ];
    for (const [name, cards, actions, bankroll, outcome, net, bet] of endings) {
        scenario(name, () => {
            const game = deal(cards);
            for (const action of actions) {
                assert.equal(game.elements.get(action).disabled, false);
                game.click(action);
            }
            finish(game, bankroll, [outcome], [net], [bet]);
            if (actions[0] === "doubleBtn") assert.equal(game.recordedHands[0].didDouble, true);
        });
    }
    for (const bet of [1, 3, 25]) {
        scenario(`odd bet ${bet} blackjack rounding`, () => {
            const game = deal(["A", "9", "K", "8"], bet);
            const profit = bet + Math.floor(bet / 2);
            finish(game, 1000 + profit, ["blackjack"], [profit * 100], [bet * 100]);
        });
        scenario(`odd bet ${bet} surrender rounding`, () => {
            const game = deal(["10", "9", "6", "8"], bet);
            game.click("surrenderBtn");
            const loss = bet - Math.floor(bet / 2);
            finish(game, 1000 - loss, ["surrender"], [-loss * 100], [bet * 100]);
        });
    }

    for (const take of [false, true]) {
        for (const dealerBlackjack of [false, true]) {
            for (const playerBlackjack of [false, true]) {
                scenario(`insurance take=${take} dealerBJ=${dealerBlackjack} playerBJ=${playerBlackjack}`, () => {
                    const game = deal([playerBlackjack ? "A" : "10", "A", playerBlackjack ? "K" : "8", dealerBlackjack ? "K" : "6"]);
                    assert.equal(game.state().awaitingInsurance, true);
                    for (const key of ["hit", "stand", "double", "split", "surrender"]) assert.equal(game.buttons()[key], false);
                    game.click(take ? "insuranceBtn" : "noInsuranceBtn");
                    if (game.state().inRound) game.click("standBtn");
                    const outcome = dealerBlackjack ? (playerBlackjack ? "push" : "lose") : (playerBlackjack ? "blackjack" : "win");
                    const mainNet = dealerBlackjack ? (playerBlackjack ? 0 : -20) : (playerBlackjack ? 30 : 20);
                    const insuranceNet = take ? (dealerBlackjack ? 20 : -10) : 0;
                    finish(game, 1000 + mainNet + insuranceNet, [outcome], [mainNet * 100], [2000]);
                    assert.equal(game.context.__BJ_TEST__.stats().insuranceOffered, 1);
                    assert.equal(game.context.__BJ_TEST__.stats().insuranceTaken, Number(take));
                });
            }
        }
    }
    scenario("insurance zero wager and insufficient funds", () => {
        for (const [bet, bankroll] of [[1, 1000], [20, 20]]) {
            const game = deal(["10", "A", "8", "6"], bet, bankroll);
            assert.equal(game.buttons().insurance, false);
            assert.equal(game.buttons().noInsurance, true);
            game.click("insuranceBtn");
            assert.equal(game.state().awaitingInsurance, true);
            game.click("noInsuranceBtn");
            game.click("standBtn");
            assert.equal(game.context.__BJ_TEST__.stats().insuranceTaken, 0);
        }
    });

    scenario("split mixed outcomes and per-hand double flags", () => {
        const game = deal(["8", "9", "8", "8", "3", "2", "K"]);
        game.click("splitBtn");
        assert.equal(game.buttons().surrender, false);
        game.click("doubleBtn");
        assert.equal(game.state().activeHandIndex, 1);
        assert.equal(game.state().inRound, true);
        game.click("standBtn");
        finish(game, 1020, ["win", "lose"], [4000, -2000], [4000, 2000]);
        assert.deepEqual(game.recordedHands.map(hand => hand.didDouble), [true, false]);
    });
    scenario("split bust advances without dealer play", () => {
        const game = deal(["8", "9", "8", "8", "K", "9", "K"]);
        game.click("splitBtn");
        game.click("hitBtn");
        assert.equal(game.state().activeHandIndex, 1);
        assert.equal(game.state().dealerTotal, 17);
        assert.equal(game.recordedHands.length, 0);
        game.click("standBtn");
        finish(game, 980, ["lose", "push"], [-2000, 0], [2000, 2000]);
    });
    scenario("four-hand resplit limit and inserted-hand ordering", () => {
        const game = deal(["8", "9", "8", "8", "8", "8", "8", "8", "8", "8"]);
        for (let count = 2; count <= 4; count++) {
            assert.equal(game.buttons().split, true);
            game.click("splitBtn");
            assert.equal(game.state().handCount, count);
        }
        assert.equal(game.buttons().split, false);
        for (let index = 0; index < 4; index++) {
            assert.equal(game.state().activeHandIndex, index);
            game.click("standBtn");
        }
        finish(game, 920, ["lose", "lose", "lose", "lose"], [-2000, -2000, -2000, -2000], [2000, 2000, 2000, 2000]);
    });
    scenario("mixed ten-value ranks can split", () => {
        const game = deal(["Q", "9", "K", "8", "7", "8"]);
        assert.equal(game.buttons().split, true);
        game.click("splitBtn");
        game.click("standBtn");
        game.click("standBtn");
        finish(game, 1020, ["push", "win"], [0, 2000], [2000, 2000]);
    });
    scenario("nonmatching ranks cannot split", () => {
        const game = deal(["5", "9", "6", "8"]);
        assert.equal(game.buttons().split, false);
        game.click("splitBtn");
        assert.equal(game.state().handCount, 1);
        assert.equal(game.state().bankroll, 980);
    });
    scenario("insufficient bankroll disables double and split", () => {
        const game = deal(["8", "9", "8", "8"], 20, 30);
        assert.equal(game.buttons().split, false);
        assert.equal(game.buttons().double, false);
        game.click("splitBtn");
        game.click("doubleBtn");
        assert.equal(game.state().bankroll, 10);
        assert.equal(game.state().handCount, 1);
        game.click("standBtn");
    });
    scenario("hit removes first-decision actions", () => {
        const game = deal(["5", "9", "6", "8", "2"]);
        game.click("hitBtn");
        for (const key of ["double", "split", "surrender"]) assert.equal(game.buttons()[key], false);
        game.click("standBtn");
        finish(game, 980, ["lose"], [-2000], [2000]);
    });
    scenario("invalid bets do not start or count a round", () => {
        for (const bet of ["0", "-1", "NaN", "Infinity", "1001", ""]) {
            const game = createHarness();
            game.elements.get("betInput").value = bet;
            game.click("newGameBtn");
            assert.equal(game.state().inRound, false);
            assert.equal(game.state().bankroll, 1000);
            assert.equal(game.context.__BJ_TEST__.stats().rounds, 0);
            assert.equal(game.recordedHands.length, 0);
        }
    });
    scenario("active round blocks new deal, reset and bet editing", () => {
        const game = deal(["10", "9", "6", "8"]);
        const before = game.state();
        game.click("newGameBtn");
        game.click("resetBankrollBtn");
        assert.deepEqual(game.state(), before);
        assert.equal(game.elements.get("betInput").disabled, true);
        assert.equal(game.elements.get("deckCountSelect").disabled, true);
    });
    scenario("unique decisions, hints and incorrect-move review", () => {
        const game = deal(["5", "9", "6", "8", "2"]);
        const hint = game.elements.get("strategyLog").querySelectorAll("button")[0];
        assert.ok(hint);
        hint.click();
        assert.equal(game.context.__BJ_TEST__.stats().hints, 1);
        assert.equal(game.elements.get("strategyLog").querySelectorAll("button").length, 0);
        game.click("hitBtn"); // Double on 11 was recommended.
        game.click("standBtn"); // Hit on 13 vs 9 was recommended.
        const decisions = game.inspect("strategyDecisions");
        assert.equal(new Set(decisions.map(item => item.id)).size, 2);
        assert.deepEqual(Array.from(decisions, item => item.action), ["hit", "stand"]);
        assert.equal(game.context.__BJ_TEST__.stats().decisions, 2);
        assert.equal(game.inspect("reviewHands[0].decisions.length"), 2);
        game.click("openReviewBtn");
        assert.equal(game.elements.get("reviewPage").hidden, false);
        game.click("closeReviewBtn");
        assert.equal(game.elements.get("gamePage").hidden, false);
    });
    scenario("new round clears split state", () => {
        const game = deal(["8", "9", "8", "8", "K", "9"]);
        game.click("splitBtn");
        game.click("standBtn");
        game.click("standBtn");
        game.dealCards(["5", "9", "6", "8"].map(rank => [rank]));
        assert.equal(game.state().handCount, 1);
        assert.equal(game.state().activeHandIndex, 0);
        assert.equal(game.buttons().double, true);
        game.click("standBtn");
        assert.equal(game.recordedHands.at(-1).didSplit, false);
    });
    scenario("cut card reshuffles only between rounds", () => {
        const game = deal(["5", "9", "6", "8", "2"]);
        game.inspect("cutCardRemaining = 1");
        game.click("hitBtn");
        assert.equal(game.inspect("shoeNeedsShuffle"), true);
        assert.equal(game.inspect("deck.length"), 0);
        game.click("standBtn");
        game.click("newGameBtn");
        assert.ok(game.inspect("deck.length") >= 6 * 52 - 20);
    });
    scenario("card scoring covers every one, two and three rank combination", () => {
        const game = createHarness();
        const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
        let checked = 0;
        function check(cards) {
            const lowTotal = cards.reduce((sum, rank) => sum + (rank === "A" ? 1 : ["J", "Q", "K"].includes(rank) ? 10 : Number(rank)), 0);
            const soft = cards.includes("A") && lowTotal + 10 <= 21;
            game.context.scoringCards = cards.map(rank => ({ rank, suit: "♠" }));
            assert.equal(game.inspect("handValue(scoringCards)"), lowTotal + (soft ? 10 : 0));
            assert.equal(game.inspect("isSoftHand(scoringCards)"), soft);
            assert.equal(game.inspect("isBlackjack(scoringCards)"), cards.length === 2 && lowTotal === 11 && cards.includes("A"));
            checked++;
        }
        for (const a of ranks) {
            check([a]);
            for (const b of ranks) {
                check([a, b]);
                for (const c of ranks) check([a, b, c]);
            }
        }
        for (const cards of [["A", "A", "A", "A", "7"], ["A", "A", "9", "K"], Array(11).fill("A"), ["2", "3", "4", "5", "6", "A"]]) check(cards);
        coverage.cardCombinations = checked;
    });
    scenario("strategy chart rows and unavailable-action fallbacks", () => {
        const game = createHarness();
        const moves = { H: "hit", S: "stand", D: "double", R: "surrender" };
        // Columns are dealer 2 through 10, then Ace. From images/basic_strategy.jpg.
        const hardRows = {
            4: "HHHHHHHHHH", 5: "HHHHHHHHHH", 6: "HHHHHHHHHH", 7: "HHHHHHHHHH",
            8: "HHHHHHHHHH", 9: "HDDDDHHHHH", 10: "DDDDDDDDHH", 11: "DDDDDDDDDH",
            12: "HHSSSHHHHH", 13: "SSSSSHHHHH", 14: "SSSSSHHHHH",
            15: "SSSSSHHHRH", 16: "SSSSSHHRRR", 17: "SSSSSSSSSS",
            18: "SSSSSSSSSS", 19: "SSSSSSSSSS", 20: "SSSSSSSSSS", 21: "SSSSSSSSSS",
        };
        let checked = 0;
        for (const [total, row] of Object.entries(hardRows)) {
            for (let column = 0; column < 10; column++) {
                for (const canDouble of [false, true]) {
                    for (const canSurrender of [false, true]) {
                        const expected = row[column] === "D" && !canDouble ? "hit"
                            : row[column] === "R" && !canSurrender ? "hit" : moves[row[column]];
                        assert.equal(game.inspect(`hardStrategy(${total}, ${column + 2}, ${canDouble}, ${canSurrender})`), expected);
                        checked++;
                    }
                }
            }
        }
        const softRows = { 13: "HHHDDHHHHH", 14: "HHHDDHHHHH", 15: "HHDDDHHHHH", 16: "HHDDDHHHHH", 17: "HDDDDHHHHH", 18: "SDDDDSSHHH", 19: "SSSSSSSSSS", 20: "SSSSSSSSSS", 21: "SSSSSSSSSS" };
        for (const [total, row] of Object.entries(softRows)) {
            game.context.softCards = [{ rank: "A", suit: "♠" }, { rank: String(Number(total) - 11), suit: "♥" }];
            for (let column = 0; column < 10; column++) {
                for (const canDouble of [false, true]) {
                    const expected = row[column] === "D" && !canDouble ? (Number(total) === 18 ? "stand" : "hit") : moves[row[column]];
                    assert.equal(game.inspect(`softStrategy(softCards, ${column + 2}, ${canDouble})`), expected);
                    checked++;
                }
            }
        }
        coverage.strategyCombinations = checked;
    });
    scenario("pair strategy across dealer upcards and split availability", () => {
        const game = createHarness();
        const rows = { 2: "PPPPPPHHHH", 3: "PPPPPPHHHH", 4: "HHHPPHHHHH", 5: "----------", 6: "PPPPPHHHHH", 7: "PPPPPPHHHH", 8: "PPPPPPPPPP", 9: "PPPPPSPPSS", 10: "----------", A: "PPPPPPPPPP" };
        const moves = { P: "split", H: "hit", S: "stand", "-": null };
        let checked = 0;
        for (const [rank, row] of Object.entries(rows)) {
            game.context.pairCards = [{ rank, suit: "♠" }, { rank, suit: "♥" }];
            for (let column = 0; column < 10; column++) {
                for (const canSplit of [false, true]) {
                    assert.equal(game.inspect(`pairStrategy(pairCards, ${column + 2}, ${canSplit})`), canSplit ? moves[row[column]] : null, `Pair ${rank} vs ${column + 2}, canSplit=${canSplit}`);
                    checked++;
                }
            }
        }
        coverage.pairCombinations = checked;
    });
    return coverage;
}
