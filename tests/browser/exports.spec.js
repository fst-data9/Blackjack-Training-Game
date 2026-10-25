import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { simulate } from '../../backend/simulation-engine.js';
import catalog from '../../strategy-catalog.cjs';

test.beforeEach(async ({ page }) => {
    page.errors = [];
    page.on('pageerror', error => page.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /Content Security Policy/.test(message.text())) page.errors.push(message.text()); });
    page.runs = 0;
    await page.route('**/api/**', async route => {
        if (route.request().url().endsWith('/simulations')) {
            page.runs++;
            const config = route.request().postDataJSON();
            return route.fulfill({ status: 201, json: { id: 'export-test', seed: 42, engineVersion: 3, config, result: simulate(config, 42) } });
        }
        return route.fulfill({ json: {} });
    });
});
test.afterEach(async ({ page }) => expect(page.errors).toEqual([]));

async function download(page, id, extension) {
    const pending = page.waitForEvent('download');
    await page.locator(`#${id}`).click();
    const file = await pending;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    expect(await file.failure()).toBeNull();
    return fs.readFile(await file.path());
}
function verifyPNG(bytes) {
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(2400);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(500);
    expect(bytes.length).toBeGreaterThan(10000);
}

test('guide has sourced preset details and selects presets without losing custom work', async ({ page, request }) => {
    for (const entry of catalog.entries) {
        const response = await request.get(`/strategies/${entry.id}`);
        expect(response.ok()).toBe(true);
        const html = await response.text();
        expect(html).toContain('<h3>Pros</h3>'); expect(html).toContain('<h3>Cons</h3>');
        expect(html).toContain(entry.source || 'Original experiment');
        expect(html).toContain(`https://blackjack-trainer.co/strategies/${entry.id}`);
    }
    await page.goto('/simulation');
    await page.getByText('2. Customize hand decisions', { exact: true }).click();
    await page.locator('#simAction').selectOption('stand');
    await page.locator('#simSaveAction').click();
    await page.getByRole('link', { name: 'Strategy guide: rules, examples, pros and cons' }).click();
    await expect(page.locator('.strategy-guide-card')).toHaveCount(catalog.entries.length);
    await page.getByRole('link', { name: 'Fibonacci', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies\/fibonacci$/);
    await expect(page.locator('.strategy-guide-card')).toHaveCount(1);
    await page.getByRole('link', { name: 'Try Fibonacci', exact: true }).click();
    await expect(page.locator('#simBetting')).toHaveValue('fibonacci');
    await expect(page.locator('#simOverrideCount')).toContainText('1 custom');
    await page.getByRole('link', { name: 'Strategies', exact: true }).click();
    await page.getByRole('link', { name: 'Try Chase 20', exact: true }).click();
    await expect(page.locator('#simPlaying')).toHaveValue('chase20');
    await expect(page.locator('#simBetting')).toHaveValue('fibonacci');
    await expect(page.locator('#simOverrideCount')).toContainText('1 custom');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('result CSV/JSON and both chart formats export the completed run snapshot', async ({ page }) => {
    await page.goto('/simulation');
    await page.locator('#simBetting').selectOption('paroli');
    await page.locator('#simPlaying').selectOption('mimic');
    await page.locator('#simRun').click();
    await expect(page.locator('#simulationResults')).toBeVisible();
    await page.locator('#simBetting').selectOption('pulse'); // do not change the saved snapshot
    const json = JSON.parse((await download(page, 'simExportJSON', 'json')).toString());
    expect(json.config.betting).toBe('paroli'); expect(json.config.playing).toBe('mimic');
    expect(json.monetaryUnit).toBe('USD cents');
    expect(json.result.points.at(-1).profit).toBe(json.result.profit);
    const csv = (await download(page, 'simExportCSV', 'csv')).toString();
    expect(csv).toContain('"settings","betting","","paroli"');
    expect(csv).toContain('"settings","playing","","mimic"');
    expect(csv).toContain(`"summary","profit","","${json.result.profit}","USD cents"`);
    expect(csv).toContain('"sample","cumulative_profit"');
    for (const chart of ['Profit', 'Outcomes']) {
        const svg = (await download(page, `sim${chart}SVG`, 'svg')).toString();
        expect(svg).toContain('Paroli'); expect(svg).toContain('Mimic the dealer');
        expect(svg).toContain('export-test'); expect(svg).not.toContain('Pulse');
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).not.toContain('<script');
        verifyPNG(await download(page, `sim${chart}PNG`, 'png'));
    }
    expect(page.runs).toBe(1);
});

test('strategy chart exports include current hand type, settings and recommendations', async ({ page }) => {
    await page.goto('/charts/soft');
    await page.locator('#chartDouble').uncheck();
    await page.locator('#chartSurrender').uncheck();
    const csv = (await download(page, 'chartExportCSV', 'csv')).toString();
    expect(csv).toContain('Soft totals');
    expect(csv).toContain('Double / split affordable: no');
    expect(csv).toContain('"A, 7 (18)","stand","stand","stand","stand","stand"');
    const svg = (await download(page, 'chartExportSVG', 'svg')).toString();
    expect(svg).toContain('Soft totals'); expect(svg).toContain('Surrender: no');
    expect(svg).toContain('H = Hit'); expect(svg).toContain('A, 7 (18)');
    verifyPNG(await download(page, 'chartExportPNG', 'png'));
    await page.locator('#chartType').selectOption('pair');
    const pair = (await download(page, 'chartExportCSV', 'csv')).toString();
    expect(pair).toContain('Pairs'); expect(pair).toContain('"A, A"');
    expect(pair).not.toContain('Soft totals');
});

test('strategy detail is readable without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3101/strategies/dalembert');
    await expect(page.locator('#strategiesHeading')).toHaveText('D’Alembert');
    await expect(page.locator('.strategy-guide-card')).toContainText('Add one base unit');
    await expect(page.locator('.strategy-guide-card')).toContainText('Cons');
    await context.close();
});
