import catalog from '../strategy-catalog.cjs';
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function renderStrategyGuide(id) {
  const entries = id ? catalog.entries.filter(entry => entry.id === id) : catalog.entries;
  return `<p>Betting systems choose your stake; playing strategies choose your action. Combine one of each in Simulation. These presets do not count cards or establish an advantage. Pros describe useful comparisons, not promises of profit.</p>

    ${id ? '<p><a href="/strategies">All strategies</a></p>' : '<h2>Choose a strategy to explore</h2>'}
    <div class="strategy-guide-grid">${entries.map(entry => `<article class="strategy-guide-card">
        <p class="strategy-origin">${escape(entry.kind === 'betting' ? 'Bet sizing' : 'Hand decisions')} · ${escape(entry.origin)}</p>
        <h2><a href="/strategies/${entry.id}">${escape(entry.name)}</a></h2>
        <h3>How it works</h3><p>${escape(entry.rules)}</p><p><strong>Example:</strong> ${escape(entry.example)}</p>
        <h3>Pros</h3><p>${escape(entry.pro)}</p><h3>Cons</h3><p>${escape(entry.con)}</p>
        ${entry.source ? `<p><a href="${escape(entry.source)}" target="_blank" rel="noopener noreferrer">Research source</a> · Reviewed 26 October 2026. Source results for other rules are not predictions for this simulator.</p>` : '<p>Created for this trainer as an experiment; not an established or validated gambling system.</p>'}
        <p><a href="/simulation" data-strategy-kind="${entry.kind}" data-strategy-id="${entry.id}">Try ${escape(entry.name)}</a></p>
    </article>`).join('')}</div>
    <details><summary>Shared simulator rules and table limits</summary><p>Simulator conventions: a unit is your base bet. Progressions use the complete round’s net result, including splits and insurance. They continue through cycles until the requested round count or an unaffordable bet. Opening bets are capped at the table limit. Martingale and D’Alembert update from the capped stake. Fibonacci stops advancing at the first sequence value reaching the cap, then moves back normally on profit; no hidden debt builds beyond the cap. Splits and doubles can add exposure. These adaptations differ from systems designed for even-money bets and fixed win goals.</p></details>
    <p>Choosing a preset keeps your other settings and custom decisions. Custom decisions take priority; use Reset to basic strategy to clear them and restore the basic playing preset. Insurance is controlled separately. An unavailable custom action falls back to the selected playing preset.</p>`;
}
