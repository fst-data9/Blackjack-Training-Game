import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { adConfig, stubAds, consent, dealAdTestHand } from './fixtures/ad-stub.js';

const placement = (page, key) => page.locator(`aside[data-placement="${key}"]:visible`);
const requested = page => page.evaluate(() => window.adStub?.requests || []);

async function screenshot(page, name, testInfo) {
    if (!process.env.AD_SCREENSHOT_DIR) return;
    await mkdir(process.env.AD_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.AD_SCREENSHOT_DIR}/${testInfo.project.name.split('-')[0]}-${name}.jpg`, type: 'jpeg', quality: 85, fullPage: true });
}

async function assertLabel(ad) {
    await expect(ad).toHaveAttribute('aria-label', 'Advertisements');
    await expect(ad.locator('p')).toHaveText('Advertisements');
    expect((await ad.boundingBox()).height).toBeGreaterThanOrEqual(320);
}

test('all four placements use the correct slots, pages and positions; repeat navigation never refreshes units', async ({ page }, testInfo) => {
    const stub = await stubAds(page);
    await page.goto('/');
    await consent(page);
    const gameAd = placement(page, 'game-below-stats');
    await expect(gameAd.locator('[data-ad-status="filled"]')).toBeVisible();
    expect(await gameAd.evaluate(element => document.querySelector('.chart-stats').nextElementSibling === element && element.parentElement.id === 'gamePage')).toBe(true);
    await assertLabel(gameAd);
    await screenshot(page, 'practice', testInfo);
    await dealAdTestHand(page);
    await page.locator('#standBtn').click();
    await page.locator('#openReviewBtn').click();
    const reviewAd = placement(page, 'review-summary');
    await expect(reviewAd).toBeVisible();
    expect(await reviewAd.evaluate(element => document.getElementById('reviewSummary').nextElementSibling === element && element.nextElementSibling.id === 'reviewHands')).toBe(true);
    await assertLabel(reviewAd);
    await expect(gameAd).toBeHidden();
    await screenshot(page, 'review', testInfo);
    await page.locator('#closeReviewBtn').click();
    await expect(reviewAd).toBeHidden();
    for (const section of ['learn', 'glossary', 'charts']) {
        await page.locator(`.account-nav a[href="/${section}"]`).click();
        await expect(page).toHaveURL(new RegExp(`/${section}$`));
        const end = placement(page, 'learning-end');
        await expect(end).toHaveCount(1);
        expect(await end.evaluate(element => element.parentElement.lastElementChild === element && Boolean(document.querySelector('.topic-index').compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        await assertLabel(end);
        const incontent = placement(page, 'learning-incontent');
        if (section === 'charts') {
            await expect(incontent).toHaveCount(0);
        } else {
            await expect(incontent).toHaveCount(1);
            expect(await incontent.evaluate((element, section) => section === 'learn'
                ? element.previousElementSibling.classList.contains('lesson-grid') && element.nextElementSibling.classList.contains('learning-quiz')
                : [...element.parentElement.children].filter(child => child.classList.contains('glossary-card')).indexOf(element.previousElementSibling) === 7, section)).toBe(true);
            await assertLabel(incontent);
        }
        await expect(placement(page, 'game-below-stats')).toHaveCount(0);
        await expect(placement(page, 'review-summary')).toHaveCount(0);
        await screenshot(page, section, testInfo);
    }
    const requests = await requested(page);
    expect(requests.map(request => request.placement)).toEqual(['game-below-stats', 'review-summary', 'learning-end', 'learning-incontent', 'learning-end', 'learning-incontent', 'learning-end']);
    requests.forEach(request => { expect(request.slot).toBe(adConfig.slots[request.placement]); expect(request.active).toBe(false); });
    await page.locator('.account-nav a[href="/learn"]').click();
    await expect(placement(page, 'learning-incontent')).toBeVisible();
    expect(await requested(page)).toEqual(requests);
    expect(stub.loads()).toBe(1);
    expect(stub.errors).toEqual([]);
    expect(stub.violations).toEqual([]);
    expect(await page.evaluate(() => window.adStub.nonce)).toBe('c2NyZWVuc2hvdC10ZXN0LW5vbmNl');
    await page.locator('.topic-index a').first().click();
    await expect(page).toHaveURL(/\/learn\/meet-the-table$/);
    await expect(page.locator('.ad-placement:visible')).toHaveCount(0);
    expect(await requested(page)).toEqual(requests);
});

for (const width of [375, 768, 1280]) {
    test(`practice ad is below every game control, table, stats and result overlay at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const stub = await stubAds(page);
        await page.goto('/');
        await consent(page);
        const ad = placement(page, 'game-below-stats');
        await expect(ad).toBeVisible();
        const verifySpacing = async () => {
            const geometry = await page.evaluate(() => {
                const box = document.querySelector('aside[data-placement="game-below-stats"]').getBoundingClientRect();
                const elements = [...document.querySelectorAll('#gamePage button, #gamePage input, #gamePage select, #dealerCards, #playerHandsUI, .chart-stats, .stats-panel, #roundResult')].filter(element => !element.hidden && element.getClientRects().length);
                return { adTop: box.top, lowest: Math.max(...elements.map(element => element.getBoundingClientRect().bottom)), siblings: document.querySelector('.chart-stats').nextElementSibling.dataset.placement };
            });
            expect(geometry.adTop - geometry.lowest).toBeGreaterThanOrEqual(150);
            expect(geometry.siblings).toBe('game-below-stats');
        };
        await verifySpacing();
        await dealAdTestHand(page);
        await verifySpacing();
        await page.locator('#standBtn').click();
        await verifySpacing();
        expect(stub.violations).toEqual([]);
        expect(stub.errors).toEqual([]);
    });
}

