import { test, expect } from '@playwright/test';
import content from '../../learning-content.cjs';

const origin = 'https://blackjack-trainer.co';
test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: new URL(route.request().url()).pathname === '/api/auth/me' ? 401 : 200, json: {} }));
});

async function assertTopic(page, path) {
    const topic = content.topics[path];
    const crumbs = content.breadcrumbs(path);
    const breadcrumb = page.locator('.breadcrumbs');
    await expect(breadcrumb).toHaveCount(1);
    await expect(breadcrumb.locator('li')).toHaveText(crumbs.map(crumb => crumb.title));
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(topic.title);
    expect(await breadcrumb.locator('a').evaluateAll(elements => elements.map(element => element.getAttribute('href')))).toEqual(crumbs.slice(0, -1).map(crumb => crumb.href));
    const data = JSON.parse(await page.locator('#breadcrumbData').textContent());
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement).toEqual(crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.title, item: origin + crumb.href })));
    const related = page.locator('[data-related-topics]');
    await expect(related).toHaveCount(1);
    await expect(related.getByRole('heading')).toHaveText('Related topics');
    expect(await related.locator('a').evaluateAll(elements => elements.map(element => element.getAttribute('href')))).toEqual(topic.related.map(target => `/${target}`));
    expect(await related.evaluate((element, section) => Boolean(document.getElementById(`${section}Content`).compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING), path.split('/')[0])).toBe(true);
    for (const link of await related.locator('a').all()) {
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(['rgb(255, 244, 207)', 'rgb(231, 198, 109)']).toContain(await link.evaluate(element => getComputedStyle(element).color));
    }
    await expect(page.locator('.topic-index')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const [path, target] of [['learn/meet-the-table', 'ace'], ['glossary/soft-hand', 'ace'], ['charts/soft', 'soft-hand']]) {
    test(`${path} breadcrumbs, related and in-text links work without JavaScript`, async ({ browser }, testInfo) => {
        const context = await browser.newContext({ javaScriptEnabled: false, viewport: testInfo.project.use.viewport });
        try {
            const page = await context.newPage();
            await page.goto(`http://127.0.0.1:3101/${path}`);
            await assertTopic(page, path);
            const link = page.locator(`.topic-view .in-text-link[href="/glossary/${target}"]`);
            await expect(link).toBeVisible();
            await expect(link).toHaveCSS('color', 'rgb(231, 198, 109)');
            await expect(link).toHaveCSS('text-decoration-line', 'underline');
            await link.click();
            await expect(page).toHaveURL(new RegExp(`/glossary/${target}$`));
            await assertTopic(page, `glossary/${target}`);
        } finally { await context.close(); }
    });
}

test('HTML anchor crawl from home reaches every sitemap URL', async ({ request }) => {
    const pending = ['/'];
    const visited = new Set();
    while (pending.length) {
        const path = pending.shift();
        if (visited.has(path)) continue;
        visited.add(path);
        const response = await request.get(path);
        expect(response.status(), path).toBe(200);
        const html = await response.text();
        for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
            const url = new URL(match[1], origin + path);
            if (url.origin === origin && /^\/(?:$|privacy$|simulation$|(?:learn|glossary|charts|strategies)(?:\/[a-z0-9-]+)?$)/.test(url.pathname) && !visited.has(url.pathname)) pending.push(url.pathname);
        }
    }
    const sitemap = await (await request.get('/sitemap.xml')).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
    expect([...visited].sort()).toEqual(paths.sort());
});

