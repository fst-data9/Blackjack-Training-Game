import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import crypto from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OAuth2Client } from "google-auth-library";
import helmet from "helmet";

// Load environment variables from .env
dotenv.config();

const app = express();
app.disable("x-powered-by");

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "http://localhost:3001,http://127.0.0.1:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowFileOrigin = process.env.ALLOW_FILE_ORIGIN === "true";

if (process.env.NODE_ENV === "production") {
  if (!process.env.ALLOWED_ORIGINS) throw new Error("ALLOWED_ORIGINS is required in production");
  if (allowFileOrigin) throw new Error("ALLOW_FILE_ORIGIN must be false in production");
}

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  strictTransportSecurity: process.env.NODE_ENV === "production" ? undefined : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://challenges.cloudflare.com"],
      fontSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://challenges.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "https://accounts.google.com", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
}));
app.use((req, res, next) => {
  res.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  next();
});

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || origin === "null") return cb(null, allowFileOrigin);
    return cb(null, allowedOrigins.includes(origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "16kb" }));

function rejectCrossSiteWrites(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.is("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }
  if (req.get("Sec-Fetch-Site") === "cross-site") {
    return res.status(403).json({ error: "Cross-site request blocked" });
  }

  const origin = req.get("Origin");
  if (!origin) return next(); // Non-browser clients do not always send Origin.
  if (origin === "null" && allowFileOrigin) return next();
  if (allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ error: "Origin not allowed" });
}

app.use("/api", rejectCrossSiteWrites);

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 120);
const requestCounts = new Map();

function rateLimit(req, res, next) {
  if (req.method === "OPTIONS") return next();

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const entry = requestCounts.get(key);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
    return next();
  }

  entry.count += 1;
  if (entry.count > rateLimitMax) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    return res.status(429).json({ error: "Too many requests" });
  }

  return next();
}

app.use("/api", rateLimit);

const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts) {
    if (entry.resetAt <= now) requestCounts.delete(key);
  }
}, Math.max(60_000, rateLimitWindowMs));
rateLimitCleanup.unref();

// ---- Postgres connection pool ----
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5_000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
  query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 6_000),
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 5_000),
  application_name: "blackjack-api",
});

