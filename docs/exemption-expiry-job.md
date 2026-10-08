# Exemption expiry job

Modern LEXIS reproduces the legacy daily expiry monitor at 00:00:30 America/Vancouver time.

For each exemption returned by `LEXIS_GROUP_11.FIND_ALL_EXPIRING_EXEMPTIONS`, the job:

1. changes each non-expired linked application to `EXP`;
2. writes the legacy `Exemption expired, YYYY-MM-DD` application remark as `EXPIRY_MONITOR`;
3. changes each non-expired linked provincial permit to `EXP`; and
4. changes the exemption to `EXP` only after all child records succeed.

Failed aggregates remain eligible for the next daily run. Logs report candidate, expired, and deferred counts.

## Deployment safety

Each backend replica receives the schedule, but JDBC ShedLock allows only the replica holding
`THE.LEXIS_SHEDLOCK` to run the expiry service. The provider uses Oracle time through the existing
application datasource. A six-hour maximum releases the lock after a crashed run, while a
five-minute minimum absorbs trigger skew when a run has no work and completes immediately.
The six-hour maximum is a monitored hard runtime bound; the lock is not renewed. Operations must
monitor runtime and keep runs comfortably below that duration so another replica cannot acquire an
expired lock.

If the table, grants, or Oracle lock provider are temporarily unavailable, the nightly trigger is
skipped and logged; expiry never falls back to an uncoordinated run. API startup and traffic remain
available while the database migration is deployed. Each enabled backend replica also attempts one
reconciliation after the application is ready. The reconciliation uses the same Oracle lock and
idempotent expiry service as the nightly trigger, so only a lock holder runs it and exemptions that
were already processed are harmlessly ignored. Lock contention or a failed startup reconciliation
does not fail pod startup or claim the local run date, so another replica or a later trigger can
retry. Setting `LEXIS_EXPIRY_ENABLED=false` removes the scheduler and its startup listener, so
neither trigger can lock or mutate records. Keep it false while the legacy application remains
responsible for expiry. This setting does not affect application modules or role-based access.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LEXIS_EXPIRY_ENABLED` | `true` | Enables nightly expiry and startup catch-up; false suppresses both. |
| `LEXIS_EXPIRY_CRON` | `30 0 0 * * *` | Spring six-field cron expression. |
| `LEXIS_EXPIRY_ZONE` | `America/Vancouver` | Scheduler time zone. |
| `LEXIS_EXPIRY_LOCK_AT_MOST_FOR` | `PT6H` | Maximum duration of one Oracle scheduler lock. |
| `LEXIS_EXPIRY_LOCK_AT_LEAST_FOR` | `PT5M` | Minimum duration of one Oracle scheduler lock. |

Set the GitHub environment **variable** `LEXIS_EXPIRY_ENABLED` to `false` to disable both triggers,
or `true` to enable them. It is not a secret. The deployment job reads the flag from its selected
GitHub environment, validates it, and passes it to the backend. Changing the variable takes effect
on the next deployment; it does not change running pods immediately.

If the variable is unset, the workflow uses its `expiry_enabled` input: PROD and DEV default to
disabled, TEST to enabled. While legacy owns expiry, keep the PROD variable `false`. After legacy
expiry stops, set it to `true` and run a manual tagged release without editing code. Missed exemptions
remain eligible for startup catch-up and the next nightly run. This replaces the former RTM-only
flag without restricting application access.

## Operations

Prometheus exposes completed, failed, and skipped run counters plus gauges for
the last completed run's timestamp, candidate count, expired count, and deferred count. A separate
gauge records the last top-level failure timestamp. These metrics are process-local and reset when
the backend pod restarts. Lock contention and lock-provider failures increment the skipped counter;
deferred exemptions remain eligible for the next run. When expiry is disabled, the scheduler's
metrics are not registered.
