# Encrypted database backups and restore checks

This runs on the existing VPS. No second server is required. Daily PostgreSQL
backups are encrypted with a public age key and stored in
`/var/backups/blackjack/staging` (or `production`). A restore check creates a
temporary database on the same PostgreSQL instance and removes it afterward.
Neither command changes the application's database or API configuration.

Local backups protect against bad changes and accidental deletion. They do not
survive losing the VPS or its disk. Copy encrypted files to your computer or
other storage for that protection; no extra server is necessary. These are
daily snapshots, not point-in-time recovery: changes since the latest successful
backup are not recoverable from that snapshot.

The dump streams straight from `pg_dump` into age encryption. A plaintext dump
is never saved to disk. Successful backups are published atomically. Failed
backups remove partial files and leave previous backups in place. Retention
defaults to 30 days and runs only after a new backup succeeds; it deletes only
this job's regular files for the configured environment. PostgreSQL custom
archives and the encryption CLI are documented by
[PostgreSQL](https://www.postgresql.org/docs/16/app-pgdump.html) and
[age](https://github.com/FiloSottile/age#usage).

## Staging setup

First merge/deploy the backup branch into `dev`. Unlike the database-role
transition, no new env file is required for application deployment. Backup
configuration lives outside the repository and cannot dirty the server checkout.

Run these commands on staging from `/opt/blackjack`. The service assumes the
existing deployment user is `deploy`, with Docker access. Change `User=` and
`SupplementaryGroups=` in the installed service if your server uses another user
or runtime. The default service is configured for Docker, as used by this VPS.

### 1. Install age and create a key

```sh
sudo apt-get update
sudo apt-get install -y age
install -d -m 700 /home/deploy/.config/blackjack-backup
age-keygen -o /home/deploy/.config/blackjack-backup/staging.backup.key
chmod 600 /home/deploy/.config/blackjack-backup/staging.backup.key
```

This creates a private key file and prints its public key (`age1...`). Do not
replace an existing key if backups already use it. Keep that original private
key for its older backups when rotating to a new key.

For initial setup the private key is temporarily on the server so the restore
check can run. Save an independent copy on your own computer or in your password
manager before removing that server copy. For example, run this **on your own
computer**, replacing the hostname and selecting a private local folder:

```sh
scp -p deploy@YOUR_STAGING_HOST:/home/deploy/.config/blackjack-backup/staging.backup.key ./staging.backup.key
```

The private key is required for recovery; encrypted backups alone cannot recover
your data. Scheduled backups need only the public key and will continue after
the private server copy is removed.

### 2. Install public configuration and the daily job

```sh
cd /opt/blackjack
sudo install -d -m 700 -o deploy -g deploy /etc/blackjack
sudo install -d -m 700 -o deploy -g deploy /var/backups/blackjack/staging
sudo install -m 600 -o deploy -g deploy deploy/backups/backup.env.example /etc/blackjack/backup-staging.env
sudo install -m 644 deploy/backups/blackjack-backup@.service /etc/systemd/system/blackjack-backup@.service
sudo install -m 644 deploy/backups/blackjack-backup@.timer /etc/systemd/system/blackjack-backup@.timer
```

Set the public key without copying passwords or private-key text through nano:

```sh
backup_public_key=$(age-keygen -y /home/deploy/.config/blackjack-backup/staging.backup.key)
if [ -n "$backup_public_key" ]; then
  sudo sed -i "s/^BACKUP_RECIPIENT=.*/BACKUP_RECIPIENT=$backup_public_key/" /etc/blackjack/backup-staging.env
fi
unset backup_public_key
```

`backup-staging.env` contains public configuration only, not a database URL or
private encryption key. The scripts use PostgreSQL's administrator login from
inside `blackjack-postgres` to access its local database. The database name comes
from that container's `POSTGRES_DB`; confirm it matches the API's database if
your deployment differs from the documented setup. The API role remains
restricted and is not used for backup/restore administration.

Do not reinstall the configuration example over a configured file during a
routine code update; that would replace its public key with a placeholder.

### 3. Run the first backup and verify restoration

```sh
sudo systemctl daemon-reload
sudo systemctl start blackjack-backup@staging.service
sudo journalctl -u blackjack-backup@staging.service -n 30 --no-pager
ls -lh /var/backups/blackjack/staging/*.dump.age
```

Select the exact encrypted file created by that run, then run:

```sh
BACKUP_ENVIRONMENT=staging \
AGE_IDENTITY_FILE=/home/deploy/.config/blackjack-backup/staging.backup.key \
bash scripts/database-restore-test.sh /var/backups/blackjack/staging/EXACT_BACKUP_FILENAME.dump.age
```

The check decrypts the archive directly into a newly generated database named
`blackjack_restore_staging_...`. It restores transactionally, checks all required
tables, migration-history structure, constraints, and the hand-ID sequence, and
reports aggregate row counts. It removes the temporary database on success and
on failure. It never accepts a caller-supplied target database name.

Look for both `Restore verification passed for staging` and
`Removed temporary restore database: ...`. If cleanup fails, the command fails
and prints the exact generated database name that needs attention. The current
verification SQL checks the current application schema; older archives may need
a separate recovery/migration procedure to reach that schema.

For a live restore check, compare its row totals with what you expect from the
application around the backup time and verify the printed migration count.
The automated isolated test additionally checks exact account, card, payout,
session, authentication, and statistics fixture data. Record the server run's
date, backup filename, and success output in your private operations notes;
do not commit customer data or private key material.

### 4. Enable scheduling after the restore check passes

```sh
sudo systemctl enable --now blackjack-backup@staging.timer
sudo systemctl list-timers 'blackjack-backup@*'
```

The timer runs daily at 02:30 UTC with up to 15 minutes of random delay. It also
catches up once after downtime. The service has a 30-minute timeout and writes
success/failure status to the journal. Check its status while broader alerting
is still pending:

```sh
sudo systemctl status blackjack-backup@staging.timer blackjack-backup@staging.service
sudo journalctl -u blackjack-backup@staging.service --since '2 days ago' --no-pager
```

Re-run a restore check periodically and after schema/key changes. Provision the
private key temporarily again when needed, keeping it outside the repository
and at permission `600`. After verifying the independent key copy and the first
restore, remove the temporary server key copy; retain your independent copy.

## Production

Once staging is verified, repeat the setup on the existing production VPS using
a separate `production.backup.key`, `/var/backups/blackjack/production`,
`/etc/blackjack/backup-production.env`, and the `@production` service/timer.
Set `BACKUP_ENVIRONMENT=production` and the matching `BACKUP_DIR` and public
recipient in that file. These scripts can back up the current production
database before its API credentials are switched. Take and verify that first
backup before completing the production role transition.

## Recovering the application

The restore-check script is a drill, not an in-place recovery command: it always
removes its test database. For actual recovery, pause scheduled backups and API
writes, restore a trusted archive into a separately created empty database, and
verify it before pointing the application at it. Use `age --decrypt` piped to
`pg_restore --single-transaction --exit-on-error --no-owner --no-acl` as in the
drill, with an explicitly reviewed destination.

A database dump does not include PostgreSQL login passwords, cluster roles, the
root `.env`, or application/release configuration. Keep those recovery secrets
separately. Run the versioned migrations and API-role provisioning against the
recovered database before restarting the API with the recovered database URL.
Check health, login, sessions, and stats, and ensure the PostgreSQL container's
`POSTGRES_DB` points at the intended database before re-enabling this backup job.
The existing database volume should remain available until recovery is verified.

## Automated verification

CI runs eight positive/failure checks against a fresh PostgreSQL 16 service,
including exact restored data, private file permissions, failed dump handling,
wrong keys, corrupted ciphertext, cleanup, locking, and scoped retention. Both
deployment jobs require these checks to pass.

For local verification, explicitly use an isolated PostgreSQL container with the
label `com.blackjack.backup-test=true` and a fresh empty database, then run:

```sh
CONTAINER_ENGINE=podman \
BACKUP_TEST_POSTGRES_CONTAINER=YOUR_LABELED_TEST_CONTAINER \
bash tests/database-backups.sh
```

The harness refuses unlabeled/nonempty containers, generates disposable keys and
data, and removes its temporary files. It does not start or stop your database
containers. `age`, `age-keygen`, Bash, and Linux core utilities are required.
