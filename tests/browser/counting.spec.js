import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: route.request().url().endsWith('/me') ? 401 : 200, json: {} }));
    await page.goto('/counting');
});
test('counting drill scores once, resets settings and retains progress on navigation', async ({ page }) => {
    await expect(page.locator('#countingHeading')).toBeVisible();
    await page.locator('#countNext').click();
    const card = await page.locator('.count-playing-card').textContent();
    const rank = card.slice(0, -1);
    const tag = ['2','3','4','5','6'].includes(rank) ? 1 : ['7','8','9'].includes(rank) ? 0 : -1;
    await page.locator('#countAnswer').fill(String(tag));
    await page.locator('#countCheck').click();
    await expect(page.locator('#countAccuracy')).toHaveText('100%');
    await expect(page.locator('#countCheck')).toBeDisabled();
    await page.locator('a[data-placeholder-page="practice"]').click();
    await expect(page.locator('#gamePage')).toBeVisible();
    await page.locator('a[data-placeholder-page="counting"]').click();
    await expect(page.locator('#countAttempts')).toHaveText('1');
    await page.locator('#countMode').selectOption('true');
    await page.locator('#countSystem').selectOption('1');
    await expect(page.locator('#countMode')).toHaveValue('running');
    await expect(page.locator('#countMode option[value="true"]')).toBeDisabled();
    await expect(page.locator('#countAttempts')).toHaveText('0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/counting-${test.info().project.name}.png`, fullPage: true });
});
test('all systems count a full deck correctly, including red sevens and fractional tags', async ({ page }) => {
    // Drive real handlers synchronously, avoiding 416 browser round trips.
    const totals = await page.evaluate(() => {
        const set = (id, value) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('change')); };
        set('countDecks', '1'); set('countDepth', '1'); set('countBatch', '2'); set('countMode', 'running');
        return Array.from({length: 8}, (_, i) => {
            set('countSystem', String(i));
            for (let j = 0; j < 26; j++) {
                document.getElementById('countNext').click();
                document.getElementById('countAnswer').value = '0';
                document.getElementById('countAnswerForm').requestSubmit();
            }
            return document.getElementById('countFeedback').textContent;
        });
    });
    totals.forEach((text, i) => expect(text).toContain(`Final running count: ${i === 1 ? '+4' : i === 2 ? '+2' : '0'}.`));
});
test('true count handles negative fractions and stops before an empty shoe', async ({ page }) => {
    await page.locator('#countMode').selectOption('true');
    await page.locator('#countDecks').selectOption('1');
    await page.locator('summary').filter({ hasText: 'Advanced options' }).click();
    await page.locator('#countDepth').selectOption('1');
    const result = await page.evaluate(() => {
        let count = 0;
        while (!document.getElementById('countNext').disabled && count < 60) {
            document.getElementById('countNext').click();
            const text = document.getElementById('countInstruction').textContent;
            const [, running, remaining] = text.match(/Running count ([+-]?\d+).*Divide by (\d+)\/52/);
            document.getElementById('countAnswer').value = String(Math.trunc(Number(running) / (Number(remaining) / 52)));
            document.getElementById('countAnswerForm').requestSubmit(); count++;
        }
        return {count, accuracy: document.getElementById('countAccuracy').textContent};
    });
    expect(result).toEqual({ count: 51, accuracy: '100%' });
});
test('hints can be hidden and an incorrect ace side count is explained', async ({ page }) => {
    await page.locator('summary').filter({ hasText: 'Advanced options' }).click();
    await page.locator('#countHints').uncheck();
    await page.locator('#countAces').check();
    await page.locator('#countNext').click();
    await expect(page.locator('#countHint')).toBeEmpty();
    await page.locator('#countAnswer').fill('0');
    await page.locator('#countAceAnswer').fill('99');
    await page.locator('#countCheck').click();
    await expect(page.locator('#countFeedback')).toContainText('Not quite.');
    await expect(page.locator('#countFeedback')).toContainText('Aces seen:');
    await expect(page.locator('#countAccuracy')).toHaveText('0%');
});
test('direct page serves readable lessons and canonical metadata without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3101/counting');
    await expect(page.locator('#countingHeading')).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Start with Hi-Lo'})).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://blackjack-trainer.co/counting');
    await context.close();
});
