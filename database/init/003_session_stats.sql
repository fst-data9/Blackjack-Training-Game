CREATE TABLE IF NOT EXISTS session_stats (
  session_id text PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  rounds integer NOT NULL DEFAULT 0 CHECK (rounds >= 0),
  hands integer NOT NULL DEFAULT 0 CHECK (hands >= 0),
  decisions integer NOT NULL DEFAULT 0 CHECK (decisions >= 0),
  correct_decisions integer NOT NULL DEFAULT 0 CHECK (correct_decisions >= 0),
  hints integer NOT NULL DEFAULT 0 CHECK (hints >= 0),
  main_wagered_cents bigint NOT NULL DEFAULT 0 CHECK (main_wagered_cents >= 0),
  actual_net_cents bigint NOT NULL DEFAULT 0,
  insurance_offered integer NOT NULL DEFAULT 0 CHECK (insurance_offered >= 0),
  insurance_taken integer NOT NULL DEFAULT 0 CHECK (insurance_taken >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  pushes integer NOT NULL DEFAULT 0 CHECK (pushes >= 0),
  blackjacks integer NOT NULL DEFAULT 0 CHECK (blackjacks >= 0),
  surrenders integer NOT NULL DEFAULT 0 CHECK (surrenders >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (correct_decisions <= decisions),
  CHECK (insurance_taken <= insurance_offered)
);

CREATE INDEX IF NOT EXISTS session_stats_updated_at_idx ON session_stats(updated_at);
