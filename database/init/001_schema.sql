CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hands (
  id bigserial PRIMARY KEY,
  session_id text REFERENCES sessions(id) ON DELETE SET NULL,
  round_index integer NOT NULL,
  hand_index integer NOT NULL,
  bet_cents integer NOT NULL CHECK (bet_cents >= 0),
  outcome text NOT NULL CHECK (
    outcome IN ('win', 'lose', 'push', 'blackjack', 'surrender')
  ),
  payout_cents integer NOT NULL,
  player_cards jsonb NOT NULL,
  dealer_cards jsonb NOT NULL,
  dealer_upcard text,
  did_split boolean NOT NULL DEFAULT false,
  did_double boolean NOT NULL DEFAULT false,
  did_surrender boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hands_session_id_idx ON hands(session_id);
CREATE INDEX IF NOT EXISTS hands_created_at_idx ON hands(created_at);
