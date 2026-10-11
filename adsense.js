// Manual placements only; backend activation is blocked pending account/CMP review.
(() => {
    'use strict';
    for (const page of document.querySelectorAll('.learning-page')) {
        const placement = document.createElement('aside');
        placement.className = 'ad-placement';
        placement.hidden = true;
        placement.setAttribute('aria-label', 'Advertisements');
        const label = document.createElement('p');
        label.textContent = 'Advertisements';
        const unit = document.createElement('ins');
        unit.className = 'adsbygoogle';
        placement.append(label, unit);
        page.append(placement);
    }
    let config;
    let consent = false;
    let loading = false;
    let loaded = false;
    let failed = false;
    const place = () => {
        const eligible = ['/learn', '/glossary', '/charts'].includes(location.pathname);
        document.querySelectorAll('.ad-placement').forEach(ad => { ad.hidden = !eligible; });
        if (!eligible || !config?.enabled || !consent || failed) {
            document.querySelectorAll('.ad-placement').forEach(ad => { ad.hidden = true; });
            return;
        }
        const placement = document.querySelector('.learning-page:not([hidden]) .ad-placement');
        if (!placement) return;
        placement.hidden = false;
        if (!loaded) {
            if (loading) return;
            loading = true;
            const script = document.createElement('script');
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.publisher}`;
            script.onload = () => { loaded = true; place(); };
            script.onerror = () => { failed = true; }; // Keep reserved space; gameplay continues.
            document.head.append(script);
            return;
        }
        const unit = placement.querySelector('ins');
        if (unit.dataset.requested) return;
        unit.dataset.adClient = config.publisher;
        unit.dataset.adSlot = config.slot;
        unit.dataset.adFormat = 'auto';
        unit.dataset.fullWidthResponsive = 'true';
        unit.dataset.requested = 'true';
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
        catch { failed = true; }
    };
    // A reviewed certified CMP adapter must emit this only after consent permits ads.
    window.addEventListener('adsenseconsent', event => {
        consent = event.detail === true;
        if (!consent) document.querySelectorAll('.ad-placement').forEach(ad => { ad.hidden = true; });
        place();
    });
    window.addEventListener('publicpagechange', place);
    fetch('/adsense-config').then(response => {
        if (!response.ok) throw new Error('Ad configuration unavailable');
        return response.json();
    }).then(value => {
        if (!/^ca-pub-\d{16}$/.test(value.publisher) || !/^\d{10}$/.test(value.slot)) return;
        config = value;
        place();
    }).catch(() => {});
})();
