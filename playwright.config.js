import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
    testDir: "./tests/browser",
    fullyParallel: true,
    workers: process.env.CI ? 2 : 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:3101",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        { name: "desktop-chromium", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
        { name: "mobile-chromium", use: { browserName: "chromium", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    ],
    webServer: {
        command: `"${process.execPath}" "${fileURLToPath(new URL("./backend/server.js", import.meta.url))}"`,
        url: "http://127.0.0.1:3101/",
        reuseExistingServer: false,
        env: {
            NODE_ENV: "test", PORT: "3101",
            DATABASE_URL: "postgres://browser_test:unused@127.0.0.1:1/browser_test",
            ALLOWED_ORIGINS: "http://127.0.0.1:3101", ALLOW_FILE_ORIGIN: "false",
            GOOGLE_CLIENT_ID: "", TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "",
            TURNSTILE_EXPECTED_HOSTNAME: "", REQUIRE_SIGNUP_CAPTCHA: "false", TRUST_PROXY_HOPS: "0",
        },
    },
});
