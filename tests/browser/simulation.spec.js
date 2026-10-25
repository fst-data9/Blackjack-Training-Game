import { test, expect } from '@playwright/test';
import { simulate } from '../../backend/simulation-engine.js';

test.beforeEach(async ({ page }) => {
    page.errors = [];
    page.on('pageerror', error => page.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/me') return route.fulfill({ status: 401, json: { error: 'Not signed in' } });
        return route.fulfill({ json: {} });
    });
});
test.afterEach(async ({ page }) => expect(page.errors).toEqual([]));

test('customize, simulate, render accessible charts and retain settings on navigation', async ({ page }) => {
    await page.route('**/api/simulations', async route => {
        const config = route.request().postDataJSON();
        expect(config.overrides['hard:16:10']).toBe('stand');
        expect(config.betting).toBe('martingale');
        expect(config.bankroll).toBe(1000000);
        await route.fulfill({ status: 201, json: { id: 'test-run', seed: 42, engineVersion: 1, config, result: simulate(config, 42) } });
    });
    await page.goto('/simulation');
    await expect(page.locator('#simulationHeading')).toBeVisible();
    await page.locator('#simBetting').selectOption('martingale');
    await page.getByText('2. Customize hand decisions', { exact: true }).click();
    await page.locator('#simHand').selectOption('16');
    await page.locator('#simDealer').selectOption('10');
    await page.locator('#simAction').selectOption('stand');
    await page.locator('#simSaveAction').click();
    await expect(page.locator('#simOverrides')).toContainText('hard 16 vs 10: Stand');
    await page.locator('#simRun').click();
    await expect(page.locator('#simulationResults')).toBeVisible();
    await expect(page.locator('#simResultsHeading')).toBeFocused();
    await expect(page.locator('#simRunId')).toContainText('Saved run test-run');
    await expect(page.locator('#simProfitChart polyline')).toHaveAttribute('points', /,/);
    await expect(page.locator('#simOutcomeChart meter')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Practice', exact: false }).first().click();
    await expect(page.locator('#gamePage')).toBeVisible();
    await page.getByRole('link', { name: 'Simulation', exact: false }).click();
    await expect(page.locator('#simOverrides')).toContainText('hard 16 vs 10: Stand');
    await expect(page.locator('#simulationResults')).toBeVisible();
    await page.locator('#simResetStrategy').click();
    await expect(page.locator('#simOverrideCount')).toContainText('0 custom');
});

test('validation, busy/error recovery and double submission prevention', async ({ page }) => {
    let requests = 0;
    let release;
    await page.route('**/api/simulations', async route => {
        requests++;
        await new Promise(resolve => { release = resolve; });
        await route.fulfill({ status: 503, json: { error: 'Simulation servers are busy. Please try again shortly.' } });
    });
    await page.goto('/simulation');
    await page.locator('#simBaseBet').fill('10001');
    await page.locator('#simRun').click();
    await expect(page.locator('#simulationStatus')).toContainText('Base bet must fit');
    expect(requests).toBe(0);
    await page.locator('#simBaseBet').fill('10');
    await page.locator('#simRun').click();
    await expect(page.locator('#simRun')).toBeDisabled();
    await expect.poll(() => requests).toBe(1);
    release();
    await expect(page.locator('#simulationStatus')).toContainText('servers are busy');
    await expect(page.locator('#simRun')).toBeEnabled();
    await expect(page.locator('#simulationResults')).toBeHidden();
});

test('simulation navigation preserves an active practice round', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        deck = ['10', '6', '7', '10'].map(rank => ({ rank, suit: '♠' })).reverse();
        shoeNeedsShuffle = false; cutCardRemaining = 0;
    });
    await page.locator('#newGameBtn').click();
    const before = await page.locator('#playerHandsUI').innerHTML();
    await page.getByRole('link', { name: 'Simulation', exact: false }).click();
    await expect(page.locator('#simulationHeading')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#gamePage')).toBeVisible();
    expect(await page.locator('#playerHandsUI').innerHTML()).toBe(before);
});


test('early stop reports actual rounds and a saved summary', async ({ page }) => {
    await page.route('**/api/simulations', async route => {
        const config = route.request().postDataJSON();
        const result = simulate(config, 1);
        expect(result.stopReason).toBe('insufficient_bankroll');
        await route.fulfill({ status: 201, json: { id: 'early-run', seed: 1, engineVersion: 1, config, result } });
    });
    await page.goto('/simulation');
    await page.locator('#simBankroll').fill('10');
    await page.locator('#simRounds').selectOption('100000');
    await page.locator('#simBetting').selectOption('martingale');
    await page.locator('#simRun').click();
    await expect(page.locator('#simulationStatus')).toContainText('Stopped early');
    await expect(page.locator('#simCompleted')).not.toHaveText('100,000 / 100,000');
    await expect(page.locator('#simRunId')).toContainText('Saved run early-run');
});
