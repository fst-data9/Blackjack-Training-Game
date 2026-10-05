#!/usr/bin/env python3
"""Review or apply security settings without exposing or replacing other secrets."""
import argparse
import getpass
import json
import os
import re
import sys
import tempfile
import warnings
from datetime import datetime, timezone
from pathlib import Path

HOSTNAMES = {
    "production": "blackjack-trainer.co",
    "staging": "staging.blackjack-trainer.co",
}
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
TEST_KEYS = {
    "1x00000000000000000000AA", "2x00000000000000000000AB",
    "1x00000000000000000000BB", "2x00000000000000000000BB",
    "3x00000000000000000000FF",
    "1x0000000000000000000000000000000AA",
    "2x0000000000000000000000000000000AA",
    "3x0000000000000000000000000000000AA",
}


def setting(text, name):
    matches = re.findall(
        rf"(?m)^[ \t]*(?:export[ \t]+)?{re.escape(name)}[ \t]*=([^\r\n]*)", text
    )
    if len(matches) > 1:
        raise ValueError(f"Duplicate {name}; resolve it before configuring security")
    if not matches:
        return ""
    raw = matches[0].strip()
    if raw.startswith('"'):
        try:
            value, end = json.JSONDecoder().raw_decode(raw)
        except ValueError:
            raise ValueError(f"Unsupported quoted value for {name}") from None
        if not isinstance(value, str) or (raw[end:].strip() and not raw[end:].strip().startswith("#")):
            raise ValueError(f"Invalid value for {name}")
        return value
    if raw.startswith("'"):
        end = raw.find("'", 1)
        if end < 0 or (raw[end + 1:].strip() and not raw[end + 1:].strip().startswith("#")):
            raise ValueError(f"Invalid value for {name}")
        return raw[1:end]
    return raw.split("#", 1)[0].strip()


def rewrite(text, updates):
    for name, value in updates.items():
        setting(text, name)  # Refuse ambiguous duplicate settings.
        pattern = rf"(?m)^[ \t]*(?:export[ \t]+)?{re.escape(name)}[ \t]*=[^\r\n]*"
        replacement = name + "=" + json.dumps(value)
        text, count = re.subn(pattern, lambda match: replacement, text)
        if not count:
            newline = "\r\n" if "\r\n" in text else "\n"
            if text and not text.endswith("\n"):
                text += newline
            text += replacement + newline
    return text


def validate(updates, environment):
    hostname = HOSTNAMES[environment]
    expected = {
        "NODE_ENV": "production",
        "ALLOWED_ORIGINS": "https://" + hostname,
        "ALLOW_FILE_ORIGIN": "false",
        "TRUST_PROXY_HOPS": "1",
        "TURNSTILE_EXPECTED_HOSTNAME": hostname,
        "REQUIRE_SIGNUP_CAPTCHA": "true",
    }
    for name, value in expected.items():
        if updates.get(name) != value:
            raise ValueError(f"{name} does not match the reviewed {environment} configuration")
    for name in ("TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"):
        value = updates.get(name, "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,256}", value):
            raise ValueError(f"{name} must be a configured Turnstile key")
        if value in TEST_KEYS:
            raise ValueError("Use an environment-specific real widget, not Cloudflare test keys")
    for name, maximum in (("RATE_LIMIT_MAX", 1_000_000), ("RATE_LIMIT_WINDOW_MS", 86_400_000)):
        value = updates.get(name, "")
        if not re.fullmatch(r"\d+", value) or not 1 <= int(value) <= maximum:
            raise ValueError(f"{name} must be a positive bounded integer")
    client_id = updates.get("GOOGLE_CLIENT_ID", "")
    if client_id and not re.fullmatch(r"[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", client_id):
        raise ValueError("GOOGLE_CLIENT_ID must be a Google Web application client ID")


