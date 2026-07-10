# NEXCOL Federal Submission Integration

This integration replaces the NEXCOL-to-ESF path for federal LEXIS XML submissions with a
machine-to-machine API path. Federal users do not sign in to the LEXIS UI.

```text
NEXCOL
  -> API Services Portal client-credentials token
  -> API gateway
  -> LEXIS federal validation or submission endpoint
  -> existing LEXIS federal application tables
```

LEXIS continues to use Cognito/FAM for interactive users. That login flow is independent of the
NEXCOL integration.

## Authorization Contract

Both federal endpoints require this authorization:

```text
lexis:federal-submission:submit
```

The API Services Portal credential issuer assigns it to the NEXCOL client. The issued access token
may represent it as a client role or OAuth scope; the LEXIS backend maps either representation to
the same Spring Security authority.

There are two different service credentials involved in the overall setup:

- The NEXCOL runtime client id and secret are issued through the API Services Portal
  product/application flow. NEXCOL uses them to obtain access tokens.
- The optional LEXIS deployment service account can create/check direct Keycloak client scopes.
  Its id and secret are deployment secrets and are never given to NEXCOL.

The deploy-time scope synchronization follows the same pattern as `nr-user-lookup-api`: the issuer
comes from `KEYCLOAK_ISSUER_URI`, and the sync step runs only when the Keycloak management service
account is configured. API Services Portal tokens are trusted through the appropriate additional
issuer configuration. Issuer values and credentials belong in environment configuration, not in
this repository.

## Consumer Provisioning

Provision each environment independently:

1. LEXIS publishes an API product containing only the two federal `POST` operations.
2. NEXCOL creates or selects an API Services Portal application and requests access to the product.
3. The access request is approved through the agreed operational process.
4. API Services Portal provides the environment-specific token URL, client id, and client secret.
5. NEXCOL stores the secret in an approved secret manager and obtains tokens with
   `client_credentials`.

Do not reuse TEST credentials in PROD. Do not send client secrets or bearer tokens through source
control, tickets, chat, request logs, or email.

## Obtain an Access Token

Use the token URL and credentials supplied by API Services Portal:

```bash
curl -sS -X POST "${TOKEN_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}"
```

The response contains an `access_token`, `token_type`, and expiry. Cache the token in memory and
refresh it before expiry rather than requesting a token for every XML call.

Before integration testing, decode a token locally and verify:

- `iss` is the expected issuer for the target environment.
- `aud` is the expected gateway audience.
- `client_roles` or `scope` contains `lexis:federal-submission:submit`.
- The token is an access token and has not expired.

Claim names are part of the provider configuration. NEXCOL must not modify or self-issue these
claims.

## HTTP Contract

Validation does not write federal application rows:

```text
POST /api/lexis/federal/submissions/validation
```

Submission validates and, when accepted, writes through the existing LEXIS federal application
import transaction:

```text
POST /api/lexis/federal/submissions
```

Use `Content-Type: application/xml`. For compatibility, the preferred NEXCOL payload is the same
ESF submission envelope used by the legacy integration, containing one LEXIS schema-version-2
`LexisSubmission`. The backend can also accept the inner `LexisSubmission` as raw XML, but NEXCOL
does not need to transform its existing payload for the direct API.

The federal XML contract is the existing LEXIS version-2 contract:

- `jurisdictionCode` is `F`, `applStatusCode` is `A`, and the applicant includes the federal
  `eicbNumber`, legal-entity/contact details, and declarations.
- `applicationDetail/officeUseOnly` contains the EXCOL reference id, application date, biweekly
  list date, applicant user id, and language (`E` or `F`).
- The product is harvested timber with summary of scale, harvested timber without summary of
  scale, or standing timber, using the version-2 element names and structure.
- Permit and shipping details are not part of the federal exemption-submission XML contract.

LEXIS validates the supplied application date for compatibility, then uses its service receipt
date for the persisted application/received dates as the ESF consumer did. It resolves the export
schedule from the supplied biweekly-list date and falls back to the next available schedule when
there is no exact match.

Synthetic smoke-test payloads are available under
`backend/src/test/resources/lexis-upload-samples/`:

- `pass-federal-application.xml` exercises successful validation.
- `fail-federal-jurisdiction.xml` exercises rejected validation because required federal details
  are missing.

The passing fixture is safe for validation only. Replace its business identifiers with approved
TEST values before calling the submission endpoint.

Send the correlation, source, and business-reference metadata on every request. Send an
idempotency key for submit requests:

