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
