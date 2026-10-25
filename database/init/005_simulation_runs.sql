-- One record per completed run. No cards, decisions or individual hands.
CREATE TABLE simulation_runs (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  engine_version integer NOT NULL CHECK (engine_version > 0),
  seed bigint NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  results jsonb NOT NULL CHECK (jsonb_typeof(results) = 'object')
);
CREATE INDEX simulation_runs_created_at_idx ON simulation_runs (created_at);
