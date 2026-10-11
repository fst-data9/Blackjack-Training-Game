import { test, expect } from '@playwright/test';
import { adConfig, stubAds, dealAdTestHand } from './fixtures/ad-stub.js';

async function stubCmp(page, { enabled = true, mode = 'working' } = {}) {
    const ads = await stubAds(page, { config: { ...adConfig, enabled }, realConsent: true });
    const requests = [];
    await page.addInitScript(() => {
        window.cmpOrder = [];
        window.consentEvents = [];
        window.addEventListener('adsenseconsent', event => {
            window.consentEvents.push(event.detail);
            window.cmpOrder.push('consent:' + event.detail);
        });
    });
    await page.route('https://fundingchoicesmessages.google.com/**', async route => {
        requests.push(route.request().url());
        if (mode === 'blocked') return route.abort();
        if (mode === 'silent' || mode === 'unpublished') return route.fulfill({ contentType: 'application/javascript', body: '' });
        return route.fulfill({ contentType: 'application/javascript', body: `
            window.cmpOrder.push('cmp:loaded');
            let listener;
            window.cmpStub = {
                calls: [], reopens: 0, nonce: document.currentScript.nonce,
                emit(data, success = true) {
                    listener({ cmpStatus: 'loaded', gdprApplies: true, eventStatus: 'cmpuishown', tcString: '', ...data }, success);
                }
            };
            window.__tcfapi = (command, version, callback) => {
                window.cmpStub.calls.push([command, version]);
                ${mode === 'throws' ? "throw new Error('Fake unavailable CMP');" : ''}
                listener = callback;
                window.cmpStub.emit({});
            };
            window.googlefc.showRevocationMessage = () => {
                window.cmpStub.reopens++;
                window.cmpStub.emit({});
            };
            const pending = window.googlefc.callbackQueue;
            window.googlefc.callbackQueue = { push(entry) { entry.CONSENT_API_READY?.(); } };
            pending.forEach(entry => window.googlefc.callbackQueue.push(entry));
        ` });
    });
    return { ads, requests };
}

