import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import pg from "pg";
import { provisionDatabaseRole } from "../provision-db-role.js";

const adminUrl = process.env.DATABASE_TEST_ADMIN_URL;
if (!adminUrl) throw new Error("Set DATABASE_TEST_ADMIN_URL to an isolated PostgreSQL administrator URL");
const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const runFile = promisify(execFile);
const origin = "https://blackjack-security.example";
const password = "security-integration-password";

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

test("production API security with an isolated database and restricted role", { timeout: 90_000 }, async (t) => {
  const suffix = crypto.randomBytes(6).toString("hex");
  const database = `blackjack_security_${suffix}`;
  const role = `blackjack_security_api_${suffix}`;
  const rolePassword = crypto.randomBytes(32).toString("hex");
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  let created = false;
  let databaseClient;
  const processes = new Set();
  t.after(async () => {
    for (const process of processes) await process.stop();
    if (databaseClient) await databaseClient.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${admin.escapeIdentifier(database)} WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS ${admin.escapeIdentifier(role)}`);
    } finally { await admin.end(); }
  });
  await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(database)} TEMPLATE template0`);
  created = true;
  const releaseUrl = new URL(adminUrl);
  releaseUrl.pathname = `/${database}`;
  await runFile(process.execPath, [path.join(backendRoot, "migrate.js")], {
    cwd: backendRoot, env: { ...process.env, DATABASE_URL: releaseUrl.href }, timeout: 25_000,
  });
  databaseClient = new pg.Client({ connectionString: releaseUrl.href });
  await databaseClient.connect();
  await provisionDatabaseRole(databaseClient, { username: role, password: rolePassword });
  const runtimeUrl = new URL(releaseUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = rolePassword;

  async function start(settings = {}) {
    const port = await freePort();
    const child = spawn(process.execPath, [
      "--import", path.join(backendRoot, "tests/fixtures/turnstile-fetch.js"),
      path.join(backendRoot, "server.js"),
    ], {
      cwd: backendRoot,
      env: {
        ...process.env, NODE_ENV: "production", PORT: String(port),
        DATABASE_URL: runtimeUrl.href, ALLOWED_ORIGINS: origin,
        ALLOW_FILE_ORIGIN: "false", TRUST_PROXY_HOPS: "1",
        TURNSTILE_SITE_KEY: "security-fixture-site-key",
        TURNSTILE_SECRET_KEY: "security-fixture-secret-key",
        TURNSTILE_EXPECTED_HOSTNAME: "blackjack-security.example",
        REQUIRE_SIGNUP_CAPTCHA: "true", GOOGLE_CLIENT_ID: "",
        RATE_LIMIT_MAX: "120", RATE_LIMIT_WINDOW_MS: "60000",
        ...settings,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout.on("data", (chunk) => { logs += chunk; });
    child.stderr.on("data", (chunk) => { logs += chunk; });
    let clientNumber = 1;
    const api = {
      logs() { return logs; },
      async request(route, { ip, ...options } = {}) {
        const response = await fetch(`http://127.0.0.1:${port}${route}`, {
          ...options,
          headers: {
            "Content-Type": "application/json", Origin: origin,
            "X-Forwarded-For": ip || `192.0.${Math.floor(clientNumber / 250)}.${clientNumber++ % 250 + 1}`,
            "X-Forwarded-Proto": "https", ...options.headers,
          },
        });
        const text = await response.text();
        return { response, body: text ? JSON.parse(text) : null };
      },
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        await new Promise((resolve) => {
          const timer = setTimeout(() => { child.kill("SIGKILL"); }, 5_000);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
          child.kill("SIGTERM");
        });
      },
    };
    processes.add(api);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Fixture API exited: ${logs}`);
      if (logs.includes("API listening on port")) return api;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Fixture API did not start: ${logs}`);
  }

  const api = await start();
  function register(email, token = `valid-${crypto.randomUUID()}`, extra = {}) {
    return api.request("/api/auth/register", {
      method: "POST", body: JSON.stringify({ email, password, displayName: "Security Test", turnstileToken: token, ...extra }),
    });
  }
  let cookie;
  const email = `security-${suffix}@example.test`;

  await t.test("production HTTPS headers and public config contain no provider secret", async () => {
    const { response, body } = await api.request("/api/auth/config");
    assert.equal(response.status, 200);
    assert.equal(body.googleClientId, null);
    assert.equal(body.turnstileSiteKey, "security-fixture-site-key");
    assert.equal(body.signupCaptchaRequired, true);
    assert.ok(!JSON.stringify(body).includes("security-fixture-secret-key"));
    assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
    const csp = response.headers.get("content-security-policy");
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "script-src-attr 'none'", "upgrade-insecure-requests", "https://challenges.cloudflare.com"]) {
      assert.ok(csp.includes(directive), directive);
    }
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    const blocked = await api.request("/api/auth/config", { headers: { Origin: "https://attacker.example" } });
    assert.equal(blocked.response.headers.get("access-control-allow-origin"), null);
  });

  await t.test("cross-origin, opaque-origin, cross-site, and non-JSON writes are blocked", async () => {
    for (const [headers, status] of [
      [{ Origin: "https://attacker.example" }, 403],
      [{ Origin: "null" }, 403],
      [{ "Sec-Fetch-Site": "cross-site" }, 403],
      [{ "Content-Type": "text/plain" }, 415],
    ]) {
      const result = await api.request("/api/auth/register", { method: "POST", headers, body: "{}" });
      assert.equal(result.response.status, status);
    }
    const preflight = await api.request("/api/auth/register", {
      method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    assert.equal(preflight.response.status, 204);
    assert.equal(preflight.response.headers.get("access-control-allow-origin"), origin);
    assert.match(preflight.response.headers.get("access-control-allow-methods"), /POST/);
  });

  await t.test("signup fails closed for missing, rejected, replayed, or unavailable CAPTCHA", async () => {
    for (const [token, status] of [
      ["", 400], ["invalid", 400], ["expired", 400], ["wrong-host", 400], ["wrong-action", 400],
      ["unavailable", 503], ["timeout", 503], ["malformed", 503],
    ]) {
      const result = await register(`rejected-${crypto.randomUUID()}@example.test`, token);
      assert.equal(result.response.status, status, token);
    }
    const { rows: [row] } = await databaseClient.query("SELECT count(*)::integer AS count FROM users");
    assert.equal(row.count, 0);
    const token = `valid-${crypto.randomUUID()}`;
    const registration = await register(email, token);
    assert.equal(registration.response.status, 201);
    const setCookie = registration.response.headers.get("set-cookie");
    assert.match(setCookie, /^__Host-bj_auth=/);
    for (const flag of ["HttpOnly", "Secure", "Path=/", "SameSite=Lax"]) assert.ok(setCookie.includes(flag));
    assert.ok(!/domain=/i.test(setCookie));
    cookie = setCookie.split(";", 1)[0];
    const replay = await register(`replay-${suffix}@example.test`, token);
    assert.equal(replay.response.status, 400);
  });

  await t.test("malformed and oversized JSON is rejected without leaking its contents", async () => {
    const privateValue = "do-not-log-this-password-or-token";
    const malformed = await api.request("/api/auth/register", {
      method: "POST", body: '{"password":"' + privateValue + '"',
    });
    assert.equal(malformed.response.status, 400);
    const oversized = await api.request("/api/auth/register", {
      method: "POST", body: JSON.stringify({ password: privateValue, padding: "x".repeat(17000) }),
    });
    assert.equal(oversized.response.status, 413);
    assert.ok(!api.logs().includes(privateValue));
    assert.ok(!api.logs().includes("security-fixture-secret-key"));
  });

  await t.test("restricted login supports authenticated session and statistics writes", async () => {
    const login = await api.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    assert.equal(login.response.status, 200);
    const wrongPassword = await api.request("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password: "wrong-security-password" }),
    });
    assert.equal(wrongPassword.response.status, 401);
    assert.equal(wrongPassword.body.error, "Invalid email or password");
    cookie = login.response.headers.get("set-cookie").split(";", 1)[0];
    const sessionId = crypto.randomUUID();
    const headers = { Cookie: cookie };
    const session = await api.request("/api/sessions", { method: "POST", headers, body: JSON.stringify({ sessionId, userAgent: "security-fixture" }) });
    assert.equal(session.response.status, 201);
    const stats = { rounds: 1, hands: 1, decisions: 1, correctDecisions: 1, hints: 0,
      mainWageredCents: 100, actualNetCents: 150, insuranceOffered: 0, insuranceTaken: 0,
      wins: 1, losses: 0, pushes: 0, blackjacks: 0, surrenders: 0 };
    assert.equal((await api.request("/api/session-stats", { method: "POST", headers, body: JSON.stringify({ sessionId, stats }) })).response.status, 200);
    const hand = {
      sessionId, roundIndex: 1, handIndex: 0, betCents: 100, outcome: "win", payoutCents: 150,
      playerCards: ["A♠", "K♥"], dealerCards: ["9♣", "7♦"], dealerUpcard: "9♣",
      didSplit: false, didDouble: false, didSurrender: false,
    };
    assert.equal((await api.request("/api/hands", { method: "POST", headers, body: JSON.stringify(hand) })).response.status, 201);
    const saved = await api.request("/api/users/me/stats", { headers });
    assert.equal(saved.body.stats.sessions, 1);
    assert.equal(saved.body.stats.rounds, 1);
    const other = await register(`other-${suffix}@example.test`);
    const otherCookie = other.response.headers.get("set-cookie").split(";", 1)[0];
    assert.equal((await api.request("/api/session-stats", {
      method: "POST", headers: { Cookie: otherCookie }, body: JSON.stringify({ sessionId, stats }),
    })).response.status, 403);
    assert.equal((await api.request("/api/hands", {
      method: "POST", headers: { Cookie: otherCookie }, body: JSON.stringify(hand),
    })).response.status, 403);
  });

  await t.test("login claims an anonymous session but cannot claim another user's session", async () => {
    const sessionId = crypto.randomUUID();
    assert.equal((await api.request("/api/sessions", {
      method: "POST", body: JSON.stringify({ sessionId }),
    })).response.status, 201);
    const login = await api.request("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password, sessionId }),
    });
    assert.equal(login.response.status, 200);
    const { rows: [claimed] } = await databaseClient.query(
      "SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1", [sessionId]
    );
    assert.equal(claimed.email, email);
    const conflicting = await api.request("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email: `other-${suffix}@example.test`, password, sessionId }),
    });
    assert.equal(conflicting.response.status, 409);
    assert.equal(conflicting.response.headers.get("set-cookie"), null);
    const { rows: [unchanged] } = await databaseClient.query(
      "SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1", [sessionId]
    );
    assert.equal(unchanged.email, email);
  });

  await t.test("logout revokes the token and clears the secure host cookie", async () => {
    const logout = await api.request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie }, body: "{}" });
    assert.equal(logout.response.status, 200);
    assert.match(logout.response.headers.get("set-cookie"), /^__Host-bj_auth=;/);
    assert.match(logout.response.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await api.request("/api/auth/me", { headers: { Cookie: cookie } })).response.status, 401);
    assert.equal((await api.request("/api/auth/me", { headers: { Cookie: "__Host-bj_auth=%ZZ" } })).response.status, 401);
    const login = await api.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    const expiredCookie = login.response.headers.get("set-cookie").split(";", 1)[0];
    await databaseClient.query("UPDATE auth_tokens SET expires_at = now() - interval '1 second'");
    assert.equal((await api.request("/api/auth/me", { headers: { Cookie: expiredCookie } })).response.status, 401);
  });

  await t.test("signup IP limits apply even to missing CAPTCHA tokens", async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await api.request("/api/auth/register", { method: "POST", ip: "198.51.100.10", body: "{}" });
      assert.equal(result.response.status, attempt < 5 ? 400 : 429);
    }
  });

  await t.test("signup identity and login IP limits cannot be bypassed with missing credentials", async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await api.request("/api/auth/register", {
        method: "POST", body: JSON.stringify({ email: `limited-signup-${suffix}@example.test` }),
      });
      assert.equal(result.response.status, attempt < 3 ? 400 : 429);
    }
    for (let attempt = 0; attempt < 41; attempt++) {
      const result = await api.request("/api/auth/login", { method: "POST", ip: "198.51.100.30", body: "{}" });
      assert.equal(result.response.status, attempt < 40 ? 401 : 429);
    }
  });

  await t.test("login identity limits survive API restart and different client IPs", async () => {
    const body = JSON.stringify({ email: `missing-${suffix}@example.test`, password });
    for (let attempt = 0; attempt < 11; attempt++) {
      const result = await api.request("/api/auth/login", { method: "POST", body });
      assert.equal(result.response.status, attempt < 10 ? 401 : 429);
    }
    await api.stop();
    const restarted = await start();
    assert.equal((await restarted.request("/api/auth/login", { method: "POST", ip: "203.0.113.99", body })).response.status, 429);
    await restarted.stop();
  });

  await t.test("global limits return Retry-After and allow requests after the window", async () => {
    const limited = await start({ RATE_LIMIT_MAX: "2", RATE_LIMIT_WINDOW_MS: "500" });
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await limited.request("/api/auth/config", { ip: "198.51.100.20" });
      assert.equal(result.response.status, attempt < 2 ? 200 : 429);
      if (attempt === 2) assert.match(result.response.headers.get("retry-after"), /^\d+$/);
    }
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal((await limited.request("/api/auth/config", { ip: "198.51.100.20" })).response.status, 200);
    await limited.stop();
  });
});
