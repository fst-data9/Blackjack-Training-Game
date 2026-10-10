import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
        if (!response.url().includes("/api/") && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    page.browserErrors = errors;
    page.savedHands = [];
    // Use the real API's static routes and security headers, but intercept all
    // data requests. Browser tests never connect to or change a database.
    await page.route("**/api/**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/auth/config") return route.fulfill({ json: { googleClientId: "", turnstileSiteKey: "" } });
        if (path === "/api/auth/me") return route.fulfill({ status: 401, json: { error: "Not signed in" } });
        if (path === "/api/auth/login") return route.fulfill({ status: 401, json: { error: "Invalid email or password" } });
        if (path === "/api/hands") page.savedHands.push(route.request().postDataJSON());
        if (["/api/hands", "/api/sessions", "/api/session-stats"].includes(path)) return route.fulfill({ json: {} });
        throw new Error(`Unexpected browser API request: ${path}`);
    });
    await page.goto("/");
    await expect(page.locator("#openAuthBtn")).toBeVisible();
});

test.afterEach(async ({ page }) => {
    expect(page.browserErrors).toEqual([]);
});

async function deal(page, ranks) {
    await page.locator("#betInput").fill("20");
    await page.evaluate(cards => {
        // Test-only shoe injection into the page's existing game state.
        deck = cards.map((rank, index) => ({ rank, suit: ["♠", "♥", "♦", "♣"][index % 4] })).reverse();
        shoeNeedsShuffle = false;
        cutCardRemaining = 0;
    }, ranks);
    await page.locator("#newGameBtn").click();
}

test("split-ace 21 advances, keeps dealer hidden, and settles both hands", async ({ page }) => {
    await deal(page, ["A", "9", "A", "8", "K", "5", "5"]);
    await page.locator("#splitBtn").click();
    await expect(page.locator(".hand-panel.active")).toContainText("Hand 2");
    await expect(page.locator("#newGameBtn")).toBeDisabled();
    await expect(page.locator("#hitBtn")).toBeEnabled();
    await expect(page.locator("#dealerCards img").nth(1)).toHaveAttribute("alt", "Hidden card");
    await page.locator("#hitBtn").click();
    await expect(page.locator("#status")).toContainText("Hand 1: WIN");
    await expect(page.locator("#status")).toContainText("Hand 2: WIN");
    await expect(page.locator("#bankrollAmt")).toHaveText("1040");
    await expect(page.locator("#statsHands")).toHaveText("2");
    await expect(page.locator("#newGameBtn")).toBeEnabled();
    await expect.poll(() => page.savedHands.length).toBe(2);
    expect(page.savedHands.map(hand => hand.outcome)).toEqual(["win", "win"]);
});

test("both split aces at 21 settle without leaving controls stuck", async ({ page }) => {
    await deal(page, ["A", "9", "A", "8", "10", "J"]);
    await page.locator("#splitBtn").click();
    await expect(page.locator("#newGameBtn")).toBeEnabled();
    await expect(page.locator("#hitBtn")).toBeDisabled();
    await expect(page.locator("#statsHands")).toHaveText("2");
    await expect(page.locator("#bankrollAmt")).toHaveText("1040");
});

test("navigation and introductory deal button work through served scripts", async ({ page, isMobile }) => {
    if (isMobile) {
        // The current mobile design hides the placeholder navigation.
        await expect(page.locator(".account-nav")).toBeHidden();
    } else {
        await page.locator('[data-placeholder-page="learn"]').click();
        await expect(page.locator("#gamePage")).toBeHidden();
        await expect(page.locator('[data-placeholder-content="learn"]')).toBeVisible();
        await page.locator('[data-placeholder-page="practice"]').click();
    }
    await expect(page.locator("#gamePage")).toBeVisible();
    await page.locator("#startTrainingBtn").click();
    await expect(page.locator("#statsRounds")).toHaveText("1");
});

