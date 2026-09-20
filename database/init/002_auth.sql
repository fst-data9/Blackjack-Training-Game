CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS oauth_identities (
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS oauth_identities_user_id_idx ON oauth_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_tokens_user_id_idx ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS auth_tokens_expires_at_idx ON auth_tokens(expires_at);

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
