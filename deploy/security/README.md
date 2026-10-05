# Security configuration and release verification

The application already includes signup CAPTCHA, production cookies, security
headers, origin checks, and database-backed authentication limits. This release
adds configuration validation, a private configuration helper, automated tests,
an HTTPS smoke check, and weekly vulnerability scans. Provider-console settings
and real browser verification are still required before marking deployment
checklist items complete.

See [review.md](review.md) for the local verification results and remaining
deployment acceptance steps.

## Cloudflare setup

In your own Cloudflare account, open **Turnstile → Add widget**:

| Environment | Widget name | Allowed hostname |
|---|---|---|
| Production | Blackjack production signup | `blackjack-trainer.co` |
| Staging | Blackjack staging signup | `staging.blackjack-trainer.co` |

Use **Managed** mode and leave pre-clearance disabled. Keep separate widgets
and secrets for each environment. Production `www` redirects to the apex, so
the widget and backend both use `blackjack-trainer.co`. Store each secret key in
your password manager; do not send it in chat, put it in Git, or pass it as a
command argument. A site key is public; the secret key remains on the server.

Cloudflare dashboard instructions:
<https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/>.

The server verifies the token with Cloudflare, checks `success`, the `register`
action, and the expected hostname. Missing/rejected tokens cannot create an
account. Provider HTTP failures, malformed responses, and timeouts return an
unavailable response without logging tokens or secret keys. Cloudflare's published
dummy keys are rejected when `NODE_ENV=production`, which includes our staging
deployment; use a real separate staging widget for browser testing.

## Prepare private server settings

Once the reviewed code is available in `/opt/blackjack`, run as **deploy** from
that directory. Review mode makes no changes:

```sh
python3 scripts/configure-security.py --environment staging
```

To apply on staging:

```sh
python3 scripts/configure-security.py --environment staging --apply
```

On production, use:

```sh
python3 scripts/configure-security.py --environment production --apply
```

Paste the environment's site key at its prompt and secret key at the hidden
prompt. Blank entries preserve existing keys. The helper requires a private
interactive terminal; it never accepts the secret as a command argument.

It sets the exact HTTPS origin and expected hostname, disables file origins,
sets one trusted proxy hop for this Caddy deployment, and requires signup
verification. Existing positive global rate limits are preserved; absent values
use 120 requests per 60 seconds. Google sign-in is preserved as currently set.

All database credentials and unrelated settings remain unchanged. The helper
refuses duplicate security settings and saves the original runtime environment
under `~/.config/blackjack-security/`, with directory permission `700` and file
permission `600`, before atomically replacing `backend/.env` at permission `600`.
It does not restart containers or edit release/admin credentials. Keep its printed
rollback path private and save updated recovery configuration securely offsite.

Validate saved settings without printing keys:

```sh
python3 scripts/configure-security.py --environment production --check
```

Use `--environment staging` on staging. Configuration checks cannot verify
whether keys belong to the right Cloudflare widget; a real browser signup must.

## Google sign-in

Google sign-in is currently disabled on both deployed environments. Leave it
disabled unless you intend to support it. No Google client secret is needed for
this app's ID-token verification flow.

If enabling it, create or review a **Web application** OAuth client in Google
Cloud and authorize the exact JavaScript origin for that environment. Prefer
separate staging and production clients. The current JavaScript callback flow
does not need an authorized redirect URI. Configure OAuth branding/consent and
any testing-mode restrictions before trying sign-in.

Supply the public client ID to the configuration helper, for example:

