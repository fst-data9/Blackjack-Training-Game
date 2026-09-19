import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";



// Load environment variables from .env
dotenv.config();

const app = express();
app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all incl. Origin: null (file://)
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.options("*", cors());

app.use(express.json()); // allows reading JSON bodies

// ---- Postgres connection pool ----
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

  // basic validation
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
    if (h[field] === undefined) {
      return res.status(400).json({
        error: `Missing field: ${field}`,
      });
    }
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

// ---- Start the server ----
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
app.post("/api/sessions", async (req, res) => {
  const { sessionId, userAgent } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    await pool.query(
      "INSERT INTO sessions (id, user_agent) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [sessionId, userAgent ?? null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("Failed to insert session:", err);
    res.status(500).json({ error: "Database error" });
  }
});