const pbkdf2 = promisify(crypto.pbkdf2);
const PASSWORD_ITERATIONS = 600_000;
const AUTH_COOKIE = process.env.NODE_ENV === "production" ? "__Host-bj_auth" : "bj_auth";
const AUTH_TOKEN_TTL_DAYS = 30;
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || "";
const requireSignupCaptcha = process.env.REQUIRE_SIGNUP_CAPTCHA === "true";
const expectedTurnstileHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME || "";
const DUMMY_PASSWORD_HASH = `pbkdf2_sha256$${PASSWORD_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (Boolean(turnstileSiteKey) !== Boolean(turnstileSecretKey)) {
  throw new Error("TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be configured together");
}
if (requireSignupCaptcha && (!turnstileSecretKey || !expectedTurnstileHostname)) {
  throw new Error("Required signup CAPTCHA needs both Turnstile keys and TURNSTILE_EXPECTED_HOSTNAME");
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 10 && password.length <= 128;
}

function isValidSessionId(value) {
  return typeof value === "string" && sessionIdPattern.test(value);
}

function rateKeyHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function consumeAuthLimit(bucket, value, maximum, windowSeconds) {
  const result = await pool.query(
    `INSERT INTO auth_rate_limits (bucket, key_hash, window_started_at, attempts)
     VALUES ($1, $2, now(), 1)
     ON CONFLICT (bucket, key_hash) DO UPDATE SET
       attempts = CASE
         WHEN auth_rate_limits.window_started_at <= now() - ($3 * interval '1 second') THEN 1
         ELSE auth_rate_limits.attempts + 1
       END,
       window_started_at = CASE
         WHEN auth_rate_limits.window_started_at <= now() - ($3 * interval '1 second') THEN now()
         ELSE auth_rate_limits.window_started_at
       END
     RETURNING attempts`,
    [bucket, rateKeyHash(value), windowSeconds]
  );
  return result.rows[0].attempts <= maximum;
}

function authRateLimit({ bucket, ip, identity }) {
  return async (req, res, next) => {
    try {
      const checks = [consumeAuthLimit(`${bucket}:ip`, req.ip || "unknown", ip.maximum, ip.windowSeconds)];
      const email = normalizeEmail(req.body?.email);
      if (identity && email) {
        checks.push(consumeAuthLimit(`${bucket}:email`, email, identity.maximum, identity.windowSeconds));
      }
      const allowed = await Promise.all(checks);
      if (allowed.some((value) => !value)) {
        return res.status(429).json({ error: "Too many attempts. Try again later." });
      }
      return next();
    } catch (err) {
      console.error("Authentication rate limiter failed:", err);
      return res.status(503).json({ error: "Authentication is temporarily unavailable" });
    }
  };
}

const registerRateLimit = authRateLimit({
  bucket: "register",
  ip: { maximum: 5, windowSeconds: 60 * 60 },
  identity: { maximum: 3, windowSeconds: 24 * 60 * 60 },
});
const loginRateLimit = authRateLimit({
  bucket: "login",
  ip: { maximum: 40, windowSeconds: 15 * 60 },
  identity: { maximum: 10, windowSeconds: 15 * 60 },
});
const googleRateLimit = authRateLimit({
  bucket: "google",
  ip: { maximum: 30, windowSeconds: 15 * 60 },
});

async function verifySignupCaptcha(req, res, next) {
  if (!turnstileSecretKey) {
    if (requireSignupCaptcha) {
      return res.status(503).json({ error: "Account creation is temporarily unavailable" });
    }
    return next();
  }

  const token = req.body?.turnstileToken;
  if (typeof token !== "string" || token.length < 1 || token.length > 2048) {
    return res.status(400).json({ error: "Complete the human verification challenge" });
  }

  try {
    const body = new URLSearchParams({
      secret: turnstileSecretKey,
      response: token,
      remoteip: req.ip || "",
      idempotency_key: crypto.randomUUID(),
    });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    const result = await response.json();
    const validHostname = !expectedTurnstileHostname || result.hostname === expectedTurnstileHostname;
    if (!response.ok || !result.success || result.action !== "register" || !validHostname) {
      return res.status(400).json({ error: "Human verification failed. Please try again." });
    }
    return next();
  } catch (err) {
    console.error("Turnstile verification failed:", err);
    return res.status(503).json({ error: "Human verification is temporarily unavailable" });
  }
}

const authRateCleanup = setInterval(() => {
  Promise.all([
    pool.query("DELETE FROM auth_rate_limits WHERE window_started_at < now() - interval '2 days'"),
    pool.query("DELETE FROM auth_tokens WHERE expires_at <= now()"),
  ])
    .catch((err) => console.error("Failed to clean authentication rate limits:", err));
}, 60 * 60_000);
authRateCleanup.unref();

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await pbkdf2(password, salt, PASSWORD_ITERATIONS, 32, "sha256");
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, iterationsText, saltText, hashText] = String(storedHash || "").split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== "pbkdf2_sha256" ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000 ||
    !saltText ||
    !hashText
  ) {
    return false;
  }

  const expected = Buffer.from(hashText, "base64url");
  const actual = await pbkdf2(password, Buffer.from(saltText, "base64url"), iterations, expected.length, "sha256");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value.join("="));
    } catch {
      // Ignore malformed cookies instead of turning them into a server error.
    }
  }
  return cookies;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setAuthCookie(res, token, maxAgeSeconds) {
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Priority=High",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

async function createLogin(req, res, user) {
  if (isValidSessionId(req.body?.sessionId)) {
    await claimSession(req.body.sessionId, user.id);
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const maxAgeSeconds = AUTH_TOKEN_TTL_DAYS * 24 * 60 * 60;
  await pool.query(
    `INSERT INTO auth_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 * interval '1 second'))`,
    [tokenHash(token), user.id, maxAgeSeconds]
  );
  setAuthCookie(res, token, maxAgeSeconds);
}

async function claimSession(sessionId, userId) {
  const result = await pool.query(
    `INSERT INTO sessions (id, user_id) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id
     WHERE sessions.user_id IS NULL OR sessions.user_id = EXCLUDED.user_id
     RETURNING user_id`,
    [sessionId, userId]
  );
  if (result.rowCount === 0) {
    const error = new Error("Session belongs to another account");
    error.status = 409;
    throw error;
  }
}

async function authenticateOptional(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
    if (!token) return next();

    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name
       FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.expires_at > now()`,
      [tokenHash(token)]
    );
    if (result.rows[0]) req.user = result.rows[0];
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  return next();
}

