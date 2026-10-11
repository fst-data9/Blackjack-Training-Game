import { test, expect } from "@playwright/test";

test("analytics script and reporting endpoint are allowed by CSP", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/auth/me") return route.fulfill({ status: 401, json: { error: "Not signed in" } });
        if (path === "/api/auth/config") return route.fulfill({ json: { googleClientId: "", turnstileSiteKey: "" } });
        return route.fulfill({ json: {} });
    });
    const violations = [];
    await page.exposeFunction("recordCspViolation", (uri) => violations.push(uri));
    await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => window.recordCspViolation(event.blockedURI));
    });
    let scriptLoads = 0;
    let reports = 0;
    await page.route("https://cloudflareinsights.com/cdn-cgi/rum", async (route) => {
        reports += 1;
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    });
    await page.route("https://static.cloudflareinsights.com/beacon.min.js", async (route) => {
        scriptLoads += 1;
        await route.fulfill({
            contentType: "application/javascript",
            headers: { "access-control-allow-origin": "*" },
            body: 'fetch("https://cloudflareinsights.com/cdn-cgi/rum", { method: "POST", body: "test" });',
        });
    });
    await page.goto("/");
    await expect.poll(() => scriptLoads).toBe(1);
    await expect.poll(() => reports).toBe(1);
    expect(violations.filter((uri) => uri.includes("cloudflareinsights.com"))).toEqual([]);
});

for (const path of ["/", "/learn", "/glossary", "/charts"]) {
    test(`public SEO response ${path} works without JavaScript`, async ({ browser, request }) => {
        const context = await browser.newContext({ javaScriptEnabled: false });
        const page = await context.newPage();
        const response = await page.goto(`http://127.0.0.1:3101${path}`);
        expect(response.status()).toBe(200);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://blackjack-trainer.co${path}`);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /blackjack/i);
        await expect(page.locator(path === "/" ? "#gamePage" : `[data-placeholder-content="${path.slice(1)}"]`)).toBeVisible();
        await expect(page.locator('[data-placeholder-content="share"]')).toBeHidden();
        const sitemap = await request.get('/sitemap.xml');
        expect(sitemap.status()).toBe(200);
        expect(await sitemap.text()).toContain(`<loc>https://blackjack-trainer.co${path}</loc>`);
        await context.close();
    });
}

test("navigation changes metadata and browser back restores the public view", async ({ page, request }) => {
    await page.goto("/");
    await page.locator('footer a[href="/learn"]').click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page).toHaveTitle(/Learn Blackjack/);
    await page.goBack();
    await expect(page).toHaveTitle(/Free Blackjack Trainer/);
    await expect(page.locator("#gamePage")).toBeVisible();
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap: https://blackjack-trainer.co/sitemap.xml");
});

for (const path of ['/learn/meet-the-table', '/glossary/soft-hand', '/charts/soft']) {
    test(`topic ${path} has initial content and works in navigation`, async ({ browser, page, request }) => {
        const context = await browser.newContext({ javaScriptEnabled: false });
        const staticPage = await context.newPage();
        await staticPage.goto(`http://127.0.0.1:3101${path}`);
        await expect(staticPage.locator('.topic-view article')).toBeVisible();
        await expect(staticPage.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://blackjack-trainer.co${path}`);
        expect(await (await request.get('/sitemap.xml')).text()).toContain(`<loc>https://blackjack-trainer.co${path}</loc>`);
        await context.close();
        await page.goto(path);
        await expect(page.locator(path.startsWith('/learn') ? '.lesson-card' : path.startsWith('/glossary') ? '#glossarySearch' : '#chartType').first()).toBeVisible();
        await page.goto('/');
        await page.evaluate(path => navigatePublicPage(path), path);
        await expect(page.locator('.topic-view article')).toBeVisible();
        await expect(page.locator('#gamePage')).toBeHidden();
        await page.goBack();
        await expect(page.locator('#gamePage')).toBeVisible();
    });
}

test('ads stay disabled and learning content survives script failure', async ({ page }) => {
    let adRequests = 0;
    page.on('request', request => { if (/googlesyndication|doubleclick/.test(request.url())) adRequests++; });
    await page.route('**/learning-pages.js', route => route.abort());
    await page.goto('/learn');
    await expect(page.locator('#learnContent')).toContainText('Meet the table');
    await expect(page.locator('.ad-placement').first()).toBeHidden();
    expect(adRequests).toBe(0);
});

test('every sitemap topic serves its own canonical and readable initial article', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    const topics = [...sitemap.matchAll(/<loc>https:\/\/blackjack-trainer.co(\/(?:learn|glossary|charts)\/[^<]+)<\/loc>/g)].map(match => match[1]);
    expect(topics).toHaveLength(31);
    for (const path of topics) {
        const response = await request.get(path);
        expect(response.status()).toBe(200);
        const html = await response.text();
        expect(html).toContain(`href="https://blackjack-trainer.co${path}"`);
        expect(html).toContain('<article class="learning-card">');
        expect(html).toContain('<base href="/">');
    }
    expect((await request.get('/learn/unknown-topic')).status()).toBe(404);
});
