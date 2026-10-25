(() => {
    const form = document.getElementById('simulationForm');
    if (!form) return;
    const overrides = {};
    const catalog = window.BlackjackStrategies;
    const betting = document.getElementById('simBetting');
    const playing = document.getElementById('simPlaying');
    for (const entry of catalog.betting) betting.add(new Option(entry.name, entry.id));
    for (const entry of catalog.playing) playing.add(new Option(entry.name, entry.id));
    function describePresets() {
        document.getElementById('simBettingDescription').textContent = catalog.betting.find(entry => entry.id === betting.value).rules;
        document.getElementById('simPlayingDescription').textContent = catalog.playing.find(entry => entry.id === playing.value).rules;
    }
    [betting, playing].forEach(control => control.addEventListener('change', describePresets));
    describePresets();
    document.addEventListener('click', event => {
        const link = event.target.closest('[data-strategy-id]');
        if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const entry = catalog.entries.find(item => item.id === link.dataset.strategyId && item.kind === link.dataset.strategyKind);
        if (!entry) return;
        (entry.kind === 'betting' ? betting : playing).value = entry.id;
        describePresets();
    });
    let latestRun;
    const exports = window.BlackjackExports;
    const exportStatus = document.getElementById('simExportStatus');
    for (const [id, format] of [['simExportJSON', 'json'], ['simExportCSV', 'csv']]) {
        const button = document.getElementById(id);
        button.addEventListener('click', () => exports.handle(button, exportStatus, () => {
            if (!latestRun) throw new Error('Run a simulation first.');
            const content = format === 'json' ? JSON.stringify({ ...latestRun, monetaryUnit: 'USD cents', chartPoints: 'sampled round boundaries', rules: 'Six decks; S17; four split hands; playable split aces; whole-dollar half-bet rounding' }, null, 2) : exports.resultsCSV(latestRun);
            exports.download(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }), `blackjack-${latestRun.id}.${format}`);
        }));
    }
    for (const [prefix, kind] of [['simProfit', 'profit'], ['simOutcomes', 'outcomes']]) for (const format of ['png', 'svg']) {
        const button = document.getElementById(prefix + format.toUpperCase());
        button.addEventListener('click', () => exports.handle(button, exportStatus, () => {
            if (!latestRun) throw new Error('Run a simulation first.');
            return exports.saveChart(exports.simulationChart(latestRun, kind), format, `blackjack-${latestRun.id}-${kind}`);
        }));
    }
    const status = document.getElementById('simulationStatus');
    const results = document.getElementById('simulationResults');
    const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
    const labels = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' };
    const type = document.getElementById('simHandType');
    const hand = document.getElementById('simHand');
    const dealer = document.getElementById('simDealer');
    const action = document.getElementById('simAction');
    const key = () => `${type.value}:${hand.value}:${dealer.value}`;
    function syncAction() { action.value = overrides[key()] || ''; }
    function fillHands() {
        const [min, max] = type.value === 'hard' ? [4, 20] : type.value === 'soft' ? [12, 20] : [2, 11];
        hand.replaceChildren();
        for (let value = min; value <= max; value++) {
            const label = type.value === 'pair' ? (value === 11 ? 'A + A' : `${value} + ${value}`) : `${type.value === 'soft' ? 'Soft' : 'Hard'} ${value}`;
            hand.add(new Option(label, value));
        }
        action.querySelector('[value="split"]').disabled = type.value !== 'pair';
        syncAction();
    }
    type.addEventListener('change', fillHands);
    hand.addEventListener('change', syncAction);
    dealer.addEventListener('change', syncAction);
    fillHands();
    function renderOverrides() {
        const body = document.getElementById('simOverrides');
        body.replaceChildren();
        for (const [id, choice] of Object.entries(overrides)) {
            const [category, total, up] = id.split(':');
            const row = document.createElement('li');
            const remove = document.createElement('button');
            remove.type = 'button'; remove.textContent = 'Remove';
            const text = `${category} ${total === '11' && category === 'pair' ? 'A + A' : total} vs ${up === '11' ? 'A' : up}: ${labels[choice]}`;
            row.append(document.createTextNode(`${text} `), remove);
            remove.setAttribute('aria-label', `Remove ${text}`);
            remove.addEventListener('click', () => { delete overrides[id]; renderOverrides(); syncAction(); document.getElementById('simSaveAction').focus(); });
            body.append(row);
        }
        document.getElementById('simOverrideCount').textContent = `${Object.keys(overrides).length} custom decisions. All other decisions use the playing preset.`;
    }
    document.getElementById('simSaveAction').addEventListener('click', () => {
        if (action.value) overrides[key()] = action.value;
        else delete overrides[key()];
        renderOverrides();
    });
    document.getElementById('simResetStrategy').addEventListener('click', () => {
        for (const id of Object.keys(overrides)) delete overrides[id];
        playing.value = 'basic'; describePresets();
        renderOverrides(); syncAction();
    });
    renderOverrides();
    const ns = 'http://www.w3.org/2000/svg';
    function svgElement(tag, attributes = {}, text) {
        const element = document.createElementNS(ns, tag);
        for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
        if (text !== undefined) element.textContent = text;
        return element;
    }
    let latestResult;
    const refreshCharts = () => { if (latestResult && !results.hidden) renderCharts(latestResult); };
    window.addEventListener('resize', refreshCharts);
    window.addEventListener('publicpagechange', refreshCharts);
    function renderCharts(result) {
        latestResult = result;
        const svg = document.getElementById('simProfitChart');
        svg.replaceChildren(svgElement('title', {}, 'Cumulative profit or loss at sampled round boundaries'));
        const width = Math.max(320, Math.min(700, svg.clientWidth || 700));
        const right = width - 20;
        svg.setAttribute('viewBox', `0 0 ${width} 270`);
        const values = result.points.map(point => point.profit);
        const min = Math.min(0, ...values), max = Math.max(0, ...values);
        const range = max - min || 100;
        const x = round => 85 + round / Math.max(1, result.roundsPlayed) * (right - 85);
        const y = value => 225 - (value - min) / range * 195;
        for (const value of [...new Set([min, 0, max])]) {
            svg.append(svgElement('line', { x1: 85, x2: right, y1: y(value), y2: y(value), stroke: '#78988a', 'stroke-dasharray': value === 0 ? '0' : '4' }));
            svg.append(svgElement('text', { x: 79, y: y(value) + 4, 'text-anchor': 'end' }, money(value)));
        }
        svg.append(svgElement('polyline', { points: result.points.map(point => `${x(point.round)},${y(point.profit)}`).join(' '), fill: 'none', stroke: '#f2ce76', 'stroke-width': 2.5 }));
        svg.append(svgElement('text', { x: 85, y: 250 }, '0'));
        svg.append(svgElement('text', { x: right, y: 250, 'text-anchor': 'end' }, `${result.roundsPlayed.toLocaleString()} rounds`));
        const bars = document.getElementById('simOutcomeChart');
        bars.replaceChildren();
        for (const [name, count] of Object.entries(result.roundOutcomes)) {
            const row = document.createElement('div');
            const text = document.createElement('span');
            text.textContent = `${name === 'even' ? 'Break-even' : name === 'profit' ? 'Profitable' : 'Losing'} rounds: ${count.toLocaleString()}`;
            const bar = document.createElement('meter');
            bar.min = 0; bar.max = Math.max(1, result.roundsPlayed); bar.value = count;
            bar.setAttribute('aria-label', text.textContent);
            row.append(text, bar); bars.append(row);
        }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const fieldset = document.getElementById('simSettings');
        if (fieldset.disabled) return;
        const config = {
            rounds: +document.getElementById('simRounds').value,
            bankroll: Math.round(+document.getElementById('simBankroll').value * 100),
            baseBet: Math.round(+document.getElementById('simBaseBet').value * 100),
            tableLimit: Math.round(+document.getElementById('simTableLimit').value * 100),
            betting: betting.value,
            playing: playing.value,
            insurance: document.getElementById('simInsurance').checked,
            overrides: { ...overrides },
        };
        if (config.baseBet > config.bankroll || config.baseBet > config.tableLimit) {
            status.textContent = 'Base bet must fit within both the starting bankroll and table limit.'; return;
        }
        fieldset.disabled = true; form.setAttribute('aria-busy', 'true'); results.hidden = true;
        status.textContent = `Running ${config.rounds.toLocaleString()} rounds on the server…`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 35000);
        try {
            const response = await fetch(`${window.API_BASE || location.origin}/api/simulations`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config), signal: controller.signal,
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Simulation failed. Please try again.');
            const { result } = data;
            latestRun = structuredClone(data);
            exportStatus.textContent = '';
            document.getElementById('simRunDetails').textContent = `${catalog.betting.find(entry => entry.id === config.betting).name} · ${catalog.playing.find(entry => entry.id === config.playing).name} · ${money(config.baseBet)} base bet · ${money(config.bankroll)} starting bankroll · ${money(config.tableLimit)} table limit · ${Object.keys(config.overrides).length} custom decisions · Insurance ${config.insurance ? 'on' : 'off'}`;
            document.getElementById('simProfit').textContent = money(result.profit);
            document.getElementById('simFinalBankroll').textContent = money(result.finalBankroll);
            document.getElementById('simDrawdown').textContent = money(result.maxDrawdown);
            document.getElementById('simWagered').textContent = money(result.totalWagered);
            document.getElementById('simCompleted').textContent = `${result.roundsPlayed.toLocaleString()} / ${config.rounds.toLocaleString()}`;
            document.getElementById('simHandsPlayed').textContent = `${result.handsPlayed.toLocaleString()} resolved hands (including splits). Largest opening bet: ${money(result.largestBet)}.`;
            document.getElementById('simRunId').textContent = `Saved run ${data.id} · engine ${data.engineVersion} · seed ${data.seed}`;
            results.hidden = false;
            renderCharts(result);
            status.textContent = result.stopReason === 'completed' ? 'Simulation complete. Summary saved.' : 'Stopped early: the bankroll cannot cover the next required bet. Summary saved.';
            document.getElementById('simResultsHeading').focus();
        } catch (error) {
            status.textContent = error.name === 'AbortError' ? 'The request timed out. The server may have completed the run. Please try again shortly.' : error.message;
        } finally {
            clearTimeout(timer); fieldset.disabled = false; form.removeAttribute('aria-busy');
        }
    });
})();
