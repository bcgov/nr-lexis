# Outbound email configuration

Modern LEXIS uses Spring Mail with the BC Government application SMTP relay:

- host: `apps.smtp.gov.bc.ca`
- port: `25`
- SMTP authentication: disabled
- STARTTLS: disabled
- From address: supplied by the `LEXIS_MAIL_FROM` GitHub Environment secret

Workflow services publish immutable email snapshots. A dedicated executor dispatches them after
the surrounding transaction commits. A successful API response means **queued**, not delivered;
delivery is best effort and failures are logged without retry.

## Positional mailbox routing

The regional addresses are positional mailboxes, not distribution lists. The deployment supplies
one secret-backed address for each of RCO, RNI, and RSI, plus the provincial/system mailbox. LEXIS
selects the mailbox from the persisted organization unit; users cannot choose the sender or
regional recipient.

| Workflow | From | To | Cc |
| --- | --- | --- | --- |
| Application Review — rejected or withdrawn | Regional positional mailbox | Editable applicant recipient | — |
| Exemption approval | Regional positional mailbox for the first linked application | Editable applicant recipient | — |
| Permit approval and payment pending | Regional positional mailbox | Editable applicant recipient | — |
| Permit review | Provincial/system mailbox | Regional positional mailbox, then the optional validated permit-review address as a second `To` recipient | — |
| Purchase offer — new, updated, or withdrawn | Provincial/system mailbox | Applicant recipient | Regional positional mailbox |

Applicant defaults come from the workflow record's owner or agent client/location. They do not
come from the logged-in WebADE, Cognito, or FAM identity, and `CLIENT_CONTACT` is not an automatic
fallback. Application Review follows the legacy agent-email-when-present, otherwise-owner rule.
Authorized staff may replace an applicant recipient for that send only; the edited address is not
persisted.

The regional mapping is RCO for Coast organization units, RNI for Northern Interior organization
units, and RSI for Southern Interior organization units. Skeena is normally RNI. Legacy parity
uses a scale-grade exception only for permit approvals and purchase offers: an `A`–`Y` grade routes
to RCO, even when the same scale value also contains digits; otherwise a numeric grade routes to
RNI, and `Z` is ignored while the next scale is considered. If no grade determines a route, LEXIS
does not queue that notification. Permit review remains RNI for Skeena.

## GitHub Environment secrets

Configure these secrets in every deployment environment. The repository and OpenShift template
contain names only; do not commit mailbox values.

| GitHub Environment secret | Runtime setting | Purpose |
| --- | --- | --- |
| `LEXIS_MAIL_FROM` | `LEXIS_MAIL_FROM` | Provincial/system positional mailbox |
| `LEXIS_MAIL_REGION_RCO_ADDRESS` | `LEXIS_MAIL_REGION_RCO_ADDRESS` | RCO positional mailbox |
| `LEXIS_MAIL_REGION_RNI_ADDRESS` | `LEXIS_MAIL_REGION_RNI_ADDRESS` | RNI positional mailbox |
| `LEXIS_MAIL_REGION_RSI_ADDRESS` | `LEXIS_MAIL_REGION_RSI_ADDRESS` | RSI positional mailbox |
| `LEXIS_MAIL_OVERRIDE_RECIPIENTS` | `LEXIS_MAIL_OVERRIDE_RECIPIENTS` | Optional DEV/TEST interception recipients; must be unset in PROD |

The reusable workflow accepts lower-case aliases for these GitHub Environment secrets; configure
the uppercase names above when creating or rotating environment secrets.

Startup validates all four mailbox addresses. PROD rejects an override recipient. There is no
regional fallback address: a missing or unmapped positional route prevents that notification from
being queued.

## Safe TEST/DEV delivery

`LEXIS_MAIL_OVERRIDE_RECIPIENTS` is optional in DEV and TEST. When configured, it replaces all
intended `To` and `Cc` recipients with the designated administrators. The subject and body retain
the environment label, intended sender, and each exact intended `To`/`Cc` address so testers can
verify the routing without contacting business mailboxes. A regional route can therefore be
exercised in DEV or TEST even if its intended recipient is not deliverable outside the override.

When no override is configured, messages are sent to their intended recipients. PROD preserves
the intended recipients and sender, and does not add an interception label.

## TEST acceptance

Before enabling production delivery, configure the four positional-mailbox secrets and a TEST
`LEXIS_MAIL_OVERRIDE_RECIPIENTS` address. A secret change alone does not restart the workload: the
revision containing this configuration must be deployed to TEST.

Exercise each regional route for application rejection/withdrawal, exemption approval, permit
approval/payment-pending, permit review, and purchase-offer create/update/withdrawal. Include
Skeena cases with an `A`–`Y` scale grade and a numeric scale grade, plus a permit-review request
with the optional entered address.

For every intercepted message, inspect the raw received headers and the interception label:

- The MIME `From` must be the provincial or selected regional positional mailbox.
- The MIME `To` must be only the TEST override recipient; no business mailbox should receive TEST
  traffic.
- The subject/body must identify the intended sender and every exact intended `To`/`Cc` address.
  Permit review must show both intended recipients as `To`, never as `Cc`.
- Confirm the SMTP relay did not reject or rewrite the intended sender identity.
