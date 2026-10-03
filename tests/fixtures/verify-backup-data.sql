DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN sessions s ON s.user_id = u.id
    JOIN hands h ON h.session_id = s.id
    JOIN session_stats st ON st.session_id = s.id
    WHERE u.email = 'backup-fixture@example.test'
      AND u.password_hash = 'fixture-hash'
      AND s.user_agent = 'backup-test'
      AND h.bet_cents = 2500 AND h.payout_cents = 3750
      AND h.player_cards = '["A♠","K♥"]'::jsonb
      AND h.dealer_cards = '["9♣","7♦"]'::jsonb
      AND st.rounds = 1 AND st.decisions = 2 AND st.actual_net_cents = 3750
  ) THEN
    RAISE EXCEPTION 'Gameplay/account fixture data did not survive restoration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth_tokens WHERE token_hash = 'backup-fixture-token')
    OR NOT EXISTS (SELECT 1 FROM oauth_identities WHERE provider_user_id = 'backup-fixture-google-id')
    OR NOT EXISTS (SELECT 1 FROM auth_rate_limits WHERE bucket = 'backup-fixture' AND attempts = 3) THEN
    RAISE EXCEPTION 'Authentication/migration fixture data did not survive restoration';
  END IF;
END;
$$;
