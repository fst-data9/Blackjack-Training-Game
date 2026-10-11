// Manual placements only; backend activation is blocked pending account/CMP review.
(() => {
    'use strict';
    const init = () => {
        const scriptNonce = document.querySelector('script[src="adsense.js"]')?.nonce || '';
        const game = document.getElementById('gamePage');
        const review = document.getElementById('reviewPage');
        const activeRound = () => window.isBlackjackRoundActive?.() === true;
        const learningIndex = container => location.pathname === `/${container.closest('.learning-page').dataset.placeholderContent}` && !container.closest('.learning-page').hidden;
        // One declaration per placement. Learning placements have one unit per
        // section; a mounted unit is never automatically refreshed on return.
        const definitions = [
            {
                key: 'learning-end', containers: () => [...document.querySelectorAll('.learning-page')],
                eligible: learningIndex, insert: (container, ad) => container.append(ad),
            },
            {
                key: 'learning-incontent', containers: () => [document.getElementById('learnContent'), document.getElementById('glossaryContent')],
                eligible: container => learningIndex(container) && (container.id === 'learnContent' || container.querySelectorAll('.glossary-card').length >= 9),
                insert: (container, ad) => (container.id === 'learnContent' ? container.querySelector('.lesson-grid') : container.querySelectorAll('.glossary-card')[7])?.after(ad),
            },
            {
                key: 'game-below-stats', containers: () => [game],
                eligible: () => location.pathname === '/' && !game.hidden && review.hidden,
                insert: (container, ad) => container.querySelector('.chart-stats').after(ad),
            },
            {
                key: 'review-summary', containers: () => [review],
                eligible: () => !review.hidden,
                insert: (_container, ad) => document.getElementById('reviewSummary').after(ad),
            },
        ];
        const entries = [];
        let config;
        let consent = false;
        let loading = false;
        let loaded = false;
        let failed = false;
        let scriptTimeout;

        const collapse = entry => {
            // Revoke visibility immediately, but defer removing game-page space
            // until between rounds. Ad callbacks never move layout during a hand.
            if (entry.key === 'game-below-stats' && activeRound() && !entry.ad.hidden) {
                entry.ad.dataset.suppressed = 'true';
            } else {
                entry.ad.hidden = true;
                delete entry.ad.dataset.suppressed;
            }
        };
        const fail = () => {
            failed = true;
            clearTimeout(scriptTimeout);
            entries.forEach(collapse);
        };
        const makePlacement = (definition, container) => {
            const ad = document.createElement('aside');
            ad.className = 'ad-placement';
            ad.dataset.placement = definition.key;
            ad.hidden = true;
            ad.setAttribute('aria-label', 'Advertisements');
            const label = document.createElement('p');
            label.textContent = 'Advertisements';
            const unit = document.createElement('ins');
            unit.className = 'adsbygoogle';
            unit.dataset.placement = definition.key;
            unit.dataset.adClient = config.publisher;
            unit.dataset.adSlot = config.slots[definition.key];
            unit.dataset.adFormat = 'auto';
            unit.dataset.fullWidthResponsive = 'true';
            ad.append(label, unit);
            const entry = { key: definition.key, container, ad, unit, unfilled: false };
            entries.push(entry);
            new MutationObserver(() => {
                if (unit.dataset.adStatus === 'unfilled') {
                    entry.unfilled = true;
                    collapse(entry);
                }
            }).observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
            return entry;
        };
        const load = () => {
            if (loading || loaded || failed) return;
            loading = true;
            const script = document.createElement('script');
            script.async = true;
            script.crossOrigin = 'anonymous';
            if (scriptNonce) script.nonce = scriptNonce;
            script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.publisher}`;
            script.onload = () => {
                clearTimeout(scriptTimeout);
                loaded = true;
                place();
            };
            script.onerror = fail;
            scriptTimeout = setTimeout(fail, 10000);
            document.head.append(script);
        };
        const place = () => {
            if (!config?.enabled || !consent || failed) {
                entries.forEach(collapse);
                return;
            }
            for (const definition of definitions) {
                if (!config.slots[definition.key]) continue;
                for (const container of definition.containers()) {
                    let entry = entries.find(candidate => candidate.key === definition.key && candidate.container === container);
                    // No game placement appears or is requested as a round ends.
                    // Loading/consent/navigation between rounds can prepare it.
                    if (definition.key === 'game-below-stats' && activeRound()) continue;
                    if (!definition.eligible(container)) {
                        if (entry) collapse(entry);
                        continue;
                    }
                    if (!entry) entry = makePlacement(definition, container);
                    if (entry.unfilled) continue;
                    definition.insert(container, entry.ad);
                    entry.ad.hidden = false; // Reserve the full unit before loading.
                    delete entry.ad.dataset.suppressed;
                    if (!loaded) { load(); continue; }
                    if (entry.unit.dataset.requested) continue;
                    entry.unit.dataset.requested = 'true';
                    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
                    catch { fail(); return; }
                }
            }
        };
        window.addEventListener('adsenseconsent', event => {
            consent = event.detail === true;
            place();
        });
        window.addEventListener('publicpagechange', place);
        window.addEventListener('glossaryresultschange', place);
        new MutationObserver(place).observe(review, { attributes: true, attributeFilter: ['hidden'] });
        // Observe the existing rendered state asynchronously; no ad calls are
        // introduced into game handlers, and settlement never requests an ad.
        new MutationObserver(() => {
            if (!activeRound()) entries.filter(entry => entry.ad.dataset.suppressed).forEach(collapse);
        }).observe(document.getElementById('newGameBtn'), { attributes: true, attributeFilter: ['disabled'] });
        fetch('/adsense-config').then(response => {
            if (!response.ok) throw new Error('Ad configuration unavailable');
            return response.json();
        }).then(value => {
            if (!/^ca-pub-\d{16}$/.test(value.publisher) || !value.slots || typeof value.slots !== 'object') return;
            config = { enabled: value.enabled === true, publisher: value.publisher, slots: {} };
            definitions.forEach(({ key }) => { config.slots[key] = /^\d{10}$/.test(value.slots[key]) ? value.slots[key] : ''; });
            window.BlackjackConsent?.start(config);
            place();
        }).catch(() => {});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