test('ads disabled: no CMP requests, marker or banner on practice, learning or privacy', async ({ page }) => {
    const stub = await stubCmp(page, { enabled: false });
    for (const path of ['/', '/learn', '/privacy']) {
        await page.goto(path);
        await expect(page.locator('#privacySettingsLink')).toBeVisible();
        expect(await page.evaluate(() => window.googlefc)).toBeUndefined();
        await expect(page.locator('script[src*="fundingchoices"], iframe[name="googlefcPresent"], .fc-consent-root')).toHaveCount(0);
    }
    await page.locator('#privacySettingsLink').click();
    await expect(page).toHaveURL(/\/privacy#cookie-settings$/);
    await expect(page.locator('#cookie-settings')).toBeVisible();
    expect(stub.requests).toEqual([]);
    expect(stub.ads.loads()).toBe(0);
    expect(stub.ads.errors).toEqual([]);
    expect(stub.ads.violations).toEqual([]);
});

for (const choice of ['tcloaded', 'useractioncomplete', 'outside GDPR']) {
    test(`${choice}: CMP precedes the ad script and TC readiness permits ads`, async ({ page }) => {
        const stub = await stubCmp(page);
        await page.goto('/learn');
        await expect.poll(() => page.evaluate(() => window.cmpStub?.calls)).toEqual([['addEventListener', 2]]);
        expect(stub.requests).toEqual(['https://fundingchoicesmessages.google.com/i/pub-0000000000000000?ers=1']);
        expect(stub.ads.loads()).toBe(0);
        await expect(page.locator('script[src*="adsbygoogle.js"]')).toHaveCount(0);
        await page.evaluate(choice => window.cmpStub.emit(choice === 'outside GDPR'
            ? { gdprApplies: false, cmpStatus: undefined, eventStatus: undefined, tcString: undefined }
            : { eventStatus: choice, tcString: 'FAKE_TC_STRING', purpose: { consents: { 1: false } } }), choice);
        await expect(page.locator('aside[data-placement="learning-end"] ins')).toHaveAttribute('data-ad-status', 'filled');
        expect(await page.evaluate(() => window.consentEvents)).toEqual([false, true]);
        const order = await page.evaluate(() => window.cmpOrder);
        expect(order.indexOf('cmp:loaded')).toBeLessThan(order.indexOf('consent:true'));
        expect(order.indexOf('consent:true')).toBeLessThan(order.indexOf('ads:loaded'));
        expect(await page.evaluate(() => window.cmpStub.nonce)).toBe('c2NyZWVuc2hvdC10ZXN0LW5vbmNl');
        expect(stub.ads.loads()).toBe(1);
        expect(stub.ads.errors).toEqual([]);
        expect(stub.ads.violations).toEqual([]);
    });
}

test('a visitor can take longer than the loading timeout to make a choice', async ({ page }) => {
    await page.clock.install();
    const stub = await stubCmp(page);
    await page.goto('/learn');
    await expect.poll(() => page.evaluate(() => window.cmpStub?.calls.length)).toBe(1);
    await page.clock.fastForward(10000);
    expect(stub.ads.loads()).toBe(0);
    await page.evaluate(() => window.cmpStub.emit({ eventStatus: 'useractioncomplete', tcString: 'FAKE_TC_STRING' }));
    await expect(page.locator('.ad-placement:visible')).toHaveCount(2);
    await expect.poll(stub.ads.loads).toBe(1);
});

test('the visible footer link reopens Google choices through its queue and pauses ads', async ({ page }) => {
    const stub = await stubCmp(page);
    await page.goto('/learn');
    await expect.poll(() => page.evaluate(() => window.cmpStub?.calls.length)).toBe(1);
    await page.evaluate(() => window.cmpStub.emit({ eventStatus: 'tcloaded', tcString: 'FAKE_TC_STRING' }));
    await expect(page.locator('.ad-placement:visible')).toHaveCount(2);
    await page.locator('#privacySettingsLink').click();
    await expect(page).toHaveURL(/\/learn$/);
    expect(await page.evaluate(() => window.cmpStub.reopens)).toBe(1);
    await expect(page.locator('.ad-placement:visible')).toHaveCount(0);
    expect(await page.evaluate(() => window.consentEvents)).toEqual([false, true, false]);
    await page.evaluate(() => window.cmpStub.emit({ eventStatus: 'useractioncomplete', tcString: 'FAKE_NEW_TC_STRING' }));
    await expect(page.locator('.ad-placement:visible')).toHaveCount(2);
    expect(stub.ads.loads()).toBe(1);
    expect(stub.ads.errors).toEqual([]);
    expect(stub.ads.violations).toEqual([]);
});

for (const mode of ['blocked', 'silent', 'unpublished', 'throws']) {
    test(`${mode} CMP: fails closed while gameplay, accounts and learning remain usable`, async ({ page }) => {
        await page.clock.install();
        const stub = await stubCmp(page, { mode });
        await page.goto('/');
        await expect.poll(() => stub.requests.length).toBe(1);
        await page.clock.fastForward(6000);
        await expect.poll(() => page.evaluate(() => window.consentEvents)).toEqual([false]);
        expect(stub.ads.loads()).toBe(0);
        await expect(page.locator('.ad-placement:visible')).toHaveCount(0);
        await dealAdTestHand(page);
        await page.locator('#standBtn').click();
        await expect(page.locator('#newGameBtn')).toBeEnabled();
        await expect(page.locator('#statsHands')).toHaveText('1');
        await page.locator('#openAuthBtn').click();
        await expect(page.locator('#authOverlay')).toBeVisible();
        await page.locator('#closeAuthBtn').click();
        await page.locator('.account-nav a[href="/learn"]').click();
        await expect(page.locator('.learning-quiz')).toBeVisible();
        await page.locator('#privacySettingsLink').click();
        await expect(page).toHaveURL(/\/privacy#cookie-settings$/);
        await expect(page.locator('#privacyHeading')).toBeVisible();
        expect(stub.ads.errors).toEqual([]);
        expect(stub.ads.violations).toEqual([]);
    });
}

test('privacy renders without JavaScript, has canonical metadata and appears in sitemap and footer', async ({ browser, request }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: testInfo.project.use.viewport });
    try {
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:3101/privacy');
        await expect(page).toHaveTitle('Privacy Policy | Blackjack Trainer');
        await expect(page.locator('#privacyHeading')).toBeVisible();
        await expect(page.locator('#gamePage')).toBeHidden();
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://blackjack-trainer.co/privacy');
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://blackjack-trainer.co/privacy');
        await expect(page.locator('#privacyContent')).toContainText('{{CONTACT_EMAIL}}');
        for (const heading of ['Accounts and sign-in', 'Practice sessions and statistics', 'Cloudflare Web Analytics', 'Google AdSense and advertising cookies', 'Contact and your information']) {
            await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        }
        await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
        await expect(page.locator('.breadcrumbs li')).toHaveText(['Home', 'Privacy policy']);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://blackjack-trainer.co/privacy</loc>');
        expect(await (await request.get('/')).text()).toContain('<a href="/privacy">Privacy policy</a>');
    } finally { await context.close(); }
});