```sh
python3 scripts/configure-security.py --environment production --apply \
  --google-client-id YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

An omitted option preserves the existing value. Explicit `--google-client-id ''`
disables the button. Server-side token verification checks the configured audience
and verified email; do not enable a button without matching console configuration.

Google's setup instructions:
<https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid>.

## Review, staging, and production deployment

1. Review the changes and passing CI. Deploy the code to staging through the
   existing dev workflow. Until keys are configured, the existing optional
   CAPTCHA behavior is retained to avoid an unprepared application outage.
2. Create/configure the separate staging widget, apply private settings with the
   helper, then run `bash scripts/deploy-staging.sh` from a clean dev checkout.
3. Run the HTTPS checks and browser signup/login/gameplay/logout verification.
4. Merge reviewed code into main through the existing release workflow. Apply
   production widget settings privately, then run the current
   `bash scripts/deploy-production.sh` from a clean main checkout. Avoid running
   a manual release while GitHub's deployment job is still running.
5. Run the production HTTPS/browser verification and refresh private recovery
   configuration copies after success.

The production deployment script recreates Caddy to load the new canonical
redirect. A file bind mount can otherwise retain the old inode after Git replaces
the host Caddyfile. The proxy restart briefly interrupts connections. On the
first deployment, an older already-loaded script may not contain this step; once
the GitHub job finishes, invoke the updated deployment script explicitly.

### HTTPS checks

The verification script is included in the API image:

```sh
docker exec blackjack-api node /app/scripts/verify-security.mjs --environment staging
```

On production:

```sh
docker exec blackjack-api node /app/scripts/verify-security.mjs --environment production
```

It verifies HTTPS health, CSP/HSTS, basic response headers, public provider
configuration, CORS/preflight, blocked cross-site/opaque-origin writes, private
configuration path denial, and the production www redirect. Its POST checks have
no authentication cookie and are rejected before authentication/database writes.
It does not create accounts, attempt passwords, or flood rate limits.

For an existing deployment before Turnstile setup, the explicit
`--allow-unconfigured-turnstile` option permits a baseline check. It does not
enable or bypass CAPTCHA in the application. A production www check will still
fail until the canonical redirect is deployed.

### Real browser acceptance

On the deployed HTTPS site, use a disposable test account you control:

1. Visit `www` on production and confirm it lands on the apex while preserving
   the path/query. Complete signup with the actual Turnstile widget.
2. Confirm the signup request sets `__Host-bj_auth` with `Secure`, `HttpOnly`,
   `SameSite=Lax`, `Path=/`, and no `Domain` attribute. The browser must accept
   that cookie and keep the user signed in. Do not share its value.
3. Verify login, gameplay/session writes, statistics after signing back in,
   and logout. Confirm logout expires the same secure host cookie.
4. If Google was enabled, verify its real sign-in flow and console origin setup.
5. Check for permission/server errors without publishing customer records,
   authentication cookies, credentials, or provider tokens.

Record the verification date and result privately; only then mark the deployed
security checklist items complete. Local tests prove code behavior, not provider
console settings or the browser's handling of real deployed cookies.

## Automated tests and scheduled scans

- `npm --prefix backend run test:security`: configuration and CAPTCHA validation,
  including malformed/replayed/rejected results, hostname/action binding,
  unavailable providers, bounded timeouts, and log redaction.
- `python3 -m unittest discover -s tests -p 'test_security_configuration.py'`:
  private atomic updates/rollback, preservation of other settings, and refusal
  of ambiguous or changed files.
- `DATABASE_TEST_ADMIN_URL=YOUR_ISOLATED_TEST_URL npm --prefix backend run
  test:security:integration`: production-mode API using a generated database and
  restricted login, secure cookie issuance/revocation/expiry, origin checks,
  CAPTCHA failures, ownership enforcement, authentication limits surviving
  restart, and global rate limits. Provider responses are mocked through a
  test-only Node preload, not an application runtime switch. Never use a live
  application URL or runtime credentials for these tests.

CI runs these tests before deployments. `.github/workflows/security-scan.yml`
runs every Monday at 03:15 UTC on the GitHub default branch, plus manual dispatch.
It audits production npm dependencies and scans the built API, PostgreSQL 16,
and Caddy 2 images with a pinned Trivy action. HIGH/CRITICAL findings fail the
scan, including findings without a published fix. Review failed scans and
remediate or document the mitigation; this scheduled workflow does not deploy
images or update production automatically. GitHub schedules become active only
after this workflow is merged into the default branch.

For credential rotation and incident response, see [operations.md](operations.md).
