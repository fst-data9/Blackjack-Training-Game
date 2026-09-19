import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

// Load environment variables from .env
dotenv.config();

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "http://localhost:3001,http://127.0.0.1:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowFileOrigin = process.env.ALLOW_FILE_ORIGIN === "true";

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || origin === "null") return cb(null, allowFileOrigin);
    return cb(null, allowedOrigins.includes(origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "16kb" }));

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
    return res.status(429).json({ error: "Too many requests" });
  }

  return next();
}

app.use("/api", rateLimit);

// ---- Postgres connection pool ----
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
    if (typeof h.sessionId !== "string" || h.sessionId.length > 100) {
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

// ---- Record a finished blackjack hand ----
app.post("/api/hands", async (req, res) => {
  const h = req.body;
  const validationError = validateHandPayload(h);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
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

app.post("/api/sessions", async (req, res) => {
  const { sessionId, userAgent } = req.body;

  if (typeof sessionId !== "string" || sessionId.length > 100) {
    return res.status(400).json({ error: "Invalid sessionId" });
  }

  if (userAgent !== undefined && userAgent !== null && typeof userAgent !== "string") {
    return res.status(400).json({ error: "Invalid userAgent" });
  }

  try {
    await pool.query(
      "INSERT INTO sessions (id, user_agent) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [sessionId, userAgent ? userAgent.slice(0, 512) : null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("Failed to insert session:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---- Start the server ----
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
