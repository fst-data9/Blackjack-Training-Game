// Safe deployment checks: no account creation, login attempt, or rate-limit flood.
import assert from "node:assert/strict";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  environment: { type: "string" },
  "allow-unconfigured-turnstile": { type: "boolean", default: false },
} });
const environment = values.environment;
if (!["production", "staging"].includes(environment)) {
  throw new Error("Use --environment production or --environment staging");
}
const hostname = environment === "production" ? "blackjack-trainer.co" : "staging.blackjack-trainer.co";
const origin = `https://${hostname}`;
const optionalCaptcha = values["allow-unconfigured-turnstile"];
async function request(route, options = {}, base = origin) {
  return fetch(`${base}${route}`, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...options });
}

const health = await request("/api/health");
assert.equal(health.status, 200, "HTTPS health must pass");
assert.equal((await health.json()).ok, true);
assert.match(health.headers.get("strict-transport-security") || "", /max-age=[1-9]\d*/);
const csp = health.headers.get("content-security-policy") || "";
for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "https://challenges.cloudflare.com"]) {
  assert.ok(csp.includes(directive), `Missing CSP requirement: ${directive}`);
}
assert.equal(health.headers.get("x-content-type-options"), "nosniff");
assert.ok(["DENY", "SAMEORIGIN"].includes(health.headers.get("x-frame-options")));
assert.equal(health.headers.get("x-powered-by"), null);
console.log("HTTPS, health, CSP, HSTS, and response headers passed");

const configResponse = await request("/api/auth/config", { headers: { Origin: origin } });
assert.equal(configResponse.status, 200);
assert.equal(configResponse.headers.get("access-control-allow-origin"), origin);
assert.equal(configResponse.headers.get("access-control-allow-credentials"), "true");
const config = await configResponse.json();
assert.ok(!("turnstileSecretKey" in config), "Provider secret must not be public");
if (!optionalCaptcha) {
  assert.ok(config.turnstileSiteKey, "Turnstile widget is not configured");
  assert.equal(config.signupCaptchaRequired, true, "Signup CAPTCHA must be required");
}
console.log(`Turnstile: ${config.turnstileSiteKey ? "configured" : "not configured"}; Google: ${config.googleClientId ? "configured (console/browser checks still required)" : "disabled"}`);

const untrustedOrigin = "https://attacker.invalid";
const blocked = await request("/api/auth/config", { headers: { Origin: untrustedOrigin } });
assert.equal(blocked.headers.get("access-control-allow-origin"), null);
const preflight = await request("/api/auth/logout", {
  method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
for (const headers of [{ Origin: untrustedOrigin }, { Origin: "null" }, { Origin: origin, "Sec-Fetch-Site": "cross-site" }]) {
  const response = await request("/api/auth/logout", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: "{}",
  });
  assert.equal(response.status, 403, "Cross-site/opaque-origin writes must be rejected before authentication");
}
console.log("CORS, preflight, and Origin/cross-site write rejection passed");

for (const route of ["/.env", "/backend/.env", "/backend/.env.migrations", "/.git/config"]) {
  const response = await request(route);
  assert.ok([403, 404].includes(response.status), "Private configuration path must not be served");
  await response.arrayBuffer();
}
if (environment === "production") {
  const response = await request("/api/auth/config?security-check=1", {}, "https://www.blackjack-trainer.co");
  assert.equal(response.status, 308, "www must redirect to the canonical hostname");
  assert.equal(response.headers.get("location"), `${origin}/api/auth/config?security-check=1`);
  console.log("Canonical www redirect passed");
}
console.log(`Security endpoint checks passed for ${environment}. Verify signup/login/logout and cookie flags in the browser separately.`);
