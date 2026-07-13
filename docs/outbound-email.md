# Outbound email configuration

Modern LEXIS uses Spring Mail with the BC Government application SMTP relay default:

- host: `apps.smtp.gov.bc.ca`
- port: `25`
- SMTP authentication: disabled
- STARTTLS: disabled
- default From: `Provincial.Log.Export.Analyst@gov.bc.ca`

Workflow services publish immutable email snapshots. A dedicated executor dispatches them asynchronously after the surrounding transaction commits. Events published outside a transaction use the same executor.

Email responses mean **queued**, not delivered. Delivery is best effort; failures are logged and are not retried.

## Safe TEST/DEV delivery

Non-production delivery fails closed unless override recipients are configured. When enabled, every original To/Cc address is replaced with the configured administrators. The subject receives a `[NON-PROD]` prefix and the original recipients are recorded in the message body.

Configure the GitHub Environment:

| Setting | Type | Required value |
|---|---|---|
| `LEXIS_MAIL_ENABLED` | Variable | `true` when the environment is ready to send mail |
| `LEXIS_MAIL_FROM` | Variable | Approved sender mailbox; defaults to the provincial analyst address |
| `LEXIS_MAIL_OVERRIDE_RECIPIENTS` | Secret | Comma/semicolon-separated approved DEV/TEST recipients |
| `LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS` | Secret | Ministry inbox(es) receiving permit-ready-for-review notifications |

The deployment workflow sets `LEXIS_MAIL_NON_PRODUCTION=true` outside PROD. PROD preserves the actual workflow recipients.

When mail is enabled, the backend validates this configuration during startup. It requires a valid sender, a complete valid permit-review recipient list, and at least one valid override recipient outside PROD. A missing, blank, or malformed entry prevents the pod from becoming ready instead of silently discarding workflow mail. Mail-disabled environments keep the permissive defaults above.
