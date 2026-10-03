INSERT INTO users (id, email, display_name, password_hash)
VALUES ('11111111-1111-4111-8111-111111111111', 'backup-fixture@example.test', 'Backup Fixture', 'fixture-hash');
INSERT INTO sessions (id, user_agent, user_id)
VALUES ('backup-fixture-session', 'backup-test', '11111111-1111-4111-8111-111111111111');
INSERT INTO hands (session_id, round_index, hand_index, bet_cents, outcome,
  payout_cents, player_cards, dealer_cards)
VALUES ('backup-fixture-session', 1, 0, 2500, 'blackjack', 3750, '["A♠","K♥"]', '["9♣","7♦"]');
INSERT INTO session_stats (session_id, rounds, hands, decisions, correct_decisions,
  main_wagered_cents, actual_net_cents, blackjacks)
VALUES ('backup-fixture-session', 1, 1, 2, 2, 2500, 3750, 1);
INSERT INTO auth_tokens (token_hash, user_id, expires_at)
VALUES ('backup-fixture-token', '11111111-1111-4111-8111-111111111111', '2030-01-01T00:00:00Z');
INSERT INTO oauth_identities (provider, provider_user_id, user_id)
VALUES ('google', 'backup-fixture-google-id', '11111111-1111-4111-8111-111111111111');
INSERT INTO auth_rate_limits (bucket, key_hash, attempts)
VALUES ('backup-fixture', 'backup-fixture-key', 3);
