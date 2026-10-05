// Loaded only by the test process with node --import; no runtime bypass option.
const originalFetch = globalThis.fetch;
const redeemed = new Set();
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    return originalFetch(url, options);
  }
  const token = options.body.get("response");
  if (token === "unavailable") throw new Error("Fixture provider unavailable");
  if (token === "timeout") throw new DOMException("Fixture timeout", "TimeoutError");
  if (token === "malformed") return new Response("not JSON");
  if (redeemed.has(token) || token === "expired") {
    return Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
  }
  if (token?.startsWith("valid-")) redeemed.add(token);
  return Response.json({
    success: token?.startsWith("valid-") || ["wrong-host", "wrong-action"].includes(token),
    hostname: token === "wrong-host" ? "attacker.example" : process.env.TURNSTILE_EXPECTED_HOSTNAME,
    action: token === "wrong-action" ? "login" : "register",
  });
};
