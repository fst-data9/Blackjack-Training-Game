const blackjackLearningContent = {
 lessons: [
        ['01', 'Meet the table', 'Get closer to 21 than the dealer without going over. Number cards keep their value, faces count as 10, and an ace counts as 1 or 11. You play against the dealer, not the other players.', 'A + 7 = soft 18. Add a 9 and your ace becomes 1: now you have hard 17.'],
        ['02', 'Your five moves', 'Hit takes another card. Stand keeps your total. Double adds an equal bet and gives exactly one more card. Split turns a matching pair into separate hands with separate bets. Late surrender returns half your original bet (rounded down here) after the dealer checks for blackjack.', 'Double and split need enough bankroll. Surrender is available on your original two-card hand.'],
        ['03', 'Read the dealer', 'Basic strategy combines your hand with the dealer’s visible card. A dealer 4, 5 or 6 is vulnerable, but a bust is never guaranteed. Against a strong upcard you often need to improve your hand.', 'Hard 12 stands against 4–6, but hits against 2 or 3. Small details matter.'],
        ['04', 'Soft hands & pairs', 'A soft hand contains an ace still worth 11. That cushion creates good doubling opportunities. Pairs have their own strategy: splitting aces and eights is a useful starting point; keeping tens together protects a strong 20.', 'This trainer allows up to four split hands, doubling after splits, and continued play after splitting aces. Every split hand advances automatically at 21; a split-hand 21 pays as an ordinary win.'],
        ['05', 'Think in decisions', 'A correct decision can lose and a poor decision can win. Basic strategy aims to improve the average result over many hands; it cannot promise a profit. Treat the chips as practice and judge your choices, not your last result.', 'Insurance is a separate bet on dealer blackjack. The trainer’s basic strategy declines it.']
    ],
 terms: [
        ['Ace', 'Cards', 'A card worth 1 or 11. Its value adjusts to the highest total that does not bust.'],
        ['Bankroll', 'Table', 'The practice chips you have available. Splitting and doubling require additional chips.'],
        ['Basic strategy', 'Strategy', 'A decision guide based on your hand, the dealer upcard and the table rules. It improves average results; it does not guarantee a win.'],
        ['Blackjack', 'Cards', 'An ace plus a ten-value card in the original two-card hand. It pays 3:2 here. A 21 after splitting is not a natural blackjack.'],
        ['Bust', 'Cards', 'A hand total above 21. A player bust loses immediately, even if the dealer later busts.'],
        ['Dealer upcard', 'Table', 'The dealer’s visible card. Use it with your own hand to choose a strategy move.'],
        ['Double down', 'Actions', 'Add an equal bet, take exactly one more card and finish that hand. Doubling after a split is allowed here.'],
        ['DAS', 'Table', 'Double after split: a rule allowing you to double a two-card split hand. This trainer uses DAS.'],
        ['Hard hand', 'Cards', 'A hand with no ace counted as 11. A + 6 + 10 is hard 17 because the ace must count as 1.'],
        ['Hit', 'Actions', 'Ask for another card. You can keep hitting while your hand and the table rules allow it.'],
        ['Hole card', 'Table', 'The dealer’s face-down card. It is revealed when the dealer checks for blackjack or plays the hand.'],
        ['House edge', 'Strategy', 'The casino’s average advantage over many wagers under a specified rule set and playing strategy. Short sessions can vary widely.'],
        ['Insurance', 'Actions', 'A separate wager of half your original bet (rounded down to whole dollars here), offered against a dealer ace. It pays 2:1 if the dealer has blackjack. Basic strategy here declines it.'],
        ['Late surrender', 'Actions', 'Give up the original two-card hand for half your bet back, after the dealer checks for blackjack. It is not available on split hands here.'],
        ['Natural', 'Cards', 'Another name for an original two-card blackjack.'],
        ['Push', 'Table', 'A tie: the original wager is returned. An ordinary 21 does not tie a dealer natural blackjack.'],
        ['Resplit', 'Actions', 'Split a newly dealt matching pair again. This trainer permits a maximum of four hands.'],
        ['S17', 'Table', 'Stand on soft 17. The dealer stands on A + 6 in this trainer; H17 tables instead require a hit.'],
        ['Shoe', 'Table', 'The combined decks used for dealing. The trainer lets you choose 1, 2, 3, 4, 6 or 8 decks.'],
        ['Soft hand', 'Cards', 'A hand with an ace counted as 11. A + 6 is soft 17; the ace can switch to 1 if another card would otherwise bust the hand.'],
        ['Split', 'Actions', 'Separate a matching pair into two hands with equal bets. Here you can keep playing after splitting aces; all split hands advance automatically at 21.'],
        ['Stand', 'Actions', 'Keep your current total and finish your turn on that hand.'],
        ['Ten-value card', 'Cards', 'A 10, jack, queen or king. All count as 10.']
    ]
};
if (typeof module !== "undefined") module.exports = blackjackLearningContent;
