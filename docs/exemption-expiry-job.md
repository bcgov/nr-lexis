# Exemption expiry job

Modern LEXIS reproduces the legacy daily expiry monitor at 00:00:30 America/Vancouver time.

For each exemption returned by `LEXIS_GROUP_11.FIND_ALL_EXPIRING_EXEMPTIONS`, the job:

1. changes each non-expired linked application to `EXP`;
2. writes the legacy `Exemption expired, YYYY-MM-DD` application remark as `EXPIRY_MONITOR`;
3. changes each non-expired linked provincial permit to `EXP`; and
4. changes the exemption to `EXP` only after all child records succeed.

Failed aggregates remain eligible for the next daily run. Logs report candidate, expired, and deferred counts.

## Deployment safety

The scheduler uses a Redis-backed ShedLock lease. All backend replicas may trigger the schedule, but
only the replica holding the shared lease runs the expiry process. A successful business-date marker
prevents a later pod start from repeating that day's completed run. Redis failures fail closed
without preventing the application from starting.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LEXIS_EXPIRY_ENABLED` | `false` | Creates the Redis-coordinated scheduled job when true. |
| `LEXIS_EXPIRY_CRON` | `30 0 0 * * *` | Spring six-field cron expression. |
| `LEXIS_EXPIRY_ZONE` | `America/Vancouver` | Scheduler time zone. |
| `LEXIS_EXPIRY_LOCK_AT_MOST_FOR` | `PT6H` | Maximum Redis lease duration for one run. |
| `LEXIS_EXPIRY_LOCK_AT_LEAST_FOR` | `PT0S` | Minimum Redis lease duration after a run starts. |
| `LEXIS_EXPIRY_COMPLETION_RETENTION` | `3d` | Retention for successful business-date markers. |

## Operations

Prometheus exposes completed, failed, lock-skipped, and locally skipped run counters plus gauges for
the last completed run's timestamp, candidate count, expired count, and deferred count. A separate
gauge records the last top-level failure timestamp. These metrics are process-local and reset when
the backend pod restarts; deferred exemptions remain eligible for the next run.
