(() => {
    'use strict';
    const make = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    const lessons = [
        ['01', 'Meet the table', 'Get closer to 21 than the dealer without going over. Number cards keep their value, faces count as 10, and an ace counts as 1 or 11. You play against the dealer, not the other players.', 'A + 7 = soft 18. Add a 9 and your ace becomes 1: now you have hard 17.'],
        ['02', 'Your five moves', 'Hit takes another card. Stand keeps your total. Double adds an equal bet and gives exactly one more card. Split turns a matching pair into separate hands with separate bets. Late surrender returns half your original bet (rounded down here) after the dealer checks for blackjack.', 'Double and split need enough bankroll. Surrender is available on your original two-card hand.'],
        ['03', 'Read the dealer', 'Basic strategy combines your hand with the dealer’s visible card. A dealer 4, 5 or 6 is vulnerable, but a bust is never guaranteed. Against a strong upcard you often need to improve your hand.', 'Hard 12 stands against 4–6, but hits against 2 or 3. Small details matter.'],
        ['04', 'Soft hands & pairs', 'A soft hand contains an ace still worth 11. That cushion creates good doubling opportunities. Pairs have their own strategy: splitting aces and eights is a useful starting point; keeping tens together protects a strong 20.', 'This trainer allows up to four split hands, doubling after splits, and continued play after splitting aces. Every split hand advances automatically at 21; a split-hand 21 pays as an ordinary win.'],
        ['05', 'Think in decisions', 'A correct decision can lose and a poor decision can win. Basic strategy aims to improve the average result over many hands; it cannot promise a profit. Treat the chips as practice and judge your choices, not your last result.', 'Insurance is a separate bet on dealer blackjack. The trainer’s basic strategy declines it.']
    ];
    const questions = [
        { hand: '10 + 6', total: 'Hard 16', dealer: '10', answer: 'Surrender', why: 'On an original two-card hard 16 against 10, late surrender limits the loss to half a bet. If surrender is unavailable, hit.' },
        { hand: '8 + 8', total: 'Pair of eights', dealer: '10', answer: 'Split', why: 'Treat the pair before the hard total: two eights are better starting hands than hard 16. This trainer recommends splitting even against 10.' },
        { hand: '10 + 2', total: 'Hard 12', dealer: '3', answer: 'Hit', why: 'Hard 12 needs another card against a dealer 3. Stand on 12 against 4, 5 or 6 instead.' },
        { hand: '10 + 3', total: 'Hard 13', dealer: '6', answer: 'Stand', why: 'Against a dealer 6, keep hard 13 and let the dealer draw. That is the better average decision, even though the dealer can still win.' },
        { hand: 'A + 7', total: 'Soft 18', dealer: '6', answer: 'Double', why: 'Soft 18 against 6 is a doubling opportunity. You can improve your wager with a strong starting hand. If doubling is unavailable, stand.' },
        { hand: 'A + 7', total: 'Soft 18', dealer: '9', answer: 'Hit', why: 'An 18 is not strong enough against 9. Your ace gives you room to hit without immediately busting.' },
        { hand: '10 + 10', total: 'Pair of tens', dealer: '6', answer: 'Stand', why: 'Keep your 20. Splitting tens breaks up a strong hand, even against a weak dealer upcard.' },
        { hand: '5 + 5', total: 'Hard 10', dealer: '9', answer: 'Double', why: 'Play a pair of fives as hard 10. Double against 9 when you can afford the additional bet; otherwise hit.' }
    ];
    const learn = document.getElementById('learnContent');
    if (learn) {
        learn.classList.add('learning-content');
        learn.append(make('p', 'SMALL LESSONS. SMARTER MOVES.', 'learning-eyebrow'), make('h2', 'Learn the table'), make('p', 'Build your instincts one hand at a time. Open a lesson, then test your next move.', 'learning-lead'));
        const lessonGrid = make('div', '', 'lesson-grid');
        lessons.forEach(([number, title, body, tip]) => {
            const details = make('details', '', 'lesson-card');
            const summary = make('summary');
            summary.append(make('span', number, 'lesson-number'), make('span', title));
            details.append(summary, make('p', body), make('p', tip, 'lesson-tip'));
            lessonGrid.append(details);
        });
        learn.append(lessonGrid);
        const quiz = make('section', '', 'learning-quiz');
        quiz.setAttribute('aria-label', 'Basic strategy quiz');
        quiz.append(make('p', 'YOUR MOVE', 'learning-eyebrow'), make('h2', 'The decision dojo'), make('p', 'Original two-card hands. Enough chips to double or split. Dealer stands on soft 17.', 'quiz-rules'));
        const progress = make('p', '', 'quiz-progress');
        const table = make('div', '', 'quiz-table');
        const choices = make('div', '', 'quiz-choices');
        const feedback = make('p', '', 'quiz-feedback');
        feedback.setAttribute('role', 'status');
        const next = make('button', 'Next hand →', 'learning-button');
        next.type = 'button';
        let current = 0;
        let score = 0;
        const render = () => {
            const question = questions[current];
            progress.textContent = `Hand ${current + 1} of ${questions.length} · ${score} correct`;
            table.replaceChildren();
            const player = make('div');
            player.append(make('span', 'YOUR HAND', 'learning-eyebrow'), make('strong', question.hand, 'quiz-hand'), make('span', question.total));
            const dealer = make('div');
            dealer.append(make('span', 'DEALER SHOWS', 'learning-eyebrow'), make('strong', question.dealer, 'quiz-hand'));
            table.append(player, dealer);
            choices.replaceChildren();
            feedback.textContent = '';
            next.hidden = true;
            ['Hit', 'Stand', 'Double', 'Split', 'Surrender'].forEach(action => {
                const button = make('button', action, 'learning-button');
                button.type = 'button';
                button.addEventListener('click', () => {
                    const correct = action === question.answer;
                    if (correct) score++;
                    choices.querySelectorAll('button').forEach(option => { option.disabled = true; });
                    feedback.textContent = `${correct ? 'Nice decision!' : `The strategy move is ${question.answer.toLowerCase()}.`} ${question.why}`;
                    feedback.dataset.correct = String(correct);
                    progress.textContent = `Hand ${current + 1} of ${questions.length} · ${score} correct`;
                    next.textContent = current === questions.length - 1 ? 'See your result →' : 'Next hand →';
                    next.hidden = false;
                });
                choices.append(button);
            });
        };
        next.addEventListener('click', () => {
            current++;
            if (current < questions.length) {
                render();
                choices.querySelector('button').focus();
            } else {
                table.replaceChildren(make('h3', `${score} / ${questions.length} — practice pays in better decisions`));
                choices.replaceChildren();
                feedback.textContent = 'Try another lap, then bring these ideas to the practice table. These quiz results stay in this page and do not change your game statistics.';
                next.textContent = 'Try again ↻';
                current = -1;
                score = 0;
            }
        });
        quiz.append(progress, table, choices, feedback, next);
        learn.append(quiz);
        render();
    }
    const terms = [
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
    ];
    const glossary = document.getElementById('glossaryContent');
    if (glossary) {
        glossary.classList.add('learning-content');
        glossary.append(make('p', 'SPEAK THE TABLE’S LANGUAGE', 'learning-eyebrow'), make('h2', 'The blackjack glossary'), make('p', 'From soft hands to surrender: find the words behind the moves.', 'learning-lead'));
        const label = make('label', 'Find a term', 'glossary-label');
        label.htmlFor = 'glossarySearch';
        const search = make('input', '', 'glossary-search');
        search.id = 'glossarySearch';
        search.type = 'search';
        search.placeholder = 'Try “ace”, “double” or “S17”…';
        const filters = make('div', '', 'glossary-filters');
        filters.setAttribute('aria-label', 'Filter glossary by category');
        const count = make('p', '', 'glossary-count');
        count.setAttribute('role', 'status');
        const results = make('div', '', 'glossary-grid');
        let category = 'All';
        const update = () => {
            const query = search.value.trim().toLowerCase();
            const matches = terms.filter(([term, group, description]) => (category === 'All' || group === category) && `${term} ${description}`.toLowerCase().includes(query));
            count.textContent = `${matches.length} ${matches.length === 1 ? 'term' : 'terms'} found`;
            results.replaceChildren();
            matches.forEach(([term, group, description]) => {
                const card = make('article', '', 'glossary-card');
                card.append(make('span', group, 'learning-eyebrow'), make('h2', term), make('p', description));
                results.append(card);
            });
            if (!matches.length) results.append(make('p', 'No matching terms. Try a shorter search or choose All.', 'glossary-empty'));
        };
        ['All', 'Cards', 'Actions', 'Table', 'Strategy'].forEach(group => {
            const button = make('button', group, 'learning-button');
            button.type = 'button';
            button.setAttribute('aria-pressed', String(group === category));
            button.addEventListener('click', () => {
                category = group;
                filters.querySelectorAll('button').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
                update();
            });
            filters.append(button);
        });
        search.addEventListener('input', update);
        glossary.append(label, search, filters, count, results);
        update();
    }
})();