| Value | Location | Semantics |
|---|---|---|
| `userReference` | Query parameter | Stable NEXCOL business reference, at most 50 characters |
| `originalFileName` | Query parameter | Diagnostic source filename |
| `X-Request-ID` | Header | Unique correlation id for this HTTP attempt, at most 200 characters |
| `X-Source-System` | Header | Calling system identifier, for example `NEXCOL` |
| `X-Idempotency-Key` | Header | Stable logical submission id; required for submit requests |

These are integration-contract requirements even if an environment is temporarily configured with
permissive compatibility settings. Consumers must not depend on being able to omit them.

Use a new `X-Request-ID` for each HTTP attempt. Reuse the same `X-Idempotency-Key` when retrying the
same logical submission, and never reuse it for different XML.

### Validate XML

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

### Submit XML

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

The response body is JSON and includes the processing status, validation errors and warnings,
LEXIS identifiers when available, the supplied trace metadata, and a SHA-256 digest of the payload.
An abridged successful validation response has this shape:

```json
{
  "uploadType": "applicationSubmission",
  "fileName": "federal.xml",
  "status": "validated",
  "message": "<validation summary>",
  "applicationNumber": null,
  "errors": [],
  "warnings": [],
  "userReference": "<NEXCOL reference>",
  "requestId": "<request id>",
  "idempotencyKey": null,
  "payloadSha256": "<SHA-256 digest>",
  "sourceSystem": "NEXCOL",
  "payloadRootType": "<recognized XML root type>"
}
```

Expected HTTP results:

| Status | Meaning | NEXCOL action |
|---|---|---|
| `200` | XML validated successfully | Submit when appropriate |
| `201` | Submission accepted and written | Store returned identifiers; do not resubmit |
| `400` | Missing/invalid request metadata or non-XML body | Correct the request |
| `401` | Missing, expired, or invalid token | Obtain a valid token |
| `403` | Token lacks the required authorization | Correct product/client access |
| `404` | Route or method is not exposed by the gateway | Correct the request URL/method |
| `422` | XML or business validation rejected the submission | Correct the payload using `errors` |
| `503` | LEXIS could not process the request | Honour `Retry-After` and retry cautiously |

A successful submit returns `201 Created`, an `applicationNumber`, and a relative `Location` header
when the application number is available. This is synchronous: there is no ESF submission-status
polling step.

## Retry and Idempotency Gate

Do not retry `400`, `401`, `403`, `404`, or `422` unchanged. Token refresh may resolve `401`;
corrected access may resolve `403`.

For a transport timeout or `503`, keep the same logical idempotency key. The current endpoint
captures and returns `X-Idempotency-Key` for traceability, but durable server-side response replay
and duplicate suppression must be completed and tested before automated PROD retries are enabled.
Until then, treat an indeterminate submit result as an operational reconciliation case rather than
blindly resubmitting it.

## ESF Replacement Mapping

| Previous ESF concept | Direct LEXIS API equivalent |
|---|---|
| `submissionData` | XML request body |
| `originalFileName` | `originalFileName` query parameter |
| `userReference` | `userReference` query parameter |
| ESF-authenticated `submittedBy` | JWT machine-client identity |
| ESF submission id | Request/idempotency metadata and returned LEXIS identifiers |
| Upload/schema/finalize stages | HTTP status plus response `status`, `errors`, and `warnings` |
| `getSubmissionStatus` polling | Immediate validation or submission response |
| ESF accepted/rejected status message | `201` or `422` JSON response |

The legacy ESF source, LEXIS VC 2.8.x schema/parser, and archived ESF submissions define the
compatibility contract. Archived production XML must be extracted and sanitized in an approved
private workspace before it is converted into repository fixtures.

## Readiness Decisions

Resolve these before PROD consumer onboarding:

- Extract a small set of recent archived federal LEXIS submissions from ESF and use them to build
  sanitized accepted/rejected schema-version-2 fixtures.
- Verify the deployed ESF schema copy against the version-2 schema before enabling full local XSD
  validation at the direct endpoint.
- Confirm through source/integration inventory whether either legacy LEXIS validation web service
  is still called independently of ESF submission.
- Implement and test durable idempotent replay for submit requests.
- Confirm gateway-only ingress or enforce the expected audience at the backend if direct route bypass
  is not acceptable.

## Public Repository Boundary

Do not commit gateway hosts, upstream routes, issuer URLs, audiences, product or gateway identifiers,
client identifiers, credentials, bearer tokens, filled gateway configuration, portal exports, or
real federal XML. Store operational values in approved private configuration and secret-management
systems.
