import { test, expect } from "@playwright/test";

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
