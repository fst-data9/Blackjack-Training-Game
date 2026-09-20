# Security checklist

This is a practical checklist for deploying the blackjack trainer and PostgreSQL on a server. Controls marked **Implemented** are enforced by this repository. Controls marked **Deployment** require infrastructure or credentials that should not be committed to Git.

| Risk | Typical impact | Current control | Status |
|---|---|---|---|
| SQL injection | Reading, changing, or deleting database data | All request values use PostgreSQL parameter placeholders; inputs are type-, format-, and length-checked | Implemented |
| Automated account creation | Database spam and resource exhaustion | Separate database-backed limits per IP and per email; optional Turnstile challenge with server verification | Implemented; enable Turnstile in production |
| Password brute force / credential stuffing | Account takeover | Independent IP and account limits, generic failures, constant-work password checks, slow salted PBKDF2 hashes | Implemented |
| Account enumeration | Discovering registered emails | Login uses a generic response and constant-work password checks; registration uses generic wording, but its success/conflict status remains distinguishable | Partially implemented; email verification flow would close the remaining gap |
| Session theft / fixation | Account impersonation | Random opaque tokens, only token hashes in PostgreSQL, expiry and logout revocation, HttpOnly/SameSite cookies, `__Host-` production cookie | Implemented |
| CSRF / cross-origin API use | Unauthorized writes using a victim's browser | SameSite cookies, origin allowlist, `Sec-Fetch-Site` rejection, credentialed CORS restricted to configured origins | Implemented |
| XSS / clickjacking | Token misuse or malicious UI | Content Security Policy, no inline application scripts, frame-ancestor denial, safe text rendering | Implemented |
| Oversized or malformed input | CPU/memory exhaustion or crashes | 16 KiB JSON limit, strict field limits, safe cookie parsing, bounded password and token lengths | Implemented |
| Expensive/stalled database queries | API exhaustion | Connection, query, statement, pool, and idle timeouts | Implemented |
| Unbounded rate-limit memory | API memory exhaustion | Expired in-memory request buckets are pruned; authentication limits live in PostgreSQL | Implemented |
| Information disclosure | Easier reconnaissance | `X-Powered-By` disabled, generic API errors, no stack traces returned | Implemented |
| Database exposed publicly | Direct password attacks and data theft | Compose binds PostgreSQL to `127.0.0.1` only | Implemented locally; enforce firewall/private network in production |
| Database superuser used by the app | Full database compromise after an app breach | Create a dedicated least-privilege application role | Deployment |
| Unencrypted traffic | Stolen passwords/cookies/database traffic | HTTPS for the website and TLS (`sslmode=verify-full`) for remote PostgreSQL | Deployment |
| Weak/default secrets | Database or provider compromise | Secrets remain in ignored environment files | Deployment: generate unique secrets and use a secret manager |
| Missing email ownership proof | Disposable or mistyped accounts | Add email verification before treating email addresses as trusted | Future enhancement |
| Distributed bot networks | Bypass of IP-only controls | Turnstile plus IP and identity limits | Deployment: enable Turnstile; consider CDN/WAF rules at scale |
| Backups and recovery | Permanent loss or ransomware impact | Encrypted, tested PostgreSQL backups | Deployment |
| Dependency vulnerabilities | Known package exploits | Lockfile and `npm audit` checks | Ongoing maintenance |

## Production requirements

1. Serve only over HTTPS and set `NODE_ENV=production`.
2. Set the exact public origin in `ALLOWED_ORIGINS`; keep `ALLOW_FILE_ORIGIN=false`.
3. If a reverse proxy is directly in front of the API, set `TRUST_PROXY_HOPS=1`. Do not increase this unless the proxy chain is understood, because client IPs drive abuse controls.
4. Configure Cloudflare Turnstile and set `REQUIRE_SIGNUP_CAPTCHA=true`.
5. Keep PostgreSQL off the public internet. Prefer the same private network as the API; otherwise require certificate-verified TLS.
6. Give the API a dedicated PostgreSQL role with only the required `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privileges on this application's tables and sequences.
7. Use long, unique database/provider secrets stored outside the repository, rotate them, and maintain encrypted backups.
8. Run `npm audit --omit=dev` and apply supported runtime/package updates regularly.

## Trust boundary

Gameplay results and statistics originate in the browser. They are validated for shape and ownership, but a player can alter their own totals with custom requests. Do not use these statistics for prizes, money, rankings, or other trusted decisions without moving game resolution to the server.