test('glossary insertion follows the first eight results and collapses for short searches or categories', async ({ page }) => {
    await stubAds(page);
    await page.goto('/glossary');
    await consent(page);
    const ad = placement(page, 'learning-incontent');
    await expect(ad).toBeVisible();
    await page.locator('#glossarySearch').fill('Soft hand');
    await expect(ad).toBeHidden();
    await expect(page.locator('.glossary-card')).toHaveCount(1);
    await page.locator('#glossarySearch').fill('');
    await expect(ad).toBeVisible();
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await expect(ad).toBeHidden();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(ad).toBeVisible();
    expect(await ad.evaluate(element => element.previousElementSibling.dataset.topic)).toBe('das');
    expect((await requested(page)).filter(request => request.placement === 'learning-incontent')).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const condition of ['disabled', 'no consent', 'script failure', 'request failure', 'missing slots']) {
    test(`${condition}: no visible placements and gameplay works`, async ({ page }) => {
        const config = condition === 'disabled' ? { ...adConfig, enabled: false } : condition === 'missing slots' ? { ...adConfig, slots: {} } : adConfig;
        const stub = await stubAds(page, { config, failure: condition === 'script failure' ? 'script' : condition === 'request failure' ? 'push' : '' });
        await page.goto('/');
        if (condition !== 'no consent') await consent(page);
        if (condition.endsWith('failure')) await expect.poll(stub.loads).toBe(1);
        await expect(page.locator('.ad-placement:visible')).toHaveCount(0);
        await dealAdTestHand(page);
        await expect(page.locator('#standBtn')).toBeEnabled();
        await page.locator('#standBtn').click();
        await expect(page.locator('#newGameBtn')).toBeEnabled();
        await expect(page.locator('#statsHands')).toHaveText('1');
        await expect(page.locator('.ad-placement:visible')).toHaveCount(0);
        if (['disabled', 'no consent', 'missing slots'].includes(condition)) expect(stub.loads()).toBe(0);
        expect(stub.errors).toEqual([]);
    });
}

test('configuration arriving during a round neither loads nor requests a game ad, including on settlement', async ({ page }) => {
    let release;
    const configGate = new Promise(resolve => { release = resolve; });
    const stub = await stubAds(page, { configGate });
    await page.goto('/');
    await dealAdTestHand(page);
    await consent(page);
    const configResponse = page.waitForResponse('**/adsense-config');
    release();
    await (await configResponse).finished();
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    await expect.poll(async () => page.evaluate(() => document.querySelectorAll('script[src*="googlesyndication"]').length)).toBe(0);
    await page.locator('#standBtn').click();
    await expect(page.locator('#newGameBtn')).toBeEnabled();
    expect(stub.loads()).toBe(0);
    expect(await requested(page)).toEqual([]);
    await expect(page.locator('.ad-placement:visible')).toHaveCount(0);
    await page.locator('.account-nav a[href="/learn"]').click();
    await expect(placement(page, 'learning-end')).toBeVisible();
    await page.locator('.account-nav a[href="/"]').click();
    await expect(placement(page, 'game-below-stats')).toBeVisible();
    await expect.poll(async () => (await requested(page)).filter(request => request.placement === 'game-below-stats').length).toBe(1);
    expect((await requested(page)).every(request => !request.active)).toBe(true);
});

test('a script finishing during a hand defers the game unit; filling reserved slots does not move content', async ({ page }) => {
    let release;
    const scriptGate = new Promise(resolve => { release = resolve; });
    const stub = await stubAds(page, { scriptGate, autoFill: false });
    await page.goto('/');
    await consent(page);
    await expect(placement(page, 'game-below-stats')).toBeVisible();
    await dealAdTestHand(page);
    const before = await page.locator('.chart-stats').boundingBox();
    release();
    await expect.poll(async () => page.evaluate(() => Boolean(window.adStub))).toBe(true);
    expect(await requested(page)).toEqual([]);
    await page.locator('#standBtn').click();
    expect(await requested(page)).toEqual([]);
    await page.locator('.account-nav a[href="/learn"]').click();
    await expect.poll(async () => (await requested(page)).length).toBe(2);
    const quizBefore = await page.locator('.learning-quiz').boundingBox();
    const indexBefore = await page.locator('.topic-index').boundingBox();
    await page.evaluate(() => document.querySelectorAll('ins[data-requested]').forEach(unit => window.adStub.fill(unit)));
    await expect(page.locator('ins[data-ad-status="filled"]:visible')).toHaveCount(2);
    expect(await page.locator('.learning-quiz').boundingBox()).toEqual(quizBefore);
    expect(await page.locator('.topic-index').boundingBox()).toEqual(indexBefore);
    await page.locator('.account-nav a[href="/"]').click();
    await expect.poll(async () => (await requested(page)).length).toBe(3);
    await dealAdTestHand(page);
    const controlsBefore = await page.locator('.action-controls').boundingBox();
    const statsBefore = await page.locator('.chart-stats').boundingBox();
    const adBefore = await placement(page, 'game-below-stats').boundingBox();
    await page.evaluate(() => window.adStub.fill(document.querySelector('#gamePage ins')));
    expect(await page.locator('.action-controls').boundingBox()).toEqual(controlsBefore);
    expect(await page.locator('.chart-stats').boundingBox()).toEqual(statsBefore);
    expect(await placement(page, 'game-below-stats').boundingBox()).toEqual(adBefore);
    expect(before.width).toBeGreaterThan(0);
    expect(stub.violations).toEqual([]);
});

test('unfilled and revoked units collapse; game space only collapses between rounds', async ({ page }) => {
    await stubAds(page);
    await page.goto('/learn');
    await consent(page);
    const mid = placement(page, 'learning-incontent');
    await expect(mid).toBeVisible();
    const quizBefore = await page.locator('.learning-quiz').boundingBox();
    await page.evaluate(() => document.querySelector('#learnContent ins').dataset.adStatus = 'unfilled');
    await expect(mid).toBeHidden();
    expect((await page.locator('.learning-quiz').boundingBox()).y).toBeLessThan(quizBefore.y - 320);
    await page.locator('.account-nav a[href="/"]').click();
    const ad = page.locator('#gamePage .ad-placement');
    await expect(ad).toBeVisible();
    await dealAdTestHand(page);
    const before = await ad.boundingBox();
    await consent(page, false);
    await expect(ad).toBeHidden();
    expect(await ad.evaluate(element => ({ top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height }))).toEqual({ top: before.y, height: before.height });
    await page.locator('#standBtn').click();
    await expect(ad).toHaveAttribute('hidden', '');
    expect(await requested(page)).toHaveLength(3);
});

test('script failure during a hand hides the game slot without moving layout or blocking play', async ({ page }) => {
    let release;
    const scriptGate = new Promise(resolve => { release = resolve; });
    await stubAds(page, { scriptGate, failure: 'script' });
    await page.goto('/');
    await consent(page);
    const ad = page.locator('#gamePage .ad-placement');
    await expect(ad).toBeVisible();
    await dealAdTestHand(page);
    const before = await ad.boundingBox();
    release();
    await expect(ad).toHaveAttribute('data-suppressed', 'true');
    await expect(ad).toBeHidden();
    expect(await ad.evaluate(element => element.getBoundingClientRect().height)).toBe(before.height);
    await expect(page.locator('#standBtn')).toBeEnabled();
    await page.locator('#standBtn').click();
    await expect(ad).toHaveAttribute('hidden', '');
    await expect(page.locator('#newGameBtn')).toBeEnabled();
    expect(await requested(page)).toEqual([]);
});

test('the real server keeps the backend gate and advertising CSP disabled', async ({ request }) => {
    const config = await (await request.get('/adsense-config')).json();
    expect(config.enabled).toBe(false);
    expect(Object.keys(config.slots)).toEqual(Object.keys(adConfig.slots));
    const response = await request.get('/');
    expect(response.headers()['content-security-policy']).not.toMatch(/googlesyndication|doubleclick|googleadservices|nonce-|strict-dynamic|unsafe-eval/);
    expect(await response.text()).not.toMatch(/<script[^>]+src="https?:\/\/[^\"]*(?:googlesyndication|doubleclick)/);
});
