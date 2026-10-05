import importlib.util
import io
import os
import tempfile
import unittest
import warnings
from unittest import mock
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "security_configuration", Path(__file__).resolve().parents[1] / "scripts/configure-security.py"
)
security = importlib.util.module_from_spec(spec)
spec.loader.exec_module(security)


class SecurityConfigurationTest(unittest.TestCase):
    def test_refuses_secret_entry_when_the_terminal_cannot_hide_input(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            original = b"DATABASE_URL=private-database-fixture\n"
            env.write_bytes(original)
            def unavailable_hidden_input(prompt):
                warnings.warn("Hidden input unavailable", security.getpass.GetPassWarning)
                self.fail("Secret entry must stop before falling back to echoed input")
            with mock.patch.object(security.sys, "argv", ["configure-security.py", "--environment", "production", "--env-file", str(env)]), \
                 mock.patch.object(security.sys.stdin, "isatty", return_value=True), \
                 mock.patch("builtins.input", return_value="fixture-public-site-key"), \
                 mock.patch.object(security.getpass, "getpass", side_effect=unavailable_hidden_input):
                with self.assertRaisesRegex(ValueError, "Hidden secret input is unavailable"):
                    security.main()
            self.assertEqual(env.read_bytes(), original)

    def test_interactive_review_apply_and_check_never_print_secrets(self):
        for apply in (False, True):
            with self.subTest(apply=apply), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                env = root / ".env"
                original = b"DATABASE_URL=private-database-fixture\nGOOGLE_CLIENT_ID=existing-id.apps.googleusercontent.com\n"
                env.write_bytes(original)
                arguments = ["configure-security.py", "--environment", "production",
                             "--env-file", str(env), "--rollback-dir", str(root / "recovery")]
                if apply:
                    arguments.append("--apply")
                output = io.StringIO()
                with mock.patch.object(security.sys, "argv", arguments), \
                     mock.patch.object(security.sys.stdin, "isatty", return_value=True), \
                     mock.patch("builtins.input", return_value="fixture-public-site-key"), \
                     mock.patch.object(security.getpass, "getpass", return_value="fixture-private-secret-key"), \
                     mock.patch.object(security.sys, "stdout", output):
                    security.main()
                self.assertNotIn("fixture-private-secret-key", output.getvalue())
                self.assertNotIn("private-database-fixture", output.getvalue())
                self.assertTrue(env.read_bytes().startswith(original.splitlines(keepends=True)[0]))
                self.assertEqual(security.setting(env.read_text(), "GOOGLE_CLIENT_ID"), "existing-id.apps.googleusercontent.com")
                if apply:
                    self.assertEqual(security.setting(env.read_text(), "REQUIRE_SIGNUP_CAPTCHA"), "true")
                    with mock.patch.object(security.sys, "argv", arguments[:-1] + ["--check"]), \
                         mock.patch.object(security.sys, "stdout", output):
                        security.main()
                    self.assertIn("security configuration verified", output.getvalue())
                else:
                    self.assertEqual(env.read_bytes(), original)
                    self.assertFalse((root / "recovery").exists())

    def test_preserves_database_and_other_settings_exactly(self):
        original = 'DATABASE_URL="postgres://keep:private@postgres/db"\r\nCUSTOM=value # keep\r\nALLOW_FILE_ORIGIN=true\r\n'
        updated = security.rewrite(original, {"ALLOW_FILE_ORIGIN": "false", "REQUIRE_SIGNUP_CAPTCHA": "true"})
        self.assertTrue(updated.startswith(original.split("ALLOW_FILE_ORIGIN")[0]))
        self.assertEqual(security.setting(updated, "ALLOW_FILE_ORIGIN"), "false")
        self.assertEqual(security.setting(updated, "REQUIRE_SIGNUP_CAPTCHA"), "true")

    def test_refuses_duplicate_keys(self):
        with self.assertRaises(ValueError):
            security.rewrite("ALLOW_FILE_ORIGIN=true\nexport ALLOW_FILE_ORIGIN=false\n", {"ALLOW_FILE_ORIGIN": "false"})

    def test_reads_supported_dotenv_values_and_comments(self):
        for raw in ('"false" # note', "'false' # note", "false # note"):
            self.assertEqual(security.setting("FLAG=" + raw, "FLAG"), "false")

    def test_private_atomic_update_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = root / ".env"
            original = b"DATABASE_URL=private-original\nALLOW_FILE_ORIGIN=true\n"
            env.write_bytes(original)
            rollback = security.apply_settings(env, original, "DATABASE_URL=private-original\nALLOW_FILE_ORIGIN=false\n", root / "recovery", "production")
            self.assertEqual((rollback / "backend.env").read_bytes(), original)
            self.assertEqual(env.stat().st_mode & 0o777, 0o600)
            self.assertEqual(rollback.stat().st_mode & 0o777, 0o700)
            self.assertEqual((rollback / "backend.env").stat().st_mode & 0o777, 0o600)
            self.assertFalse(list(root.glob(".env.security.*")))

    def test_refuses_changed_file_or_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = root / ".env"
            env.write_bytes(b"new settings")
            with self.assertRaises(ValueError):
                security.apply_settings(env, b"old settings", "replacement", root / "recovery", "production")
            link = root / "link"
            link.symlink_to(env)
            with self.assertRaises(ValueError):
                security.apply_settings(link, env.read_bytes(), "replacement", root / "recovery", "production")
            self.assertEqual(env.read_bytes(), b"new settings")

    def test_failed_replace_preserves_original_and_private_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = root / ".env"
            original = b"DATABASE_URL=private-original\n"
            env.write_bytes(original)
            with mock.patch.object(security.os, "replace", side_effect=OSError("fixture failure")):
                with self.assertRaises(OSError):
                    security.apply_settings(env, original, "changed", root / "recovery", "production")
            self.assertEqual(env.read_bytes(), original)
            backups = list((root / "recovery").glob("*/backend.env"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), original)
            self.assertFalse(list(root.glob(".env.security.*")))

    def test_refuses_rollback_inside_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = root / ".env"
            env.write_bytes(b"original")
            with mock.patch.object(security, "REPOSITORY_ROOT", root):
                with self.assertRaises(ValueError):
                    security.apply_settings(env, b"original", "changed", root / "recovery", "production")
            self.assertEqual(env.read_bytes(), b"original")
            self.assertFalse((root / "recovery").exists())

    def test_rejects_test_keys_and_incomplete_required_protection(self):
        settings = {
            "NODE_ENV": "production", "ALLOWED_ORIGINS": "https://blackjack-trainer.co",
            "ALLOW_FILE_ORIGIN": "false", "TRUST_PROXY_HOPS": "1",
            "TURNSTILE_EXPECTED_HOSTNAME": "blackjack-trainer.co", "REQUIRE_SIGNUP_CAPTCHA": "true",
            "TURNSTILE_SITE_KEY": "real-widget-site-key", "TURNSTILE_SECRET_KEY": "real-widget-secret-key",
            "RATE_LIMIT_MAX": "120", "RATE_LIMIT_WINDOW_MS": "60000", "GOOGLE_CLIENT_ID": "",
        }
        security.validate(settings, "production")
        for name, value in [
            ("TURNSTILE_SECRET_KEY", ""), ("REQUIRE_SIGNUP_CAPTCHA", "false"),
            ("ALLOWED_ORIGINS", "https://www.blackjack-trainer.co"), ("RATE_LIMIT_MAX", "0"),
            ("TURNSTILE_SECRET_KEY", next(iter(security.TEST_KEYS))),
        ]:
            with self.subTest(name=name, value=value), self.assertRaises(ValueError):
                security.validate({**settings, name: value}, "production")


if __name__ == "__main__":
    unittest.main()
