// Keep deployment errors actionable without including credential values.
export const turnstileTestKeys = new Set([
  "1x00000000000000000000AA", "2x00000000000000000000AB",
  "1x00000000000000000000BB", "2x00000000000000000000BB",
  "3x00000000000000000000FF",
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

function booleanSetting(env, name) {
  const value = env[name] || "false";
  if (!["true", "false"].includes(value)) throw new Error(`${name} must be true or false`);
  return value === "true";
}

function integerSetting(env, name, fallback, minimum, maximum) {
  const value = env[name] || String(fallback);
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
}

export function readSecurityConfig(env) {
  const production = env.NODE_ENV === "production";
  const allowedOrigins = (env.ALLOWED_ORIGINS ||
    "http://localhost:3001,http://127.0.0.1:3001")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (production && (!env.ALLOWED_ORIGINS || !allowedOrigins.length)) {
    throw new Error("ALLOWED_ORIGINS is required in production");
  }
  for (const origin of allowedOrigins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error("ALLOWED_ORIGINS must contain exact HTTP(S) origins"); }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths or credentials");
    }
    if (production && url.protocol !== "https:") throw new Error("Production ALLOWED_ORIGINS must use HTTPS");
  }

  const allowFileOrigin = booleanSetting(env, "ALLOW_FILE_ORIGIN");
  if (production && allowFileOrigin) throw new Error("ALLOW_FILE_ORIGIN must be false in production");
  const siteKey = env.TURNSTILE_SITE_KEY || "";
  const secretKey = env.TURNSTILE_SECRET_KEY || "";
  const hostname = env.TURNSTILE_EXPECTED_HOSTNAME || "";
  const required = booleanSetting(env, "REQUIRE_SIGNUP_CAPTCHA");
  if (Boolean(siteKey) !== Boolean(secretKey)) {
    throw new Error("TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be configured together");
  }
  if ((required || (production && secretKey)) && (!secretKey || !hostname)) {
    throw new Error("Signup CAPTCHA needs both Turnstile keys and TURNSTILE_EXPECTED_HOSTNAME");
  }
  if (hostname && (hostname.length > 253 || !hostname.split(".").every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  ))) {
    throw new Error("TURNSTILE_EXPECTED_HOSTNAME must be a lowercase hostname without a scheme or path");
  }
  if (production && secretKey && !allowedOrigins.some((origin) => new URL(origin).hostname === hostname)) {
    throw new Error("TURNSTILE_EXPECTED_HOSTNAME must match an allowed production origin");
  }
  if (production && (turnstileTestKeys.has(siteKey) || turnstileTestKeys.has(secretKey))) {
    throw new Error("Cloudflare test keys must not be used in production");
  }
  return {
    allowedOrigins, allowFileOrigin,
    trustProxyHops: integerSetting(env, "TRUST_PROXY_HOPS", 0, 0, 10),
    rateLimitWindowMs: integerSetting(env, "RATE_LIMIT_WINDOW_MS", 60_000, 1, 86_400_000),
    rateLimitMax: integerSetting(env, "RATE_LIMIT_MAX", 120, 1, 1_000_000),
    turnstile: { siteKey, secretKey, hostname, required },
  };
}
