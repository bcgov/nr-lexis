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

If the table, grants, or Oracle lock provider are temporarily unavailable, the trigger and startup
catch-up are skipped and logged; expiry never falls back to an uncoordinated run. API startup and
traffic remain available while the database migration is deployed.

ShedLock prevents concurrent runs but is not a durable per-day completion ledger. A backend pod
starting later than the five-minute minimum can repeat an already completed same-day candidate
scan. This is safe because expiry re-reads and locks each aggregate and converges on the same final
state, but operators should expect the possible additional scan.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LEXIS_EXPIRY_ENABLED` | `false` | Creates the scheduled job when true. |
| `LEXIS_EXPIRY_CRON` | `30 0 0 * * *` | Spring six-field cron expression. |
| `LEXIS_EXPIRY_ZONE` | `America/Vancouver` | Scheduler time zone. |
| `LEXIS_EXPIRY_LOCK_AT_MOST_FOR` | `PT6H` | Maximum duration of one Oracle scheduler lock. |
| `LEXIS_EXPIRY_LOCK_AT_LEAST_FOR` | `PT5M` | Minimum duration of one Oracle scheduler lock. |

## Operations

Prometheus exposes completed, failed, and skipped run counters plus gauges for
the last completed run's timestamp, candidate count, expired count, and deferred count. A separate
gauge records the last top-level failure timestamp. These metrics are process-local and reset when
the backend pod restarts. Lock contention and lock-provider failures increment the skipped counter;
deferred exemptions remain eligible for the next run.
