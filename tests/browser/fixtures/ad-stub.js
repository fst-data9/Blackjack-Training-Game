import helmet from '../../../backend/node_modules/helmet/index.mjs';
import { contentSecurityDirectives, withScriptNonce } from '../../../backend/content-security-policy.js';

// Fake public identifiers only. Every external request is intercepted locally.
export const adConfig = {
    enabled: true, publisher: 'ca-pub-0000000000000000',
    slots: { 'learning-end': '1111111111', 'learning-incontent': '2222222222', 'game-below-stats': '3333333333', 'review-summary': '4444444444' },
};

export async function stubAds(page, { config = adConfig, autoFill = true, failure = '', scriptGate, configGate, realConsent = false } = {}) {
    const errors = [];
    const violations = [];
    let loads = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('recordAdCspViolation', event => violations.push(event));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.recordAdCspViolation({ uri: event.blockedURI, directive: event.effectiveDirective })));
    let csp;
    const nonce = 'c2NyZWVuc2hvdC10ZXN0LW5vbmNl';
    helmet.contentSecurityPolicy({ directives: contentSecurityDirectives(config, false) })({}, { locals: { adSenseNonce: nonce }, setHeader: (_name, value) => { csp = value; } }, () => {});
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === 'http://127.0.0.1:3101') {
            if (url.pathname.startsWith('/api/')) return route.fulfill({ status: url.pathname === '/api/auth/me' ? 401 : 200, json: {} });
            if (url.pathname === '/adsense-config') {
                if (configGate) await configGate;
                return route.fulfill({ json: config });
            }
            // Placement tests inject consent explicitly. CMP integration tests
            // opt into the actual adapter and intercept Google's bootstrap too.
            if (url.pathname === '/consent.js' && !realConsent) return route.fulfill({ contentType: 'application/javascript', body: '' });
            if (request.resourceType() === 'document' && config.enabled) {
                const response = await route.fetch();
                return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp }, body: withScriptNonce(await response.text(), nonce) });
            }
            return route.continue();
        }
        if (url.hostname === 'pagead2.googlesyndication.com' && url.pathname === '/pagead/js/adsbygoogle.js') {
            loads++;
            if (scriptGate) await scriptGate;
            if (failure === 'script') return route.abort();
            return route.fulfill({ contentType: 'application/javascript', body: `
                window.cmpOrder?.push('ads:loaded');
                window.adStub = { requests: [], nonce: document.currentScript.nonce, fill(unit) {
                    const placeholder = document.createElement('div');
                    placeholder.style.cssText = 'height:280px;box-sizing:border-box;background:#e4e4e4;color:#333;display:grid;place-items:center;font:16px sans-serif';
                    placeholder.textContent = 'Placeholder advertisement';
                    unit.append(placeholder);
                    unit.dataset.adStatus = 'filled';
                }};
                window.adsbygoogle = { push() {
                    ${failure === 'push' ? "throw new Error('Stub request blocked');" : ''}
                    const unit = document.querySelector('ins[data-requested]:not([data-stub-handled])');
                    unit.dataset.stubHandled = 'true';
                    window.adStub.requests.push({ placement: unit.dataset.placement, slot: unit.dataset.adSlot, active: window.isBlackjackRoundActive(), path: location.pathname });
                    ${autoFill ? 'window.adStub.fill(unit);' : ''}
                }};
            ` });
        }
        // Block analytics, auth-provider resources and any unexpected ad URLs.
        return route.abort();
    });
    return { errors, violations, loads: () => loads };
}

export async function consent(page, granted = true) {
    await page.evaluate(value => window.dispatchEvent(new CustomEvent('adsenseconsent', { detail: value })), granted);
}

export async function dealAdTestHand(page) {
    await page.evaluate(() => {
        deck = ['10', '10', '6', '7'].map((rank, index) => ({ rank, suit: ['♠', '♥', '♦', '♣'][index] })).reverse();
        shoeNeedsShuffle = false;
        cutCardRemaining = 0;
    });
    await page.locator('#newGameBtn').click();
}
