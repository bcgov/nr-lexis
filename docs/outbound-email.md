# Outbound email configuration

Modern LEXIS uses Spring Mail with the BC Government application SMTP relay default:

- host: `apps.smtp.gov.bc.ca`
- port: `25`
- SMTP authentication: disabled
- STARTTLS: disabled
- From address: supplied by the `LEXIS_MAIL_FROM` GitHub Environment variable

Workflow services publish immutable email snapshots. A dedicated executor dispatches them asynchronously after the surrounding transaction commits. Events published outside a transaction use the same executor.

Email responses mean **queued**, not delivered. Delivery is best effort; failures are logged and are not retried.

## Recipient routing

The backend resolves the RCO, RNI, or RSI distribution list from the record's persisted organization unit. Permit-review requests send to that list and purchase-offer notifications copy it. Applicant notifications use the validated recipient saved with the application, exemption, or permit workflow.

`LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS` remains available as a migration fallback when a regional list is not configured or the organization unit is not mapped. Configure all three regional lists before removing that fallback.

## Safe TEST/DEV delivery

Non-production delivery fails closed unless override recipients are configured. When enabled, every original To/Cc address is replaced with the configured administrators. The subject identifies the deployment environment and intended recipient or regional group, and the original recipients are recorded in the message body.

Example subject prefixes are `[TEST - REGION_RCO]`, `[TEST - PERMIT_REQUEST]`, `[TEST - applicant@example.com]`, and `[TEST - applicant@example.com; CC REGION_RCO]`.

Configure the GitHub Environment:

| Setting | Type | Required value |
|---|---|---|
| `LEXIS_MAIL_ENABLED` | Variable | `true` when the environment is ready to send mail |
| `LEXIS_MAIL_FROM` | Variable | Approved sender mailbox; required whenever mail is enabled |
| `LEXIS_MAIL_OVERRIDE_RECIPIENTS` | Secret | Comma/semicolon-separated approved DEV/TEST recipients |
| `LEXIS_MAIL_REGION_RCO_RECIPIENTS` | Secret | Externally managed RCO distribution list recipient(s) |
| `LEXIS_MAIL_REGION_RNI_RECIPIENTS` | Secret | Externally managed RNI distribution list recipient(s) |
| `LEXIS_MAIL_REGION_RSI_RECIPIENTS` | Secret | Externally managed RSI distribution list recipient(s) |
| `LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS` | Secret | Optional migration fallback recipient(s) |

The deployment workflow sets `LEXIS_MAIL_NON_PRODUCTION=true` outside PROD and supplies its non-secret `dev` or `test` label through `LEXIS_MAIL_ENVIRONMENT`. PROD preserves the actual workflow recipients and does not add the interception label.

- DEV/TEST: set `LEXIS_MAIL_OVERRIDE_RECIPIENTS` before enabling mail. Regional values can be exercised safely because delivery is globally redirected.
- PROD: configure all three regional secrets and leave mail disabled until the lists are confirmed. Leave `LEXIS_MAIL_OVERRIDE_RECIPIENTS` unset; production startup rejects any configured override.

When mail is enabled, the backend validates this configuration during startup. It requires a valid sender, valid regional or fallback recipients, and at least one valid override recipient outside PROD. A missing, blank, or malformed required entry prevents the pod from becoming ready instead of silently discarding workflow mail. Mail-disabled environments may leave the sender and recipients unset.
