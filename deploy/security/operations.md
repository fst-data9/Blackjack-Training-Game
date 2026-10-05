# Credential rotation and incident response

Keep operational records and recovery secrets private. The release environment,
runtime environment, database administrator settings, SSH keys, Turnstile keys,
and age backup identity serve different purposes; rotating one does not rotate
the others. Confirm staging behavior before a routine production change, preserve
a rollback path, and take a verified encrypted backup before database work.

## Routine rotation

### API database login

Prefer provisioning a new dedicated login so the old API keeps working during
preparation. Preserve the existing administrator, database, and volume.

1. Save private copies of current runtime/release settings. Generate a separate
   strong password in a private terminal or secret manager, not in command history.
2. Set `DATABASE_APP_USER`/`DATABASE_APP_PASSWORD` in `backend/.env.migrations`
   to the new restricted login. Its administrator URL stays unchanged.
3. Run the one-off `migrate` service with the correct environment overlay. Require
   both migration and role-provisioning success. Verify login and application
   privileges with the new credentials before changing the running API.
4. Update only runtime `DATABASE_URL`, retaining host/port/database and other
   settings. Recreate the API and verify login, gameplay/statistics writes,
   logout, and absence of permission errors.
5. After acceptance, disable the old login and review/retire its grants using
   administrator tooling. An existing connection can outlive `NOLOGIN`; verify
   that old API pools have stopped, and review any remaining sessions before
   terminating them. Retain an intentional emergency rollback until accepted.
6. Refresh secure recovery settings and verify a new encrypted backup/restore.

Role provisioning is repeatable but changes that login's password; do not rotate
the active login's password before its runtime environment is ready to switch.

### Database administrator

Changing root `POSTGRES_PASSWORD` does not change an initialized PostgreSQL
role's password. Review an actual administrator role-password change separately,
then update root initialization/recovery settings and the release administrator
URL together. Check migrations, provisioning, and backup administration. Do not
put administrator credentials into the API or recreate/delete its data volume.

### Cloudflare Turnstile and Google

Rotate Turnstile through the provider's widget settings, store the new secret in
the password manager, apply it through the private configuration helper, and
recreate the API. Check a real browser signup before retiring any provider overlap
window. Never disable required CAPTCHA to make a failing verification pass.

The Google client ID is public, but its console ownership, origins, branding,
and account access need protection. For a replacement client, authorize the
exact environment origin, configure its ID privately, recreate the API, verify
real sign-in, then retire the old client as appropriate.

### SSH access

Generate the new key in the password manager, add its public key alongside
existing authorized keys, and verify a new independent deploy login and sudo.
Update the relevant GitHub environment's deployment credential securely and
verify a deployment before removing the old public key. Keep a working root
session during access changes. Never send private keys in chat.

### Backup encryption identity

Keep every older age identity for archives encrypted to its recipient. Create
and independently save a new identity, update only the public backup recipient,
then take a new backup and restore-test it. Compare independently copied files
and remove only the temporary server identity once recovery is verified. Never
overwrite an old key or assume a newly generated identity can decrypt old backups.

## Suspected incident

1. Establish the affected service/accounts and time window. Preserve logs,
   current configuration, relevant encrypted archives, and server evidence
   privately. Avoid cleanup, secret printing, or redeployment that destroys
   evidence before understanding the incident.
2. Contain the exposed access or service. Coordinate a maintenance window if
   writes must stop. Disable a compromised login/key and address existing
   connections; rotating credentials alone does not close established sessions.
3. Rotate the affected secrets and any credentials the compromised component
   could access. A runtime API compromise and an administrator/release/host
   compromise have different reach. Verify the restricted API role remains
   separate from the owner and has no unexpected memberships or privileges.
4. If authentication tokens may have been exposed, review revoking the affected
   tokens or all tokens using administrator tooling. This logs users out; make
   the scope and expected impact explicit. Do not log token values.
5. Select a known-good backup based on the incident window, rather than blindly
   choosing the newest archive. Preserve the original database/volume. Restore
   into a reviewed new empty destination and verify it before changing runtime
   connections; the restore-test script deletes its temporary database and is
   not an actual recovery command.
6. Rebuild/redeploy from reviewed code and a trusted environment. Verify browser
   authentication, writes, headers/origin checks, and new backup/restore evidence
   before resuming normal operation. Review provider-console access and GitHub
   deployment credentials where relevant.
7. Record the cause, containment, affected period, data impact, rotated secrets
   (names only), recovery evidence, and follow-up fixes privately. Assess any
   user-notification obligations for the actual incident before communicating.

The user's private recovery handover is outside this repository. Do not copy
private keys, recovery environment files, customer data, or incident logs into Git.

## Maintenance cadence

- Check daily backup success/timer status and available disk space; copy new
  encrypted archives offsite regularly. Automated offsite copies and backup
  failure alerts are still separate work.
- Review the weekly GitHub dependency/container scan results. Address
  high/critical issues and rebuild updated supported images through staging.
- Repeat restore drills periodically and after schema/encryption changes;
  preserve both verification and temporary-database cleanup evidence.
- Review provider accounts, SSH/deployment keys, and recovery-file availability
  periodically and after staff/device/access changes. Rotate promptly when a
  secret is exposed, rather than waiting for a maintenance date.
