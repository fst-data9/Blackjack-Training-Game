import { test, expect } from "@playwright/test";

const sections = [
    { name: "learn", heading: "All blackjack lessons", count: 5 },
    { name: "glossary", heading: "All glossary terms", count: 23 },
    { name: "charts", heading: "All strategy charts", count: 3 },
];

test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", route => route.fulfill({
        status: new URL(route.request().url()).pathname === "/api/auth/me" ? 401 : 200,
        json: {},
    }));
});

async function topicPaths(request, section) {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    return [...sitemap.matchAll(/<loc>https:\/\/blackjack-trainer.co(\/[^<]+)<\/loc>/g)]
        .map(match => match[1]).filter(path => path.startsWith(`/${section}/`));
}

async function assertIndex(page, section, paths) {
    const index = page.locator(".topic-index");
    await expect(index).toHaveCount(1);
    await expect(index.getByRole("heading", { name: section.heading, exact: true })).toBeVisible();
    expect(await index.evaluate((element, name) => {
        const content = document.getElementById(`${name}Content`);
        return content.parentElement === element.parentElement &&
            Boolean(content.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, section.name)).toBe(true);

    if (section.name === "glossary") {
        const details = index.locator("details");
        await expect(details).not.toHaveAttribute("open", "");
        await expect(details.locator("summary")).toHaveText("Browse all 23 glossary terms");
        await details.locator("summary").click();
        await expect(details).toHaveAttribute("open", "");
    }

    const links = index.locator("a");
    await expect(links).toHaveCount(section.count);
    expect(await links.evaluateAll(elements => elements.map(element => element.getAttribute("href")))).toEqual(paths);
    for (const link of await links.all()) {
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        const style = await link.evaluate(element => {
            const computed = getComputedStyle(element);
            return { color: computed.color, opacity: computed.opacity, ariaHidden: element.getAttribute("aria-hidden") };
        });
        expect(["rgb(255, 244, 207)", "rgb(231, 198, 109)"]).toContain(style.color);
        expect(style.opacity).toBe("1");
        expect(style.ariaHidden).not.toBe("true");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await links.first().hover();
    await expect(links.first()).toHaveCSS("color", "rgb(231, 198, 109)");
    await links.first().focus();
    await page.keyboard.press("Tab");
    await expect(links.nth(1)).toBeFocused();
    await expect(links.nth(1)).toHaveCSS("color", "rgb(231, 198, 109)");
    await expect(links.nth(1)).toHaveCSS("outline-color", "rgb(231, 198, 109)");
    await expect(links.nth(1)).toHaveCSS("outline-width", "3px");
}

for (const section of sections) {
    test(`${section.name} server HTML links every topic after its content`, async ({ request }) => {
        const paths = await topicPaths(request, section.name);
        expect(paths).toHaveLength(section.count);
        const response = await request.get(`/${section.name}`);
        expect(response.status()).toBe(200);
        const html = await response.text();
        const index = html.slice(html.indexOf('<section class="topic-index"'));
        const links = [...index.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)]
            .map(match => match[1]).filter(path => path.startsWith(`/${section.name}/`));
        expect(links).toEqual(paths);
        expect(html.indexOf(`id="${section.name}Content"`)).toBeLessThan(html.indexOf('class="topic-index"'));
        expect(html).not.toContain('class="topic-view"');
        for (const path of paths) {
            const topicHtml = await (await request.get(path)).text();
            const view = topicHtml.match(/<div class="topic-view">([\s\S]*?)<\/div>/)[1];
            expect([...view.matchAll(/<a class="topic-link"[^>]*\bhref="([^"]+)"/g)].map(match => match[1])).toEqual([`/${section.name}`]);
            expect(view).toContain(`${section.heading} →`);
            expect(topicHtml).not.toContain('class="topic-index"');
            expect(topicHtml.indexOf(`id="${section.name}Content"`)).toBeLessThan(topicHtml.indexOf("data-related-topics"));
        }
    });

    test(`${section.name} index works without JavaScript`, async ({ browser, request }) => {
        const context = await browser.newContext({ javaScriptEnabled: false });
        try {
            const page = await context.newPage();
            await page.goto(`http://127.0.0.1:3101/${section.name}`);
            await assertIndex(page, section, await topicPaths(request, section.name));
            await page.locator(".topic-index a").first().click();
            await expect(page.locator(".topic-view article")).toBeVisible();
            await expect(page.locator(".topic-index")).toHaveCount(0);
            await expect(page.locator(`[data-placeholder-content="${section.name}"] [data-related-topics]`)).toHaveCount(1);
            const back = page.locator(`.topic-view a[href="/${section.name}"]`);
            await expect(back).toHaveText(`${section.heading} →`);
            await expect(back).toBeVisible();
            await expect(back).toHaveCSS("color", "rgb(255, 244, 207)");
            await back.click();
            await assertIndex(page, section, await topicPaths(request, section.name));
        } finally {
            await context.close();
        }
    });

    for (const direct of [true, false]) {
        test(`${section.name} index stays below interactive content on ${direct ? "direct load" : "in-app navigation"}`, async ({ page, request }) => {
            if (direct) {
                await page.goto(`/${section.name}`);
            } else {
                await page.goto("/");
                await page.locator(`.account-nav a[href="/${section.name}"]`).click();
                await expect(page).toHaveURL(new RegExp(`/${section.name}$`));
            }
            const paths = await topicPaths(request, section.name);
            await assertIndex(page, section, paths);
            await page.locator(".topic-index a").first().click();
            await expect(page).toHaveURL(new RegExp(`${paths[0]}$`));
            await expect(page.locator(".topic-view article")).toBeVisible();
            await expect(page.locator(".topic-index")).toHaveCount(0);
            await expect(page.locator(".topic-view nav")).toHaveCount(0);
            expect(await page.locator(".topic-view").evaluate((element, name) =>
                Boolean(element.compareDocumentPosition(document.getElementById(`${name}Content`)) & Node.DOCUMENT_POSITION_FOLLOWING), section.name)).toBe(true);
            const back = page.locator(`.topic-view a[href="/${section.name}"]`);
            await expect(back).toHaveText(`${section.heading} →`);
            await back.click();
            await expect(page).toHaveURL(new RegExp(`/${section.name}$`));
            await assertIndex(page, section, paths);
            await page.goBack();
            await expect(page.locator(".topic-view")).toHaveCount(1);
            await expect(page.locator(".topic-index")).toHaveCount(0);
        });
    }
}

test("glossary card links use term names and preserve their targets when filtered", async ({ page }) => {
    await page.goto("/glossary");
    for (const card of await page.locator(".glossary-card").all()) {
        const term = await card.locator("h2").textContent();
        await expect(card.locator(":scope > .topic-link")).toHaveText(`${term} →`);
        await expect(card.locator(":scope > .topic-link")).toHaveAttribute("href", `/glossary/${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
    }
    await page.locator("#glossarySearch").fill("Soft hand");
    await expect(page.locator(".glossary-card > .topic-link")).toHaveText("Soft hand →");
    await page.locator(".glossary-card > .topic-link").click();
    await expect(page).toHaveURL(/\/glossary\/soft-hand$/);
});