def apply_settings(env_file, original, updated, rollback_root, environment):
    if env_file.is_symlink():
        raise ValueError("Refusing to replace a symlinked environment file")
    if env_file.read_bytes() != original:
        raise ValueError("Environment file changed during review; run the configuration again")
    if rollback_root.resolve().is_relative_to(REPOSITORY_ROOT):
        raise ValueError("Private rollback settings must be stored outside the repository")
    if env_file.stat().st_uid != os.geteuid():
        raise ValueError("Run as the account that owns the runtime environment file")
    rollback_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(rollback_root, 0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rollback = Path(tempfile.mkdtemp(prefix=f"{environment}-{stamp}-", dir=rollback_root))
    fd = os.open(rollback / "backend.env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(original)
        output.flush()
        os.fsync(output.fileno())
    fd, temporary = tempfile.mkstemp(prefix=".env.security.", dir=env_file.parent)
    try:
        original_group = env_file.stat().st_gid
        if os.fstat(fd).st_gid != original_group:
            os.fchown(fd, -1, original_group)
        with os.fdopen(fd, "wb") as output:
            output.write(updated.encode("utf-8"))
            output.flush()
            os.fsync(output.fileno())
        if env_file.read_bytes() != original:
            raise ValueError("Environment file changed; preserved rollback, did not replace runtime settings")
        os.replace(temporary, env_file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return rollback


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", required=True, choices=HOSTNAMES)
    parser.add_argument("--env-file", type=Path, default=Path("backend/.env"))
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Write reviewed settings; never starts containers")
    mode.add_argument("--check", action="store_true", help="Validate existing settings without prompts or writes")
    parser.add_argument("--google-client-id", help="Public client ID; omitted means preserve current Google setting")
    parser.add_argument("--rollback-dir", type=Path, default=Path.home() / ".config/blackjack-security")
    args = parser.parse_args()
    if args.check and args.google_client_id is not None:
        parser.error("--check cannot change the Google client ID")
    if args.env_file.is_symlink():
        raise ValueError("Environment file must not be a symlink")
    original = args.env_file.read_bytes()
    text = original.decode("utf-8")
    names = [
        "NODE_ENV", "ALLOWED_ORIGINS", "ALLOW_FILE_ORIGIN", "TRUST_PROXY_HOPS",
        "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_EXPECTED_HOSTNAME",
        "REQUIRE_SIGNUP_CAPTCHA", "RATE_LIMIT_MAX", "RATE_LIMIT_WINDOW_MS", "GOOGLE_CLIENT_ID",
    ]
    updates = {name: setting(text, name) for name in names}
    if args.check:
        validate(updates, args.environment)
        if args.env_file.stat().st_mode & 0o077:
            raise ValueError("Runtime environment file must have permission 600")
        print(f"{args.environment} security configuration verified; provider-console and browser checks remain separate")
        return
    if not sys.stdin.isatty():
        raise ValueError("Run interactively in your private server terminal; keys are not accepted as command arguments")
    hostname = HOSTNAMES[args.environment]
    updates.update({
        "NODE_ENV": "production", "ALLOWED_ORIGINS": "https://" + hostname,
        "ALLOW_FILE_ORIGIN": "false", "TRUST_PROXY_HOPS": "1",
        "TURNSTILE_EXPECTED_HOSTNAME": hostname, "REQUIRE_SIGNUP_CAPTCHA": "true",
        "RATE_LIMIT_MAX": updates["RATE_LIMIT_MAX"] or "120",
        "RATE_LIMIT_WINDOW_MS": updates["RATE_LIMIT_WINDOW_MS"] or "60000",
    })
    updates["TURNSTILE_SITE_KEY"] = input("Turnstile site key (blank keeps existing): ").strip() or updates["TURNSTILE_SITE_KEY"]
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            secret = getpass.getpass("Turnstile secret key (hidden; blank keeps existing): ").strip()
        except getpass.GetPassWarning:
            raise ValueError("Hidden secret input is unavailable; use a private interactive terminal") from None
    updates["TURNSTILE_SECRET_KEY"] = secret or updates["TURNSTILE_SECRET_KEY"]
    if args.google_client_id is not None:
        updates["GOOGLE_CLIENT_ID"] = args.google_client_id
    validate(updates, args.environment)
    updated = rewrite(text, updates)
    print(f"Reviewed hostname: {hostname}")
    print("Settings to configure: " + ", ".join(names))
    print("Turnstile keys: configured (values hidden). Database and other application settings are preserved.")
    if args.apply:
        rollback = apply_settings(args.env_file, original, updated, args.rollback_dir, args.environment)
        print(f"Security settings saved with permission 600. Private rollback copy: {rollback / 'backend.env'}")
        print("Containers have not been restarted. Deploy when ready, then run the HTTPS and browser verification.")
    else:
        print("Review only: no files changed. Run again with --apply to save these settings.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, UnicodeError) as error:
        print(f"Security configuration stopped: {error}", file=sys.stderr)
        sys.exit(1)
