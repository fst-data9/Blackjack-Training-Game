import assert from "node:assert/strict";
import crypto from "node:crypto";

const baseUrl = process.env.API_URL || "http://127.0.0.1:3001";
const email = `integration-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
const password = "integration-test-password";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Expected the response to set an authentication cookie");
  return setCookie.split(";", 1)[0];
}

const health = await request("/api/health");
assert.equal(health.response.status, 200);
assert.equal(health.body.ok, true);

const config = await request("/api/auth/config");
assert.equal(config.response.status, 200);
assert.equal(config.body.googleClientId, null);

const registration = await request("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({
    email: email.toUpperCase(),
    displayName: "Integration Test",
    password,
  }),
});
assert.equal(registration.response.status, 201);
assert.equal(registration.body.user.email, email);
const cookie = cookieFrom(registration.response);

const currentUser = await request("/api/auth/me", {
  headers: { Cookie: cookie },
});
assert.equal(currentUser.response.status, 200);
assert.equal(currentUser.body.user.email, email);

const sessionId = crypto.randomUUID();
const session = await request("/api/sessions", {
  method: "POST",
  headers: { Cookie: cookie },
  body: JSON.stringify({ sessionId, userAgent: "ci-integration-test" }),
});
assert.equal(session.response.status, 201);

const stats = await request("/api/session-stats", {
  method: "POST",
  headers: { Cookie: cookie },
  body: JSON.stringify({
    sessionId,
    stats: {
      rounds: 1,
      hands: 1,
      decisions: 1,
      correctDecisions: 1,
      hints: 0,
      mainWageredCents: 100,
      actualNetCents: 150,
      insuranceOffered: 0,
      insuranceTaken: 0,
      wins: 1,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
      surrenders: 0,
    },
  }),
});
assert.equal(stats.response.status, 200);

const hand = await request("/api/hands", {
  method: "POST",
  headers: { Cookie: cookie },
  body: JSON.stringify({
    sessionId,
    roundIndex: 1,
    handIndex: 0,
    betCents: 100,
    outcome: "win",
    payoutCents: 150,
    playerCards: ["A♠", "K♥"],
    dealerCards: ["9♣", "7♦"],
    dealerUpcard: "9♣",
    didSplit: false,
    didDouble: false,
    didSurrender: false,
  }),
});
assert.equal(hand.response.status, 201);
assert.ok(hand.body.handId);

const userStats = await request("/api/users/me/stats", {
  headers: { Cookie: cookie },
});
assert.equal(userStats.response.status, 200);
assert.equal(userStats.body.stats.sessions, 1);
assert.equal(userStats.body.stats.rounds, 1);
assert.equal(userStats.body.stats.hands, 1);
assert.equal(userStats.body.history.length, 1);

const logout = await request("/api/auth/logout", {
  method: "POST",
  headers: { Cookie: cookie },
});
assert.equal(logout.response.status, 200);

const afterLogout = await request("/api/auth/me", {
  headers: { Cookie: cookie },
});
assert.equal(afterLogout.response.status, 401);

console.log("API and PostgreSQL integration test passed");