const validOutcomes = new Set(["win", "lose", "push", "blackjack", "surrender"]);
const cardPattern = /^(A|[2-9]|10|J|Q|K)[♠♥♦♣]$/u;

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isCardArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 12 &&
    value.every((card) => typeof card === "string" && cardPattern.test(card))
  );
}

function validateHandPayload(h) {
  const requiredFields = [
    "roundIndex",
    "handIndex",
    "betCents",
    "outcome",
    "payoutCents",
    "playerCards",
    "dealerCards",
  ];

  for (const field of requiredFields) {
    if (h[field] === undefined) return `Missing field: ${field}`;
  }

  if (h.sessionId !== undefined && h.sessionId !== null) {
    if (!isValidSessionId(h.sessionId)) {
      return "Invalid sessionId";
    }
  }

  if (!isIntegerInRange(h.roundIndex, 1, 1_000_000)) return "Invalid roundIndex";
  if (!isIntegerInRange(h.handIndex, 0, 10)) return "Invalid handIndex";
  if (!isIntegerInRange(h.betCents, 0, 10_000_000)) return "Invalid betCents";
  if (!isIntegerInRange(h.payoutCents, -10_000_000, 20_000_000)) {
    return "Invalid payoutCents";
  }
  if (!validOutcomes.has(h.outcome)) return "Invalid outcome";
  if (!isCardArray(h.playerCards)) return "Invalid playerCards";
  if (!isCardArray(h.dealerCards)) return "Invalid dealerCards";

  if (h.dealerUpcard !== undefined && h.dealerUpcard !== null) {
    if (typeof h.dealerUpcard !== "string" || !cardPattern.test(h.dealerUpcard)) {
      return "Invalid dealerUpcard";
    }
  }

  return null;
}

function validateStatsPayload(stats) {
  const nonNegativeFields = [
    "rounds", "hands", "decisions", "correctDecisions", "hints",
    "mainWageredCents", "insuranceOffered", "insuranceTaken",
    "wins", "losses", "pushes", "blackjacks", "surrenders",
  ];
  for (const field of nonNegativeFields) {
    if (!isIntegerInRange(stats[field], 0, 1_000_000_000)) return `Invalid ${field}`;
  }
  if (!Number.isSafeInteger(stats.actualNetCents) || Math.abs(stats.actualNetCents) > 1_000_000_000_000) {
    return "Invalid actualNetCents";
  }
  if (stats.correctDecisions > stats.decisions) return "Correct decisions cannot exceed decisions";
  if (stats.insuranceTaken > stats.insuranceOffered) return "Insurance taken cannot exceed offers";
  return null;
}

