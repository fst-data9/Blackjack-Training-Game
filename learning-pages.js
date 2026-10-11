function appendLearningText(element, text, state) {
    for (const part of blackjackLearningContent.linkify(text, state)) {
        if (part.href) {
            const link = document.createElement('a');
            link.className = 'in-text-link';
            link.href = part.href;
            link.textContent = part.text;
            element.append(link);
        } else {
            element.append(document.createTextNode(part.text));
        }
    }
}

function learningPageLinkState(section) {
    const path = location.pathname.slice(1);
    return blackjackLearningContent.createPageLinkState(path.split('/')[0] === section ? path : section);
}

(() => {
    'use strict';
    const make = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    const lessons = blackjackLearningContent.lessons;
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
        learn.replaceChildren();
        learn.classList.add('learning-content');
        learn.append(make('p', 'SMALL LESSONS. SMARTER MOVES.', 'learning-eyebrow'), make('h2', 'Learn the table'), make('p', 'Build your instincts one hand at a time. Open a lesson, then test your next move.', 'learning-lead'));
        const lessonGrid = make('div', '', 'lesson-grid');
        lessons.forEach(({ number, slug, title }) => {
            const details = make('details', '', 'lesson-card');
            const summary = make('summary');
            summary.append(make('span', number, 'lesson-number'), make('span', title));
            details.dataset.topic = slug;
            const link = make('a', 'Read this lesson →', 'topic-link');
            link.href = `/learn/${details.dataset.topic}`;
            details.append(summary, make('p', '', 'lesson-body'), make('p', '', 'lesson-tip'), link);
            lessonGrid.append(details);
        });
        learn.append(lessonGrid);
        const updateLessonLinks = () => {
            const pageState = learningPageLinkState('learn');
            lessonGrid.querySelectorAll('.lesson-card').forEach((card, index) => {
                const state = blackjackLearningContent.createLinkState(pageState.currentTopic, Math.min(5, pageState.remaining), pageState.seen);
                const limit = state.remaining;
                for (const [selector, text] of [['.lesson-body', lessons[index].body], ['.lesson-tip', lessons[index].tip]]) {
                    const paragraph = card.querySelector(selector);
                    paragraph.replaceChildren();
                    appendLearningText(paragraph, text, state);
                }
                pageState.remaining -= limit - state.remaining;
            });
        };
        updateLessonLinks();
        window.addEventListener('publicpagechange', updateLessonLinks);
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
    const terms = blackjackLearningContent.terms;
    const glossary = document.getElementById('glossaryContent');
    if (glossary) {
        glossary.replaceChildren();
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
            const matches = terms.filter(({ title, category: group, body }) => (category === 'All' || group === category) && `${title} ${body}`.toLowerCase().includes(query));
            count.textContent = `${matches.length} ${matches.length === 1 ? 'term' : 'terms'} found`;
            results.replaceChildren();
            const pageState = learningPageLinkState('glossary');
            matches.forEach(({ slug, title, category: group, body }) => {
                const card = make('article', '', 'glossary-card');
                card.dataset.topic = slug;
                const link = make('a', `${title} →`, 'topic-link');
                link.href = `/glossary/${card.dataset.topic}`;
                const description = make('p', '', 'glossary-description');
                const state = blackjackLearningContent.createLinkState(pageState.currentTopic, Math.min(2, pageState.remaining), pageState.seen);
                const limit = state.remaining;
                appendLearningText(description, body, state);
                pageState.remaining -= limit - state.remaining;
                card.append(make('span', group, 'learning-eyebrow'), make('h2', title), description);
                card.append(link);
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
        window.addEventListener('publicpagechange', update);
        glossary.append(label, search, filters, count, results);
        update();
    }
})();
