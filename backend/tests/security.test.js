import assert from "node:assert/strict";
import test from "node:test";
import { readSecurityConfig, turnstileTestKeys } from "../security-config.js";
import { signupCaptcha } from "../turnstile.js";
import { logSecurityError } from "../security-log.js";

const config = { siteKey: "test-site-key", secretKey: "private-test-secret", hostname: "blackjack-trainer.co", required: true };
const production = {
  NODE_ENV: "production", ALLOWED_ORIGINS: "https://blackjack-trainer.co",
  TURNSTILE_SITE_KEY: config.siteKey, TURNSTILE_SECRET_KEY: config.secretKey,
  TURNSTILE_EXPECTED_HOSTNAME: config.hostname, REQUIRE_SIGNUP_CAPTCHA: "true",
};

test("production security settings reject incomplete protection and unsafe origins", () => {
  assert.equal(readSecurityConfig(production).turnstile.required, true);
  for (const changes of [
    { ALLOWED_ORIGINS: "" }, { ALLOWED_ORIGINS: " , " },
    { ALLOWED_ORIGINS: "http://blackjack-trainer.co" },
    { ALLOWED_ORIGINS: "https://blackjack-trainer.co/path" },
    { ALLOWED_ORIGINS: "https://username:password@blackjack-trainer.co" },
    { ALLOW_FILE_ORIGIN: "true" }, { REQUIRE_SIGNUP_CAPTCHA: "yes" },
    { TURNSTILE_SITE_KEY: "" }, { TURNSTILE_EXPECTED_HOSTNAME: "" },
    { TURNSTILE_EXPECTED_HOSTNAME: "https://blackjack-trainer.co" },
    { RATE_LIMIT_MAX: "0" }, { RATE_LIMIT_WINDOW_MS: "Infinity" },
    { TRUST_PROXY_HOPS: "1.5" },
  ]) assert.throws(() => readSecurityConfig({ ...production, ...changes }));
  for (const key of turnstileTestKeys) {
    assert.throws(() => readSecurityConfig({ ...production, TURNSTILE_SECRET_KEY: key }), /test keys/);
  }
  assert.throws(() => readSecurityConfig({ ...production, REQUIRE_SIGNUP_CAPTCHA: "false", TURNSTILE_EXPECTED_HOSTNAME: "" }));
  assert.equal(readSecurityConfig({ NODE_ENV: "development" }).turnstile.required, false);
  assert.equal(readSecurityConfig({ NODE_ENV: "production", ALLOWED_ORIGINS: production.ALLOWED_ORIGINS }).turnstile.required, false);
});

async function verify(token, fetch, settings = config, options = {}) {
  const result = { passed: false, status: 200, logs: [] };
  const res = {
    status(status) { result.status = status; return this; },
    json(body) { result.body = body; return this; },
  };
  await signupCaptcha(settings, { fetch, logger: { error: (message) => result.logs.push(message) }, ...options })(
    { body: { turnstileToken: token }, ip: "192.0.2.1" }, res, () => { result.passed = true; }
  );
  return result;
}

test("Turnstile sends verification only to Cloudflare and binds hostname/action", async () => {
  const result = await verify("valid-token", async (url, request) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(request.method, "POST");
    assert.equal(request.body.get("secret"), config.secretKey);
    assert.equal(request.body.get("response"), "valid-token");
    assert.equal(request.body.get("remoteip"), "192.0.2.1");
    assert.match(request.body.get("idempotency_key"), /^[0-9a-f-]{36}$/);
    assert.ok(request.signal instanceof AbortSignal);
    return Response.json({ success: true, hostname: config.hostname, action: "register" });
  });
  assert.equal(result.passed, true);
});

test("missing, malformed, and oversized tokens never contact Cloudflare", async () => {
  for (const token of [undefined, "", {}, ["token"], "x".repeat(2049)]) {
    const result = await verify(token, () => { throw new Error("Should not contact provider"); });
    assert.equal(result.status, 400);
    assert.equal(result.passed, false);
    assert.deepEqual(result.logs, []);
  }
});

test("failed, expired/replayed, wrong-hostname, and wrong-action verification is denied", async () => {
  for (const response of [
    { success: false }, { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, hostname: "attacker.example", action: "register" },
    { success: true, hostname: config.hostname, action: "login" },
  ]) {
    const result = await verify("token", async () => Response.json(response));
    assert.equal(result.status, 400);
    assert.equal(result.passed, false);
  }
});

test("provider failures fail closed without leaking secret or token in logs", async () => {
  for (const fetch of [
    async () => { throw new Error(config.secretKey + " sensitive-token"); },
    async () => new Response("failure", { status: 503 }),
    async () => new Response("not JSON"),
    async () => Response.json({ success: "true" }),
    async () => Response.json(null),
  ]) {
    const result = await verify("sensitive-token", fetch);
    assert.equal(result.status, 503);
    assert.equal(result.passed, false);
    assert.deepEqual(result.logs, ['{"event":"turnstile_verification_unavailable"}']);
    assert.ok(!JSON.stringify(result).includes(config.secretKey));
    assert.ok(!JSON.stringify(result).includes("sensitive-token"));
  }
});

test("verification has a bounded timeout and no bypass when protection is required", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await verify("token", (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }), config, { timeoutMs: 10 });
    assert.equal(result.status, 503);
  } finally { clearTimeout(keepAlive); }
  const required = await verify("token", undefined, { required: true });
  assert.equal(required.status, 503);
  const optional = await verify(undefined, undefined, { required: false });
  assert.equal(optional.passed, true);
});

test("request and database error logs exclude messages, stacks, bodies, and details", () => {
  const logs = [];
  logSecurityError("request_failed", {
    name: "SyntaxError", code: "42501", message: "private-password",
    stack: "private-connection-url", body: "private-captcha-token", detail: "private-email",
  }, { error: (message) => logs.push(message) });
  assert.deepEqual(JSON.parse(logs[0]), { event: "request_failed", error_type: "SyntaxError", error_code: "42501" });
  logSecurityError("request_failed", { name: "private-password", code: "private-secret" }, { error: (message) => logs.push(message) });
  assert.deepEqual(JSON.parse(logs[1]), { event: "request_failed" });
});
