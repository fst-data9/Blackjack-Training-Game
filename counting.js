/* Rank tags: QFIT's Card Counting Strategy Summary. T includes J/Q/K.
 * Unbalanced drills deliberately start at zero: arithmetic, not betting indexes. */
(() => {
    'use strict';
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const systems = [
        ['Hi-Lo', [-1,1,1,1,1,1,0,0,0,-1], true],
        ['KO', [-1,1,1,1,1,1,1,0,0,-1], false],
        ['Red Seven', [-1,1,1,1,1,1,0,0,0,-1], false],
        ['Hi-Opt I', [0,0,1,1,1,1,0,0,0,-1], true],
        ['Hi-Opt II', [0,1,1,2,2,1,1,0,0,-2], true],
        ['Omega II', [0,1,1,2,2,2,1,0,-1,-2], true],
        ['Zen', [-1,1,1,2,2,2,1,0,0,-2], true],
        ['Wong Halves', [-1,.5,1,1,1.5,1,.5,0,-.5,-1], true],
    ];
    const $ = id => document.getElementById(id);
    if (!$('countSystem')) return;
    const signed = value => value > 0 ? `+${value}` : String(value === 0 ? 0 : value);
    systems.forEach(([name], index) => $('countSystem').add(new Option(name, index)));
    let shoe = [], seen = 0, running = 0, aces = 0, attempts = 0, correct = 0, streak = 0;
    let batch = [], awaiting = false, limit = 0;
    const system = () => systems[Number($('countSystem').value)];
    function tag(card) {
        if (system()[0] === 'Red Seven' && card.rank === '7') return card.red ? 1 : 0;
        return system()[1][Math.min(ranks.indexOf(card.rank), 9)];
    }
    function metrics() {
        $('countAccuracy').textContent = attempts ? `${Math.round(correct / attempts * 100)}%` : '—';
        $('countAttempts').textContent = attempts;
        $('countStreak').textContent = streak;
    }
    function reference() {
        const [name, values, balanced] = system();
        $('countSystemTitle').textContent = `${name} · ${balanced ? 'balanced' : 'unbalanced'}`;
        $('countSystemNote').textContent = 'Card tags are added as cards are exposed. Ten, jack, queen and king share the same tag.';
        $('countStartNote').textContent = balanced
            ? 'Start at 0. A complete deck finishes at 0. True-count answers truncate toward zero using exact decks remaining.'
            : `This arithmetic drill starts at 0 and finishes at +${name === 'KO' ? 4 : 2} per complete deck. Published systems use their own starting counts and betting indexes; this zero-based total must not be used with those indexes.`;
        $('countTags').replaceChildren();
        values.forEach((value, i) => {
            const box = document.createElement('span'); box.className = 'count-tag';
            box.textContent = i === 9 ? '10 / J / Q / K' : ranks[i];
            const number = document.createElement('strong');
            number.textContent = name === 'Red Seven' && i === 6 ? 'Red +1 / black 0' : signed(value);
            box.append(number); $('countTags').append(box);
        });
        $('countMode').querySelector('[value="true"]').disabled = !balanced;
        if (!balanced && $('countMode').value === 'true') $('countMode').value = 'running';
    }
    function reset() {
        reference();
        shoe = [];
        for (let d = 0; d < Number($('countDecks').value); d++) {
            for (const suit of ['♠','♥','♣','♦']) for (const rank of ranks) shoe.push({rank, suit, red: suit === '♥' || suit === '♦'});
        }
        for (let i = shoe.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
        }
        limit = Math.floor(shoe.length * Number($('countDepth').value));
        // Division by zero is undefined; leave one card for true-count drills.
        if ($('countMode').value === 'true') limit = Math.min(limit, shoe.length - 1);
        seen = running = aces = attempts = correct = streak = 0;
        batch = []; awaiting = false;
        const back = document.createElement('span');
        back.className = 'count-card-back';
        back.textContent = '♠';
        back.setAttribute('aria-hidden', 'true');
        $('countCards').replaceChildren(back);
        $('countAnswerForm').hidden = true;
        $('countNext').disabled = false;
        $('countNext').textContent = 'Start drill';
        $('countHint').textContent = '';
        $('countInstruction').textContent = 'Start at zero. Select Start drill to reveal cards.';
        $('countFeedback').textContent = 'Fresh drill. Count every revealed card once.';
        $('countShoe').textContent = `${$('countDecks').value}-deck shoe · ${system()[0]}`;
        $('countProgress').textContent = '0 cards seen';
        metrics();
    }
    function next() {
        if (awaiting || seen >= limit) return;
        batch = shoe.slice(seen, Math.min(seen + Number($('countBatch').value), limit));
        const before = running;
        for (const card of batch) { running += tag(card); if (card.rank === 'A') aces++; }
        seen += batch.length;
        const remaining = (shoe.length - seen) / 52;
        $('countCards').replaceChildren();
        batch.forEach(card => {
            const el = document.createElement('span');
            el.className = `count-playing-card${card.red ? ' red' : ''}`;
            el.textContent = `${card.rank}${card.suit}`;
            el.setAttribute('aria-label', `${card.rank} of ${{'♠':'spades','♥':'hearts','♣':'clubs','♦':'diamonds'}[card.suit]}`);
            $('countCards').append(el);
        });
        const mode = $('countMode').value;
        $('countInstruction').textContent = mode === 'tag' ? 'Add the tags of the cards shown.' : mode === 'running' ? 'What is the running count for the entire shoe so far?' : `Running count ${signed(running)}. Divide by ${shoe.length - seen}/52 decks, then truncate toward zero.`;
        $('countHint').textContent = $('countHints').checked
            ? `Previous count ${signed(before)} · this reveal ${batch.map(card => signed(tag(card))).join(', ')} · running count ${signed(running)}` : '';
        $('countProgress').textContent = `${seen}/${limit} cards · ${remaining.toFixed(3)} decks left`;
        $('countAnswerLabel').textContent = mode === 'tag' ? 'Total tag value' : mode === 'running' ? 'Running count' : 'True count (whole number)';
        $('countAceField').hidden = !$('countAces').checked;
        $('countAceAnswer').required = $('countAces').checked;
        $('countAceAnswer').value = '';
        $('countAnswer').step = mode === 'true' ? '1' : '0.5';
        $('countAnswer').value = '';
        $('countAnswerForm').hidden = false;
        $('countCheck').disabled = false;
        $('countNext').disabled = true;
        $('countFeedback').textContent = 'Enter your answer, then check.';
        awaiting = true;
        $('countAnswer').focus();
    }
    $('countAnswerForm').addEventListener('submit', event => {
        event.preventDefault();
        if (!awaiting || !$('countAnswerForm').reportValidity()) return;
        const mode = $('countMode').value;
        const expected = mode === 'tag' ? batch.reduce((sum, card) => sum + tag(card), 0)
            : mode === 'running' ? running : Math.trunc(running / ((shoe.length - seen) / 52));
        const right = Number($('countAnswer').value) === expected && (!$('countAces').checked || Number($('countAceAnswer').value) === aces);
        attempts++; if (right) { correct++; streak++; } else streak = 0;
        awaiting = false;
        $('countCheck').disabled = true;
        const done = seen >= limit;
        $('countFeedback').textContent = `${right ? 'Correct.' : 'Not quite.'} Answer: ${signed(expected)}.${$('countAces').checked ? ` Aces seen: ${aces}.` : ''} ${done ? `Drill complete. Final running count: ${signed(running)}. Reset to practise again.` : 'Continue with the next reveal.'}`;
        $('countNext').disabled = done;
        $('countNext').textContent = done ? 'Drill complete' : 'Next cards';
        metrics();
        (done ? $('countReset') : $('countNext')).focus();
    });
    $('countNext').addEventListener('click', next);
    $('countReset').addEventListener('click', reset);
    for (const id of ['countSystem','countMode','countDecks','countBatch','countDepth','countHints','countAces']) $(id).addEventListener('change', reset);
    reset();
})();
