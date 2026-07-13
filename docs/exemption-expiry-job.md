# Exemption expiry job

Modern LEXIS reproduces the legacy daily expiry monitor at 00:00:30 America/Vancouver time.

For each exemption returned by `LEXIS_GROUP_11.FIND_ALL_EXPIRING_EXEMPTIONS`, the job:

1. changes each non-expired linked application to `EXP`;
2. writes the legacy `Exemption expired, YYYY-MM-DD` application remark as `EXPIRY_MONITOR`;
3. changes each non-expired linked provincial permit to `EXP`; and
4. changes the exemption to `EXP` only after all child records succeed.

Failed aggregates remain eligible for the next daily run. Logs report candidate, expired, and deferred counts.

## Deployment safety

The scheduler has a JVM-local guard that prevents overlapping runs within one backend pod. It does not coordinate different pods.

TEST runs one backend replica with the `Recreate` rollout strategy and enables expiry. The reusable deployment rejects more than one backend replica until distributed edit and scheduler locking is implemented and accepted.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LEXIS_EXPIRY_ENABLED` | `false` | Creates the scheduled job when true. The TEST deployment explicitly sets it to true while TEST has one backend replica. |
| `LEXIS_EXPIRY_CRON` | `30 0 0 * * *` | Spring six-field cron expression. |
| `LEXIS_EXPIRY_ZONE` | `America/Vancouver` | Scheduler time zone. |

## Operations

Prometheus exposes completed, failed, and locally skipped run counters plus gauges for the last completed run's timestamp, candidate count, expired count, and deferred count. A separate gauge records the last top-level failure timestamp. These metrics are process-local and reset when the backend pod restarts; deferred exemptions remain eligible for the next run.