test("login dialog focus, error recovery and Escape close work", async ({ page }) => {
    await page.locator("#openAuthBtn").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('#loginForm input[name="email"]')).toBeFocused();
    await page.locator('#loginForm input[name="email"]').fill("browser@example.test");
    await page.locator('#loginForm input[name="password"]').fill("invalid-test-password");
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator("#authMessage")).toHaveText("Invalid email or password");
    await expect(page.locator('#loginForm button[type="submit"]')).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.locator("#authOverlay")).toBeHidden();
    await expect(page.locator("#openAuthBtn")).toBeFocused();
});

test("hint, decision feedback and review round-trip use real DOM events", async ({ page }) => {
    await deal(page, ["5", "9", "6", "8", "2"]);
    await page.getByRole("button", { name: "Reveal Suggestion" }).click();
    await expect(page.locator("#statsHints")).toHaveText("1");
    await page.locator("#hitBtn").click();
    await page.locator("#standBtn").click();
    await expect(page.locator("#strategyLog")).toContainText("Review this move");
    await page.locator("#openReviewBtn").click();
    await expect(page.locator("#reviewPage")).toBeVisible();
    await expect(page.locator("#reviewHands")).toContainText("Hit");
    await page.locator("#closeReviewBtn").click();
    await expect(page.locator("#gamePage")).toBeVisible();
});

test("successful login and logout update account controls", async ({ page }) => {
    await page.route("**/api/auth/login", route => route.fulfill({ json: { user: { id: "browser-user", displayName: "Browser Player", email: "browser@example.test" } } }));
    await page.route("**/api/auth/logout", route => route.fulfill({ json: {} }));
    await page.locator("#openAuthBtn").click();
    await page.locator('#loginForm input[name="email"]').fill("browser@example.test");
    await page.locator('#loginForm input[name="password"]').fill("test-only-password");
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator("#authOverlay")).toBeHidden();
    await expect(page.locator("#accountName")).toHaveText("Browser Player");
    await expect(page.locator("#openAuthBtn")).toBeHidden();
    await page.locator("#logoutBtn").click();
    await expect(page.locator("#openAuthBtn")).toBeVisible();
    await expect(page.locator("#signedInActions")).toBeHidden();
    await expect(page.locator("#statsRounds")).toHaveText("0");
});

test("user and session statistics tabs render separate totals", async ({ page }) => {
    await page.route("**/api/users/me/stats", route => route.fulfill({ json: {
        stats: { sessions: 1, rounds: 3, hands: 4, decisions: 10, correct_decisions: 8, hints: 1,
            main_wagered_cents: 10000, actual_net_cents: 2000, insurance_offered: 0, insurance_taken: 0,
            wins: 2, losses: 1, pushes: 1, blackjacks: 0, surrenders: 0 },
        history: [{ round_index: 1, hand_index: 0, outcome: "win", payout_cents: 2000 }],
    } }));
    await page.locator("#userStatsTab").click();
    await expect(page.locator("#statsRounds")).toHaveText("3");
    await expect(page.locator("#statsCorrect")).toHaveText("8 / 10");
    await expect(page.locator("#statsActual")).toHaveText("$20");
    await expect(page.locator("#userStatsTab")).toHaveAttribute("aria-selected", "true");
    await page.locator("#sessionStatsTab").click();
    await expect(page.locator("#statsRounds")).toHaveText("0");
    await expect(page.locator("#sessionStatsTab")).toHaveAttribute("aria-selected", "true");
});

test("page and split panels fit the viewport", async ({ page }) => {
    await deal(page, ["8", "9", "8", "8", "8", "8", "8", "8", "8", "8"]);
    for (let count = 0; count < 3; count++) await page.locator("#splitBtn").click();
    await expect(page.locator(".hand-panel")).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const panel of await page.locator(".hand-panel").all()) {
        const box = await panel.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    }
});
