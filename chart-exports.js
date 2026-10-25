(() => {
    // Render the same drawing commands to SVG and canvas: no remote image,
    // HTML screenshot, third-party service, or additional API request needed.
    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    const csv = rows => '\uFEFF' + rows.map(row => row.map(value => {
        let text = String(value ?? '');
        // Protect spreadsheet exports if future metadata accepts user text.
        if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
    }).join(',')).join('\r\n');
    function scene(title, subtitles, height = 700) {
        const chart = { width: 1200, height, commands: [] };
        chart.rect = (x, y, w, h, fill) => chart.commands.push({ tag: 'rect', x, y, w, h, fill });
        chart.text = (x, y, text, size = 18, fill = '#e1eae4', anchor = 'start') => chart.commands.push({ tag: 'text', x, y, text: String(text), size, fill, anchor });
        chart.line = (points, stroke = '#78988a', width = 1) => chart.commands.push({ tag: 'line', points, stroke, width });
        chart.rect(0, 0, 1200, height, '#103524');
        chart.text(40, 48, title, 28, '#fff4cf');
        subtitles.forEach((text, i) => chart.text(40, 82 + i * 24, text, 16));
        return chart;
    }
    function svg(chart) {
        const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
        const elements = chart.commands.map(command => {
            if (command.tag === 'rect') return `<rect x="${command.x}" y="${command.y}" width="${command.w}" height="${command.h}" fill="${command.fill}"/>`;
            if (command.tag === 'text') return `<text x="${command.x}" y="${command.y}" font-size="${command.size}" fill="${command.fill}" text-anchor="${command.anchor}">${escape(command.text)}</text>`;
            return `<polyline points="${command.points.map(point => point.join(',')).join(' ')}" stroke="${command.stroke}" stroke-width="${command.width}" fill="none"/>`;
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${chart.width}" height="${chart.height}" viewBox="0 0 ${chart.width} ${chart.height}" font-family="Arial, sans-serif"><title>${escape(chart.commands.find(command => command.tag === 'text').text)}</title>${elements.join('')}</svg>`;
    }
    async function saveChart(chart, format, filename) {
        if (format === 'svg') { download(new Blob([svg(chart)], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`); return; }
        const canvas = document.createElement('canvas');
        canvas.width = chart.width * 2; canvas.height = chart.height * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Image export is unavailable in this browser. Try SVG.');
        ctx.scale(2, 2);
        for (const command of chart.commands) {
            if (command.tag === 'rect') { ctx.fillStyle = command.fill; ctx.fillRect(command.x, command.y, command.w, command.h); }
            else if (command.tag === 'text') {
                ctx.fillStyle = command.fill; ctx.font = `${command.size}px Arial, sans-serif`;
                ctx.textAlign = command.anchor === 'end' ? 'right' : command.anchor === 'middle' ? 'center' : 'left';
                ctx.fillText(command.text, command.x, command.y);
            } else {
                ctx.strokeStyle = command.stroke; ctx.lineWidth = command.width; ctx.beginPath();
                command.points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.stroke();
            }
        }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Unable to create image. Try SVG.');
        download(blob, `${filename}.png`);
    }
    const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
    const name = id => window.BlackjackStrategies.entries.find(entry => entry.id === id)?.name || id;
    function simulationChart(run, kind) {
        const { config, result } = run;
        const chart = scene(kind === 'profit' ? 'Blackjack simulation · cumulative profit / loss' : 'Blackjack simulation · round outcomes', [
            `${name(config.betting)} · ${name(config.playing || 'basic')} · ${Object.keys(config.overrides).length} custom decisions · Insurance ${config.insurance ? 'on' : 'off'}`,
            `Start ${money(config.bankroll)} · Base ${money(config.baseBet)} · Limit ${money(config.tableLimit)} · ${result.roundsPlayed.toLocaleString()} / ${config.rounds.toLocaleString()} rounds`,
            `Net ${money(result.profit)} · Final ${money(result.finalBankroll)} · Drawdown ${money(result.maxDrawdown)} · ${result.stopReason === 'completed' ? 'Completed' : 'Stopped: next bet unaffordable'}`,
        ]);
        if (kind === 'profit') {
            const values = result.points.map(point => point.profit);
            const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 100;
            const x = round => 160 + round / Math.max(1, result.roundsPlayed) * 990;
            const y = value => 550 - (value - min) / range * 340;
            for (const value of [...new Set([min, 0, max])]) {
                chart.line([[160, y(value)], [1150, y(value)]]);
                chart.text(145, y(value) + 6, money(value), 18, '#e1eae4', 'end');
            }
            chart.line(result.points.map(point => [x(point.round), y(point.profit)]), '#f2ce76', 2);
            chart.text(160, 580, '0'); chart.text(1150, 580, `${result.roundsPlayed.toLocaleString()} rounds`, 18, '#e1eae4', 'end');
            chart.text(40, 625, 'Sampled round boundaries; intervening peaks may be omitted. Drawdown uses every completed round.', 16);
        } else {
            ['profit', 'loss', 'even'].forEach((key, i) => {
                const y = 230 + i * 100, count = result.roundOutcomes[key];
                chart.text(40, y + 24, `${{ profit: 'Profitable', loss: 'Losing', even: 'Break-even' }[key]}: ${count.toLocaleString()}`);
                chart.rect(300, y, 830, 40, '#294e3d');
                chart.rect(300, y, 830 * count / Math.max(1, result.roundsPlayed), 40, ['#7dd8a6', '#f2a191', '#f2ce76'][i]);
            });
            chart.text(40, 580, 'Each round includes all split hands and insurance; counts are not individual hand outcomes.', 16);
        }
        chart.text(40, 655, `Run ${run.id} · engine ${run.engineVersion} · seed ${run.seed}`, 16);
        chart.text(40, 680, 'Six decks · S17 · up to four split hands · whole-dollar half-bet rounding. One run is not a profit forecast.', 16);
        return chart;
    }
    function resultsCSV(run) {
        const rows = [['record', 'metric', 'round', 'value', 'unit']];
        const add = (group, metric, value, unit = '') => rows.push([group, metric, '', value, unit]);
        for (const key of ['id', 'engineVersion', 'seed']) add('run', key, run[key]);
        add('run', 'monetary_units', 'integer USD cents');
        add('rules', 'rules', 'Six decks; S17; 4 split hands; split aces playable; whole-dollar half-bet rounding');
        for (const [key, value] of Object.entries(run.config)) {
            if (key === 'overrides') for (const [hand, action] of Object.entries(value)) add('override', hand, action);
            else add('settings', key, value, ['bankroll', 'baseBet', 'tableLimit'].includes(key) ? 'USD cents' : '');
        }
        for (const [key, value] of Object.entries(run.result)) {
            if (['points', 'outcomes', 'roundOutcomes'].includes(key)) continue;
            add('summary', key, value, ['totalWagered', 'maxDrawdown', 'largestBet', 'finalBankroll', 'profit'].includes(key) ? 'USD cents' : '');
        }
        for (const group of ['outcomes', 'roundOutcomes']) for (const [key, value] of Object.entries(run.result[group])) add(group, key, value, 'count');
        for (const point of run.result.points) rows.push(['sample', 'cumulative_profit', point.round, point.profit, 'USD cents']);
        return csv(rows);
    }
    async function handle(button, status, action) {
        button.disabled = true; status.textContent = 'Preparing download…';
        try { await action(); status.textContent = 'Download prepared.'; }
        catch (error) { status.textContent = error.message || 'Download failed. Please try again.'; }
        finally { button.disabled = false; }
    }
    window.BlackjackExports = { download, csv, scene, saveChart, simulationChart, resultsCSV, handle };
})();