// ---- Health check route ----
// Used to confirm Node + Postgres are working
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as now");
    res.json({
      ok: true,
      time: result.rows[0].now,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// ---- Authentication ----
app.get("/api/auth/config", (req, res) => {
  res.json({
    googleClientId: googleClientId || null,
    turnstileSiteKey: turnstileSecretKey ? turnstileSiteKey || null : null,
  });
});

app.post("/api/auth/register", registerRateLimit, verifySignupCaptcha, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const password = req.body?.password;

  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (displayName.length < 1 || displayName.length > 80) {
    return res.status(400).json({ error: "Name must be between 1 and 80 characters" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Password must be between 10 and 128 characters" });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name`,
      [crypto.randomUUID(), email, displayName, passwordHash]
    );
    await createLogin(req, res, result.rows[0]);
    return res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Unable to create an account with those details" });
    console.error("Registration failed:", err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Unable to create account" });
  }
});

app.post("/api/auth/login", loginRateLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  try {
    const result = await pool.query(
      "SELECT id, email, display_name, password_hash FROM users WHERE lower(email) = $1",
      [email]
    );
    const user = result.rows[0];
    const passwordMatches = await verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!user?.password_hash || !passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await createLogin(req, res, user);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("Login failed:", err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Unable to sign in" });
  }
});

app.post("/api/auth/google", googleRateLimit, async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: "Google sign-in is not configured" });
  if (typeof req.body?.credential !== "string") {
    return res.status(400).json({ error: "Missing Google credential" });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: req.body.credential,
      audience: googleClientId,
    });
    const profile = ticket.getPayload();
    const email = normalizeEmail(profile?.email);
    if (!profile?.sub || !profile.email_verified || !isValidEmail(email)) {
      return res.status(401).json({ error: "Google could not verify this email address" });
    }

    let result = await pool.query(
      `SELECT u.id, u.email, u.display_name
       FROM oauth_identities o
       JOIN users u ON u.id = o.user_id
       WHERE o.provider = 'google' AND o.provider_user_id = $1`,
      [profile.sub]
    );
    let user = result.rows[0];

    if (!user) {
      const existing = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
      if (existing.rowCount > 0) {
        return res.status(409).json({
          error: "This email already has an account. Sign in with your password first.",
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        result = await client.query(
          `INSERT INTO users (id, email, display_name)
           VALUES ($1, $2, $3)
           RETURNING id, email, display_name`,
          [crypto.randomUUID(), email, String(profile.name || email.split("@")[0]).slice(0, 80)]
        );
        user = result.rows[0];
        await client.query(
          `INSERT INTO oauth_identities (provider, provider_user_id, user_id)
           VALUES ('google', $1, $2)`,
          [profile.sub, user.id]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    await createLogin(req, res, user);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("Google login failed:", err);
    return res.status(err.status || 401).json({ error: err.status ? err.message : "Google sign-in failed" });
  }
});

app.get("/api/auth/me", authenticateOptional, requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post("/api/auth/logout", authenticateOptional, async (req, res) => {
  try {
    const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
    if (token) await pool.query("DELETE FROM auth_tokens WHERE token_hash = $1", [tokenHash(token)]);
    setAuthCookie(res, "", 0);
    return res.json({ success: true });
  } catch (err) {
    console.error("Logout failed:", err);
    return res.status(500).json({ error: "Unable to sign out" });
  }
});

// ---- Record a finished blackjack hand ----
app.post("/api/hands", authenticateOptional, async (req, res) => {
  const h = req.body;
  const validationError = validateHandPayload(h);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    if (h.sessionId) {
      const session = await pool.query("SELECT user_id FROM sessions WHERE id = $1", [h.sessionId]);
      if (session.rowCount === 0) return res.status(400).json({ error: "Unknown sessionId" });
      const ownerId = session.rows[0].user_id;
      if (ownerId && ownerId !== req.user?.id) {
        return res.status(403).json({ error: "This session belongs to another account" });
      }
    }

    const sql = `
      INSERT INTO hands (
        session_id,
        round_index,
        hand_index,
        bet_cents,
        outcome,
        payout_cents,
        player_cards,
        dealer_cards,
        dealer_upcard,
        did_split,
        did_double,
        did_surrender
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7::jsonb,$8::jsonb,$9,
        $10,$11,$12
      )
      RETURNING id, created_at
    `;

    const values = [
      h.sessionId ?? null,
      h.roundIndex,
      h.handIndex,
      h.betCents,
      h.outcome,
      h.payoutCents,
      JSON.stringify(h.playerCards),
      JSON.stringify(h.dealerCards),
      h.dealerUpcard ?? null,
      !!h.didSplit,
      !!h.didDouble,
      !!h.didSurrender,
    ];

    const result = await pool.query(sql, values);

    res.status(201).json({
      success: true,
      handId: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    console.error("Failed to insert hand:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/sessions", authenticateOptional, async (req, res) => {
  const { sessionId, userAgent } = req.body;

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId" });
  }

  if (userAgent !== undefined && userAgent !== null && typeof userAgent !== "string") {
    return res.status(400).json({ error: "Invalid userAgent" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO sessions (id, user_agent, user_id) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         user_agent = COALESCE(sessions.user_agent, EXCLUDED.user_agent),
         user_id = COALESCE(sessions.user_id, EXCLUDED.user_id)
       WHERE sessions.user_id IS NULL OR sessions.user_id = EXCLUDED.user_id OR EXCLUDED.user_id IS NULL
       RETURNING user_id`,
      [sessionId, userAgent ? userAgent.slice(0, 512) : null, req.user?.id || null]
    );
    if (result.rowCount === 0) return res.status(409).json({ error: "Session belongs to another account" });
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("Failed to insert session:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/session-stats", authenticateOptional, async (req, res) => {
  const { sessionId, stats } = req.body || {};
  if (!isValidSessionId(sessionId) || !stats) {
    return res.status(400).json({ error: "Invalid session stats" });
  }
  const validationError = validateStatsPayload(stats);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const session = await pool.query("SELECT user_id FROM sessions WHERE id = $1", [sessionId]);
    if (session.rowCount === 0) return res.status(409).json({ error: "Session is not ready" });
    const ownerId = session.rows[0].user_id;
    if (ownerId && ownerId !== req.user?.id) {
      return res.status(403).json({ error: "This session belongs to another account" });
    }

    await pool.query(
      `INSERT INTO session_stats (
         session_id, rounds, hands, decisions, correct_decisions, hints,
         main_wagered_cents, actual_net_cents, insurance_offered, insurance_taken,
         wins, losses, pushes, blackjacks, surrenders, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
       ON CONFLICT (session_id) DO UPDATE SET
         rounds = EXCLUDED.rounds,
         hands = EXCLUDED.hands,
         decisions = EXCLUDED.decisions,
         correct_decisions = EXCLUDED.correct_decisions,
         hints = EXCLUDED.hints,
         main_wagered_cents = EXCLUDED.main_wagered_cents,
         actual_net_cents = EXCLUDED.actual_net_cents,
         insurance_offered = EXCLUDED.insurance_offered,
         insurance_taken = EXCLUDED.insurance_taken,
         wins = EXCLUDED.wins,
         losses = EXCLUDED.losses,
         pushes = EXCLUDED.pushes,
         blackjacks = EXCLUDED.blackjacks,
         surrenders = EXCLUDED.surrenders,
         updated_at = now()`,
      [
        sessionId, stats.rounds, stats.hands, stats.decisions, stats.correctDecisions,
        stats.hints, stats.mainWageredCents, stats.actualNetCents,
        stats.insuranceOffered, stats.insuranceTaken, stats.wins, stats.losses,
        stats.pushes, stats.blackjacks, stats.surrenders,
      ]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to update session stats:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/users/me/stats", authenticateOptional, requireUser, async (req, res) => {
  try {
    const totalsResult = await pool.query(
      `SELECT
         count(*)::integer AS sessions,
         COALESCE(sum(st.rounds), 0) AS rounds,
         COALESCE(sum(st.hands), 0) AS hands,
         COALESCE(sum(st.decisions), 0) AS decisions,
         COALESCE(sum(st.correct_decisions), 0) AS correct_decisions,
         COALESCE(sum(st.hints), 0) AS hints,
         COALESCE(sum(st.main_wagered_cents), 0) AS main_wagered_cents,
         COALESCE(sum(st.actual_net_cents), 0) AS actual_net_cents,
         COALESCE(sum(st.insurance_offered), 0) AS insurance_offered,
         COALESCE(sum(st.insurance_taken), 0) AS insurance_taken,
         COALESCE(sum(st.wins), 0) AS wins,
         COALESCE(sum(st.losses), 0) AS losses,
         COALESCE(sum(st.pushes), 0) AS pushes,
         COALESCE(sum(st.blackjacks), 0) AS blackjacks,
         COALESCE(sum(st.surrenders), 0) AS surrenders
       FROM session_stats st
       JOIN sessions s ON s.id = st.session_id
       WHERE s.user_id = $1`,
      [req.user.id]
    );
    const row = totalsResult.rows[0];
    const stats = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));

    const historyResult = await pool.query(
      `SELECT h.round_index, h.hand_index, h.outcome, h.payout_cents, h.created_at
       FROM hands h
       JOIN sessions s ON s.id = h.session_id
       WHERE s.user_id = $1
       ORDER BY h.created_at DESC
       LIMIT 12`,
      [req.user.id]
    );
    return res.json({ stats, history: historyResult.rows });
  } catch (err) {
    console.error("Failed to load user stats:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// Serve the small frontend from the API origin so HttpOnly login cookies work
// locally in the same way they will on the deployed website.
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.get("/", (req, res) => res.sendFile(path.join(frontendRoot, "index.html")));
app.get("/blackjack-game.js", (req, res) => res.sendFile(path.join(frontendRoot, "blackjack-game.js")));
app.get("/auth.js", (req, res) => res.sendFile(path.join(frontendRoot, "auth.js")));
app.use("/images", express.static(path.join(frontendRoot, "images"), { dotfiles: "deny" }));

app.use((err, req, res, next) => {
  console.error("Unhandled request error:", err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: "Internal server error" });
});

// ---- Start the server ----
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
