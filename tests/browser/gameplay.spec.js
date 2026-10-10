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
    await expect(page.locator("#roundResultDetails")).toHaveText("2 won");
    await expect(page.locator("#roundResultStrategy")).toHaveText("All decisions correct · 1/1");
});

test("navigation and introductory deal button work through served scripts", async ({ page }) => {
    await expect(page.locator(".account-nav")).toBeVisible();
    const header = await page.locator(".site-chrome").boundingBox();
    expect(header.height).toBeLessThanOrEqual(page.viewportSize().width <= 780 ? 105 : 60);
    if (page.viewportSize().width <= 560) {
        const intro = await page.locator(".training-intro").boundingBox();
        expect(intro.y + intro.height).toBeLessThan(190);
        for (const button of await page.locator(".account-nav [data-placeholder-page]").all()) {
            const box = await button.boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
            expect(box.height).toBeGreaterThanOrEqual(44);
        }
    }
    await page.locator('[data-placeholder-page="glossary"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#glossaryHeading")).toBeFocused();
    await expect(page.locator("#glossarySearch")).toBeVisible();
    await page.locator('[data-placeholder-page="learn"]').click();
    await expect(page.locator("#gamePage")).toBeHidden();
    await expect(page.locator('[data-placeholder-content="learn"]')).toBeVisible();
    await page.locator('[data-placeholder-page="practice"]').click();
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

test("learning pages preserve the round and serve interactive quiz, glossary and charts", async ({ page }) => {
    await deal(page, ["10", "9", "6", "8"]);
    const bankroll = await page.locator("#bankrollAmt").textContent();
    await page.locator('[data-placeholder-page="learn"]').click();
    await page.locator(".quiz-choices").getByRole("button", { name: "Surrender", exact: true }).click();
    await expect(page.locator(".quiz-feedback")).toContainText("Nice decision!");
    await page.locator('[data-placeholder-page="glossary"]').click();
    await page.locator("#glossarySearch").fill("keep playing");
    await expect(page.locator(".glossary-card")).toHaveCount(1);
    await expect(page.locator(".glossary-card")).toContainText("keep playing after splitting aces");
    await page.locator('[data-placeholder-page="charts"]').click();
    await page.locator("#chartType").selectOption("soft");
    await page.locator("#chartDouble").uncheck();
    await page.getByRole("button", { name: "A, 7 (18) against dealer 6: Stand", exact: true }).click();
    await expect(page.locator("#chartDetail")).toContainText("Stand");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('[data-placeholder-page="practice"]').click();
    await expect(page.locator("#bankrollAmt")).toHaveText(bankroll);
    await expect(page.locator("#statsRounds")).toHaveText("1");
    await expect(page.locator("#newGameBtn")).toBeDisabled();
    await expect(page.locator("#standBtn")).toBeEnabled();
});

const resultScenarios = [
    { name: "correct win", cards: ["10", "9", "8", "8"], actions: ["stand"], title: "You won!", net: "+$20", strategy: "All decisions correct · 1/1" },
    { name: "correct loss", cards: ["10", "10", "8", "9"], actions: ["stand"], title: "You lost", net: "-$20", strategy: "All decisions correct · 1/1" },
    { name: "win with a mistake", cards: ["10", "6", "2", "10", "5", "10"], actions: ["hit", "stand"], title: "You won!", net: "+$20", strategy: "1 move to review · 1/2 correct" },
    { name: "bust with a mistake", cards: ["10", "9", "8", "8", "10"], actions: ["hit"], title: "You lost", net: "-$20", strategy: "1 move to review · 0/1 correct" },
    { name: "multiple mistakes", cards: ["5", "9", "6", "8", "2"], actions: ["hit", "stand"], title: "You lost", net: "-$20", strategy: "2 moves to review · 0/2 correct" },
    { name: "push", cards: ["10", "10", "8", "8"], actions: ["stand"], title: "Push", net: "$0", strategy: "All decisions correct · 1/1" },
    { name: "surrender", cards: ["10", "10", "6", "8"], actions: ["surrender"], title: "Surrendered", net: "-$10", strategy: "All decisions correct · 1/1" },
    { name: "natural blackjack", cards: ["A", "9", "K", "8"], actions: [], title: "Blackjack!", net: "+$30", strategy: "No decisions needed" },
    { name: "dealer blackjack", cards: ["10", "K", "8", "A"], actions: [], title: "You lost", net: "-$20", strategy: "No decisions needed" },
    { name: "double", cards: ["5", "6", "6", "10", "10", "10"], actions: ["double"], title: "You won!", net: "+$40", strategy: "All decisions correct · 1/1" },
    { name: "insurance offsets loss", cards: ["10", "A", "8", "K"], actions: ["insurance"], title: "You lost", net: "$0", strategy: "1 move to review · 0/1 correct" },
];

for (const scenario of resultScenarios) {
    test(`round overlay: ${scenario.name}`, async ({ page }) => {
        await deal(page, scenario.cards);
        for (const action of scenario.actions) await page.locator(`#${action}Btn`).click();
        await expect(page.locator("#roundResult")).toBeVisible();
        await expect(page.locator("#roundResultTitle")).toHaveText(scenario.title);
        await expect(page.locator("#roundResultNet")).toHaveText(scenario.net);
        await expect(page.locator("#roundResultStrategy")).toHaveText(scenario.strategy);
        await expect(page.locator("#status")).toContainText(scenario.strategy);
        await expect(page.locator("#newGameBtn")).toBeEnabled();
        await expect(page.locator("#roundResultDetails")).toBeHidden();
    });
}

test("split overlay waits for both hands and combines results and decision accuracy", async ({ page }) => {
    await deal(page, ["8", "9", "8", "8", "10", "2"]);
    await page.locator("#splitBtn").click();
    await expect(page.locator("#roundResult")).toBeHidden();
    await page.locator("#standBtn").click();
    await expect(page.locator("#roundResult")).toBeHidden();
    await page.locator("#standBtn").click();
    await expect(page.locator("#roundResultTitle")).toHaveText("Split results");
    await expect(page.locator("#roundResultDetails")).toHaveText("1 won · 1 lost");
    await expect(page.locator("#roundResultNet")).toHaveText("$0");
    await expect(page.locator("#roundResultStrategy")).toHaveText("1 move to review · 2/3 correct");
});

test("overlay passes clicks through, preserves focus and clears on immediate redeal", async ({ page }) => {
    await deal(page, ["10", "9", "8", "8"]);
    await page.locator("#sessionStatsTab").focus();
    await page.locator("#standBtn").dispatchEvent("click");
    await expect(page.locator("#sessionStatsTab")).toBeFocused();
    await expect(page.locator("#roundResult")).toHaveCSS("pointer-events", "none");

    // Confirm hit-testing through the entire toast, even when scrolled over
    // the table. It must never intercept a game or navigation control.
    await page.locator("#newGameBtn").scrollIntoViewIfNeeded();
    expect(await page.locator("#roundResult").evaluate(toast => {
        const rect = toast.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return !toast.contains(target);
    })).toBe(true);
    const box = await page.locator("#roundResult").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await deal(page, ["10", "9", "8", "8"]);
    await expect(page.locator("#roundResult")).toBeHidden();
    await expect(page.locator("#hitBtn")).toBeEnabled();
    await page.locator("#standBtn").click();
    await expect(page.locator("#roundResultStrategy")).toHaveText("All decisions correct · 1/1");
});

test("overlay expires without removing the accessible summary or racing the next result", async ({ page }) => {
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await deal(page, ["10", "9", "8", "8"]);
    await page.locator("#standBtn").click();
    await expect(page.locator("#roundResult")).toBeVisible();
    await expect(page.locator("#roundResult")).toHaveCSS("animation-name", "none");
    await page.clock.fastForward(2000);

    await deal(page, ["10", "10", "8", "9"]);
    await page.locator("#standBtn").click();
    await page.clock.fastForward(1600);
    await expect(page.locator("#roundResultTitle")).toHaveText("You lost");
    await expect(page.locator("#roundResult")).toBeVisible();
    await page.clock.fastForward(2000);
    await expect(page.locator("#roundResult")).toBeHidden();
    await expect(page.locator("#status")).toContainText("All decisions correct · 1/1");
    await expect(page.locator("#status")).toHaveAttribute("role", "status");
});

test("completed-round overlay stays on the practice page and clears on a bankroll reset", async ({ page }) => {
    await page.clock.install();
    await deal(page, ["10", "9", "8", "8"]);
    await page.locator("#standBtn").click();
    await page.locator("#openReviewBtn").click();
    await expect(page.locator("#roundResult")).toBeHidden();
    await page.locator("#closeReviewBtn").click();
    await expect(page.locator("#roundResult")).toBeVisible();
    await page.locator("#resetBankrollBtn").click();
    await expect(page.locator("#roundResult")).toBeHidden();
});

test("consecutive opening blackjacks restart the result animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await deal(page, ["A", "9", "K", "8"]);
    await expect.poll(() => page.locator("#roundResult").evaluate(toast => toast.getAnimations()[0].currentTime)).toBeGreaterThan(250);
    const animationTime = await page.evaluate(() => {
        deck = ["10", "K", "8", "A"].map(rank => ({ rank, suit: "♠" })).reverse();
        shoeNeedsShuffle = false;
        document.getElementById("newGameBtn").click();
        return document.getElementById("roundResult").getAnimations()[0].currentTime;
    });
    expect(animationTime).toBeLessThan(100);
    await expect(page.locator("#roundResultTitle")).toHaveText("You lost");
});
