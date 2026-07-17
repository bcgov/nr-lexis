# Outbound email configuration

Modern LEXIS uses Spring Mail with the BC Government application SMTP relay default:

- host: `apps.smtp.gov.bc.ca`
- port: `25`
- SMTP authentication: disabled
- STARTTLS: disabled
- From address: supplied by the `LEXIS_MAIL_FROM` GitHub Environment secret

Workflow services publish immutable email snapshots. A dedicated executor dispatches them asynchronously after the surrounding transaction commits. Events published outside a transaction use the same executor.

Email responses mean **queued**, not delivered. Delivery is best effort; failures are logged and are not retried.

## Recipient routing

The backend resolves the RCO, RNI, or RSI distribution list from the record's persisted organization unit. Permit-review requests send to that list and purchase-offer notifications copy it.

Applicant notification defaults come from `CLIENT_LOCATION.EMAIL_ADDRESS` for the workflow's recorded owner or agent client/location. They do not come from the logged-in WebADE, Cognito, or FAM identity, and they do not use `CLIENT_CONTACT` as an automatic fallback. Application Review uses the legacy agent-email-when-present, otherwise-owner rule. Other workflows retain their own legacy owner/agent selection rules rather than universally substituting the owner when an agent address is missing.

Authorized staff may edit the default recipient for an application-status, exemption-approval, or permit notification. The edited address applies only to that send and is not persisted to the application or shared client data. A missing recipient is a recoverable client-data condition: the business mutation remains committed, and purchase-offer workflows report that manual notification is required.

LEXIS does not persist the authenticated Business BCeID email for legacy parity. No application notification-contact table/package or email-capture deployment setting is required.

`LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS` remains available as a migration fallback when a regional list is not configured or the organization unit is not mapped. Configure all three regional lists before removing that fallback.

## Safe TEST/DEV delivery

`LEXIS_MAIL_OVERRIDE_RECIPIENTS` is optional in DEV and TEST. When it is configured, every original To/Cc address is replaced with the configured administrators. The subject identifies the deployment environment and intended recipient or regional group, and the original recipients are recorded in the message body. When no override is configured, messages are sent to their intended recipients.

Example subject prefixes are `[TEST - REGION_RCO]`, `[TEST - PERMIT_REQUEST]`, `[TEST - applicant@example.com]`, and `[TEST - applicant@example.com; CC REGION_RCO]`.

Configure the GitHub Environment:

| Setting | Type | Required value |
|---|---|---|
| `LEXIS_MAIL_FROM` | Secret | Approved sender mailbox; required in every environment |
| `LEXIS_MAIL_OVERRIDE_RECIPIENTS` | Secret | Optional comma/semicolon-separated DEV/TEST interception recipients; must be unset in PROD |
| `LEXIS_MAIL_REGION_RCO_RECIPIENTS` | Secret | RCO distribution list; optional in DEV/TEST and required in PROD unless the fallback is configured |
| `LEXIS_MAIL_REGION_RNI_RECIPIENTS` | Secret | RNI distribution list; optional in DEV/TEST and required in PROD unless the fallback is configured |
| `LEXIS_MAIL_REGION_RSI_RECIPIENTS` | Secret | RSI distribution list; optional in DEV/TEST and required in PROD unless the fallback is configured |
| `LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS` | Secret | Optional migration fallback that may provide PROD coverage instead of all three regional lists |

The deployment workflow sets `LEXIS_MAIL_NON_PRODUCTION=true` outside PROD and supplies its non-secret `dev` or `test` label through `LEXIS_MAIL_ENVIRONMENT`. PROD preserves the actual workflow recipients and does not add an interception label.

- DEV/TEST: an override redirects every message when configured. Without it, applicant messages go to their intended recipients. Regional and fallback lists may be absent; regional messages can still be intercepted when an override is configured, but otherwise have no delivery destination.
- PROD: leave `LEXIS_MAIL_OVERRIDE_RECIPIENTS` unset and configure either all three regional lists or the fallback recipient list.

Outbound workflow mail is always active. Startup requires a valid sender in every environment and validates each optional recipient list when configured. PROD rejects override recipients and requires either all three regional lists or the fallback recipient list. DEV/TEST may omit the override and regional lists.