test('privacy navigation preserves an active hand and never creates a privacy ad placement', async ({ page }) => {
    const stub = await stubCmp(page);
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.cmpStub?.calls.length)).toBe(1);
    await dealAdTestHand(page);
    const hand = await page.locator('#playerHandsUI').textContent();
    await page.evaluate(() => { window.privacyNavigationSentinel = 'same document'; });
    await page.locator('footer a[href="/privacy"]').click();
    await expect(page.locator('#privacyHeading')).toBeVisible();
    await page.evaluate(() => window.cmpStub.emit({ eventStatus: 'tcloaded', tcString: 'FAKE_TC_STRING' }));
    await expect(page.locator('.privacy-page .ad-placement')).toHaveCount(0);
    expect(stub.ads.loads()).toBe(0);
    expect(await page.evaluate(() => window.privacyNavigationSentinel)).toBe('same document');
    await page.locator('.breadcrumbs a[href="/"]').click();
    await expect(page.locator('#standBtn')).toBeEnabled();
    expect(await page.locator('#playerHandsUI').textContent()).toBe(hand);
    await page.locator('#standBtn').click();
    await expect(page.locator('#newGameBtn')).toBeEnabled();
    expect(stub.ads.loads()).toBe(0);
    expect(stub.ads.errors).toEqual([]);
});

test('the settings fallback preserves an active hand when ads are disabled', async ({ page }) => {
    const stub = await stubCmp(page, { enabled: false });
    await page.goto('/');
    await dealAdTestHand(page);
    const hand = await page.locator('#playerHandsUI').textContent();
    await page.evaluate(() => { window.privacyNavigationSentinel = 'same document'; });
    await page.locator('#privacySettingsLink').click();
    await expect(page).toHaveURL(/\/privacy#cookie-settings$/);
    await expect(page.locator('#cookie-settings')).toBeInViewport();
    expect(await page.evaluate(() => window.privacyNavigationSentinel)).toBe('same document');
    await page.goBack();
    await expect(page.locator('#standBtn')).toBeEnabled();
    expect(await page.locator('#playerHandsUI').textContent()).toBe(hand);
    await page.goForward();
    await expect(page.locator('#cookie-settings')).toBeInViewport();
    await page.locator('.breadcrumbs a[href="/"]').click();
    await page.locator('#standBtn').click();
    await expect(page.locator('#newGameBtn')).toBeEnabled();
    expect(stub.requests).toEqual([]);
    expect(stub.ads.errors).toEqual([]);
    expect(stub.ads.violations).toEqual([]);
});
