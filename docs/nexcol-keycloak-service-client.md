# NEXCOL Federal Submission API

## Overview

NEXCOL submits federal LEXIS XML through a synchronous machine-to-machine API. Interactive LEXIS
authentication remains independent of this integration.

```text
NEXCOL
  -> Keycloak client-credentials token
  -> API gateway
  -> LEXIS federal validation or submission endpoint
  -> LEXIS federal application tables
```

The OpenShift Route remains internet-accessible. Direct requests still require a valid Keycloak
token with the submission scope, but bypass gateway metrics and throttling. The submission scope
must be assigned only to the approved NEXCOL client.

## Authentication

NEXCOL uses a dedicated confidential Keycloak client. Both federal endpoints require the OAuth
scope:

```text
lexis:federal-submission:submit
```

The gateway validates the token issuer, expiry, required scope, and audience when configured.
LEXIS validates the forwarded token and applies the same scope-based authorization.

The TEST deployment, and the PROD deployment when enabled, idempotently create or check the client
scope, confidential client, and default scope assignment. Each GitHub environment requires:

- secrets `KEYCLOAK_SA_CLIENT_ID` and `KEYCLOAK_SA_CLIENT_SECRET` for the least-privilege
  provisioning service account;
- variable `KEYCLOAK_ISSUER_URI` for the target realm; and
- variable `NEXCOL_KEYCLOAK_CLIENT_ID` for the approved calling client.

The expected calling-client values are:

- TEST: `NEXCOL_KEYCLOAK_CLIENT_ID=lexis-nexcol-test`
- PROD: `NEXCOL_KEYCLOAK_CLIENT_ID=lexis-nexcol-prod`

The deployment fails when required configuration is absent, the existing scope/client shape is
unexpected, or the submission scope is assigned as a realm default or to another client. It does
not remove assignments from unrelated clients. Runtime client-secret lifecycle is managed through
the environment's operational process.

Obtain an access token with the standard client-credentials grant:

```bash
curl -sS -X POST "${TOKEN_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}"
```

Tokens should contain the expected issuer, an unexpired access-token lifetime, and
`lexis:federal-submission:submit` in the `scope` claim. A configured gateway audience is also
represented in `aud`.

## Endpoints

TEST enables validation and submission. The currently disabled PROD deployment is configured to
enable both when production rollout resumes. DEV leaves CREATE disabled because ephemeral preview
deployments do not have a long-lived NEXCOL client or gateway.

| Operation | Endpoint | Successful status | Persistence |
|---|---|---|---|
| Validate | `POST /api/lexis/federal/submissions/validation` | `200` | None |
| Submit | `POST /api/lexis/federal/submissions` | `201` | Federal application, package and scale rows |

Both endpoints consume `application/xml` and return JSON.

## XML Contract

The preferred payload is the legacy ESF submission envelope containing one LEXIS schema-version-2
`LexisSubmission`. The inner `LexisSubmission` is also accepted as raw XML.

Federal payloads include:

- `jurisdictionCode=F` and `applStatusCode=A`;
- federal applicant legal entity, contact and declaration fields;
- `applicationDetail/officeUseOnly` reference, application date, biweekly list date, applicant
  user id and language;
- harvested timber with or without summary-of-scale data, or standing timber; and
- version-2 element names and structure.

Permit and shipping details are outside the federal exemption-submission contract.

LEXIS validates the supplied application date and persists the service receipt date. The export
schedule is resolved from the biweekly list date, with the next available schedule used when an
exact date is unavailable.

Synthetic fixtures are available in `backend/src/test/resources/lexis-upload-samples/`:

- `pass-federal-application.xml`
- `fail-federal-jurisdiction.xml`

## Request Contract

| Value | Location | Description |
|---|---|---|
| `userReference` | Query parameter | Stable business reference, maximum 50 characters |
| `originalFileName` | Query parameter | Source filename for diagnostics |
| `X-Request-ID` | Header | Correlation id for the HTTP attempt, maximum 200 characters |
| `X-Source-System` | Header | Calling system identifier |
| `X-Idempotency-Key` | Header | Stable logical submission id; required for submission |

Each HTTP attempt uses a new request id. Retries of the same logical submission reuse the same
idempotency key.

### Validate

```bash
curl -sS -X POST \
  "${LEXIS_GATEWAY_BASE_URL}/api/lexis/federal/submissions/validation" \
  --url-query "userReference=${USER_REFERENCE}" \
  --url-query "originalFileName=federal.xml" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/xml" \
  -H "X-Request-ID: ${REQUEST_ID}" \
  -H "X-Source-System: NEXCOL" \
  --data-binary "@federal.xml"
```

### Submit

```bash
curl -sS -X POST \
  "${LEXIS_GATEWAY_BASE_URL}/api/lexis/federal/submissions" \
  --url-query "userReference=${USER_REFERENCE}" \
  --url-query "originalFileName=federal.xml" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/xml" \
  -H "X-Request-ID: ${REQUEST_ID}" \
  -H "X-Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -H "X-Source-System: NEXCOL" \
  --data-binary "@federal.xml"
```

## Responses

Responses include processing status, errors, warnings, trace metadata, payload digest and LEXIS
identifiers when available.

| Status | Meaning |
|---|---|
| `200` | XML validated successfully |
| `201` | Submission accepted and persisted |
| `400` | Invalid request metadata or body |
| `401` | Missing, expired or invalid token |
| `403` | Required scope is absent |
| `404` | Gateway route or method is unavailable |
| `409` | The idempotency key conflicts, processing is already in flight on this replica, or the package already exists |
| `422` | XML or business validation failed |
| `503` | Submission creation is disabled or a LEXIS processing dependency is unavailable |

A successful submission includes the generated internal LEXIS `APPLICATION_NUMBER` as
`applicationNumber` and, when available, a relative `Location` header that uses that identifier.
The submitted `FED_APPLICATION_NUMBER` is returned as
`submissionSummary.federalApplicationNumber`; it is display and search metadata, is not guaranteed
to be unique, and must not be used as a detail or mutation identifier. Processing is synchronous;
there is no submission-status polling endpoint.

CREATE requires `X-Idempotency-Key`. The key is scoped to the authenticated caller and bound to the
XML payload, user reference, source-system metadata, and effective filename. A completed non-5xx
response is replayed when the retry reaches the same replica while its bounded entry remains
available. An in-flight `409` includes `Retry-After` guidance and must be retried with the same key
and identical payload. A different-payload `409` must not be retried with that key.

NEXCOL validates before submission and assigns a stable package number and idempotency key to each
logical submission. Distinct validated submissions can be processed concurrently. The application,
package, and scale writes use one Oracle transaction, and `EXPORT_PACKAGE.PACKAGE_NUMBER` is the
cross-replica collision boundary. A retry reaching another replica after the first commit receives
`409` when its package already exists; NEXCOL must stop blind retries and reconcile that package.
This contract intentionally provides best-effort replay rather than durable exactly-once response
replay.

## ESF Migration Mapping

| Previous ESF concept | Direct API equivalent |
|---|---|
| `submissionData` | XML request body |
| `originalFileName` | `originalFileName` query parameter |
| `userReference` | `userReference` query parameter |
| ESF-authenticated submitter | Keycloak machine-client identity |
| ESF submission id | Request/idempotency metadata and returned LEXIS identifiers |
| Upload/schema/finalize stages | HTTP status plus response status, errors and warnings |
| `getSubmissionStatus` polling | Immediate validation or submission response |
| ESF accepted/rejected message | `201` or `422` JSON response |

The legacy ESF source, LEXIS VC schema/parser and representative archived submissions define the
compatibility baseline for the direct API.
