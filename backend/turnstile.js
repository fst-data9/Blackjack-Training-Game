import crypto from "node:crypto";

export function signupCaptcha(config, { fetch: verify = globalThis.fetch, logger = console, timeoutMs = 5_000 } = {}) {
  return async (req, res, next) => {
    if (!config.secretKey) {
      if (config.required) return res.status(503).json({ error: "Account creation is temporarily unavailable" });
      return next();
    }
    const token = req.body?.turnstileToken;
    if (typeof token !== "string" || !token.length || token.length > 2048) {
      return res.status(400).json({ error: "Complete the human verification challenge" });
    }
    try {
      const response = await verify("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: config.secretKey,
          response: token,
          remoteip: req.ip || "",
          idempotency_key: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error("Provider HTTP failure");
      const result = await response.json();
      if (!result || typeof result.success !== "boolean") throw new Error("Malformed provider response");
      if (!result.success || result.action !== "register" ||
          (config.hostname && result.hostname !== config.hostname)) {
        return res.status(400).json({ error: "Human verification failed. Please try again." });
      }
      return next();
    } catch {
      // Never log request bodies, tokens, provider secrets, or arbitrary errors.
      logger.error(JSON.stringify({ event: "turnstile_verification_unavailable" }));
      return res.status(503).json({ error: "Human verification is temporarily unavailable" });
    }
  };
}