test('in-text and related navigation refresh breadcrumbs and JSON-LD without reloading or CSP violations', async ({ page }) => {
    const violations = [];
    await page.exposeFunction('recordBreadcrumbCspViolation', uri => violations.push(uri));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.recordBreadcrumbCspViolation(event.blockedURI)));
    const response = await page.goto('/learn/meet-the-table');
    expect(response.headers()['content-security-policy'].match(/(?:^|;)script-src ([^;]+)/)[1]).not.toContain("'unsafe-inline'");
    await page.evaluate(() => { window.navigationSentinel = 'same document'; });
    await assertTopic(page, 'learn/meet-the-table');
    await page.locator('.topic-view .in-text-link[href="/glossary/ace"]').click();
    await expect(page).toHaveURL(/\/glossary\/ace$/);
    await assertTopic(page, 'glossary/ace');
    await page.locator('[data-related-topics] a[href="/glossary/soft-hand"]').click();
    await expect(page).toHaveURL(/\/glossary\/soft-hand$/);
    await assertTopic(page, 'glossary/soft-hand');
    await page.locator('[data-related-topics] a[href="/charts/soft"]').click();
    await expect(page).toHaveURL(/\/charts\/soft$/);
    await assertTopic(page, 'charts/soft');
    await expect(page.locator('#chartType')).toHaveValue('soft');
    expect(await page.evaluate(() => window.navigationSentinel)).toBe('same document');
    await page.goBack();
    await expect(page).toHaveURL(/\/glossary\/soft-hand$/);
    await assertTopic(page, 'glossary/soft-hand');
    await page.locator('.breadcrumbs a[href="/glossary"]').click();
    await expect(page).toHaveURL(/\/glossary$/);
    await expect(page.locator('.breadcrumbs li')).toHaveText(['Home', 'Glossary']);
    await expect(page.locator('[data-related-topics]')).toHaveCount(0);
    expect(JSON.parse(await page.locator('#breadcrumbData').textContent()).itemListElement).toHaveLength(2);
    await page.locator('.breadcrumbs a[href="/"]').click();
    await expect(page.locator('#gamePage')).toBeVisible();
    await expect(page.locator('.breadcrumbs, #breadcrumbData, [data-related-topics]')).toHaveCount(0);
    expect(violations).toEqual([]);
});

test('browser creates safe text nodes and anchors from content', async ({ page }) => {
    await page.goto('/learn');
    const text = '<img src=x onerror="bad()"> & "ACE" </script>';
    const result = await page.evaluate(text => {
        const paragraph = document.createElement('p');
        appendLearningText(paragraph, text, blackjackLearningContent.createLinkState());
        return { text: paragraph.textContent, tags: [...paragraph.children].map(element => element.tagName), href: paragraph.querySelector('a').getAttribute('href') };
    }, text);
    expect(result).toEqual({ text, tags: ['A'], href: '/glossary/ace' });
});

async function assertLimits(page, section, currentTopic = '') {
    const targets = await page.locator(`[data-placeholder-content="${section}"] .in-text-link`).evaluateAll(elements => elements.map(element => element.getAttribute('href')));
    expect(new Set(targets).size).toBe(targets.length);
    if (currentTopic) {
        expect(targets.length).toBeLessThanOrEqual(5);
        expect(targets).not.toContain(`/${currentTopic}`);
    }
    for (const card of await page.locator(section === 'learn' ? '.lesson-card' : '.glossary-card').all()) {
        expect(await card.locator('.in-text-link').count()).toBeLessThanOrEqual(section === 'learn' ? 5 : 2);
    }
}

test('link caps survive direct loads, filters and navigation while quiz controls stay plain', async ({ page }) => {
    await page.goto('/learn');
    await assertLimits(page, 'learn');
    await page.locator('.lesson-card summary').first().click();
    await page.locator('.quiz-choices').getByRole('button', { name: 'Surrender', exact: true }).click();
    await page.locator('.lesson-card > .topic-link').first().click();
    await expect(page).toHaveURL(/\/learn\/meet-the-table$/);
    await assertLimits(page, 'learn', 'learn/meet-the-table');
    await expect(page.locator('.lesson-card').first()).toHaveAttribute('open', '');
    await expect(page.locator('.quiz-feedback')).toContainText('Nice decision!');
    await expect(page.locator('.learning-quiz a')).toHaveCount(0);
    await page.locator('.account-nav a[href="/glossary"]').click();
    await expect(page).toHaveURL(/\/glossary$/);
    await assertLimits(page, 'glossary');
    await page.locator('#glossarySearch').fill('Soft hand');
    await assertLimits(page, 'glossary');
    await page.locator('.glossary-card > .topic-link').click();
    await expect(page).toHaveURL(/\/glossary\/soft-hand$/);
    await assertLimits(page, 'glossary', 'glossary/soft-hand');
    await page.locator('#glossarySearch').fill('');
    await assertLimits(page, 'glossary', 'glossary/soft-hand');
    await page.locator('[data-related-topics] a[href="/charts/soft"]').click();
    await expect(page).toHaveURL(/\/charts\/soft$/);
    await expect(page.locator('.strategy-table a, .chart-action a')).toHaveCount(0);
    await assertLimits(page, 'charts', 'charts/soft');
});
