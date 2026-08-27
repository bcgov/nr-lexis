# NEXCOL Federal Submission API

## Overview

NEXCOL submits federal LEXIS XML through a synchronous machine-to-machine API. Interactive LEXIS
authentication remains independent of this integration.

```text
NEXCOL
  -> Keycloak client-credentials token
  -> API gateway
  -> OpenShift backend Service
  -> LEXIS federal prevalidation, validation or submission endpoint
  -> legacy validation procedures or LEXIS federal application tables
```

The API gateway is the supported external entry point. LEXIS also validates the forwarded token
and independently enforces the same authentication and authorization requirements. The gateway
uses the cluster-local backend Service; the deployment template declares no Spring Boot Route and
does not admit the OpenShift ingress router, while the public frontend proxy does not forward these
three machine-only paths.

## Authentication

Two Keycloak clients have different responsibilities in this integration:

| Client | Configuration | Used by | Purpose |
|---|---|---|---|
| Deployment provisioning client | GitHub environment secrets `KEYCLOAK_SA_CLIENT_ID` and `KEYCLOAK_SA_CLIENT_SECRET` | LEXIS deployment workflow | Creates or checks the client scope and dedicated NEXCOL runtime client |
| NEXCOL runtime client | GitHub environment variable `NEXCOL_KEYCLOAK_CLIENT_ID`; its runtime secret is managed operationally | NEXCOL | Obtains access tokens and calls the gateway |

The deployment provisioning client is not a NEXCOL credential and must not be used to call the
federal endpoints. NEXCOL receives the dedicated runtime client id and its corresponding runtime
client secret.

All three federal endpoints require this OAuth scope:

```text
lexis:federal-submission:submit
```

The runtime client is confidential, has service accounts enabled, and uses only the
`client_credentials` grant. The submission scope is assigned as a default client scope, so it is
included in each service-account access token without a `scope` parameter in the token request.

| Environment | Runtime client id | Gateway base URL | Issuer | Token endpoint |
|---|---|---|---|---|
| TEST | `lexis-nexcol-test` | `https://nr-lexis-nexcol-test-api-gov-bc-ca.test.api.gov.bc.ca` | `https://test.loginproxy.gov.bc.ca/auth/realms/forests` | `https://test.loginproxy.gov.bc.ca/auth/realms/forests/protocol/openid-connect/token` |
| PROD | `lexis-nexcol-prod` | `https://nr-lexis-nexcol.api.gov.bc.ca` | `https://loginproxy.gov.bc.ca/auth/realms/forests` | `https://loginproxy.gov.bc.ca/auth/realms/forests/protocol/openid-connect/token` |

The PROD gateway URL is projected for integration configuration and becomes functional after the
production gateway and LEXIS deployment are provisioned.

An authenticated request must present an unexpired access token issued for the target environment,
with `lexis:federal-submission:submit` in its `scope` claim, as
`Authorization: Bearer <access-token>`. The gateway validates issuer, signature, expiry, required
scope, and audience when configured. LEXIS validates the forwarded token and applies the same
scope-based authorization.

The TEST deployment, and the PROD deployment when enabled, idempotently create or check the client
scope, confidential client, and default scope assignment. Each GitHub environment requires:

- secrets `KEYCLOAK_SA_CLIENT_ID` and `KEYCLOAK_SA_CLIENT_SECRET` for the least-privilege
  provisioning service account;
- variable `KEYCLOAK_ISSUER_URI` for the target realm; and
- variable `NEXCOL_KEYCLOAK_CLIENT_ID` for the approved calling client.

The deployment fails when required configuration is absent, the existing scope/client shape is
unexpected, or the submission scope is assigned as a realm default or to another client. It does
not remove assignments from unrelated clients. Runtime client-secret lifecycle is managed through
the environment's operational process.

Obtain an access token with the runtime NEXCOL credentials:

```bash
ACCESS_TOKEN="$(curl -fsS -X POST "${TOKEN_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}" \
  | jq -er '.access_token')"
```

The returned token can be checked against the realm before calling LEXIS:

```bash
curl -fsS -X POST "${TOKEN_URL}/introspect" \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  --data-urlencode "token=${ACCESS_TOKEN}" \
  | jq '{active, client_id, scope, exp}'
```

The result must show `active: true`, the expected runtime client id, and the required scope. A
configured gateway audience is represented in the token's `aud` claim. In Swagger UI, authorize
with the resulting access token; do not enter the provisioning client credentials there.

## Endpoints

All three endpoints exist in every backend deployment but are externally exposed only through a
configured API gateway. TEST provides the supported NEXCOL gateway and service-client integration;
DEV has no supported NEXCOL gateway/client configuration, and PROD remains unprovisioned.

The machine-readable gateway contract is available in
[`gateway/openapi.yaml`](../gateway/openapi.yaml). Its `servers` list contains the TEST URL and the
projected PROD URL documented above.

| Operation | Endpoint | Successful status | Persistence |
|---|---|---|---|
| Prevalidate legacy fields | `POST /api/lexis/federal/submissions/prevalidation` | `200` | None |
| Validate | `POST /api/lexis/federal/submissions/validation` | `200` | None |
| Submit | `POST /api/lexis/federal/submissions` | `201` | Federal application and, when supplied, package and scale rows |

Prevalidation accepts JSON, raw legacy XML, SOAP 1.1, or SOAP 1.2 and returns the corresponding
format. Validation and submission consume XML and return JSON.

## Legacy Field Prevalidation

The prevalidation endpoint preserves the legacy `lexisws` field-validation contract without
requiring a complete submission or an `officeUseOnly` element. NEXCOL sends the same four values it
sent to the legacy service:

```json
{
  "boomNumber": "FED26-700123",
  "clientNumber": "00123456",
  "locationCode": "01",
  "timberMark": ["TM001", "TM002"]
}
```

The endpoint accepts both the documented lower-camel JSON names and the equivalent .NET
PascalCase names (`BoomNumber`, `ClientNumber`, `LocationCode`, and `TimberMark`). This lets an
existing .NET model serialize directly without silently binding to null values.

The response echoes those values and adds the ordered legacy validation errors:

```json
{
  "boomNumber": "FED26-700123",
  "clientNumber": "00123456",
  "errors": ["timberMark: TM002"],
  "locationCode": "01",
  "timberMark": ["TM001", "TM002"]
}
```

HTTP `200` means the prevalidation operation completed. An empty `errors` array means every value
passed; otherwise NEXCOL displays or handles the returned errors. The endpoint does not persist
data and delegates to the existing legacy Oracle validation procedures for client number, location
code, boom number and each timber mark.

The supported prevalidation wire formats are:

| Request content type | Accepted request | Response |
|---|---|---|
| `application/json` | Lower-camel or .NET PascalCase object | JSON object |
| `application/xml` | Raw `LogExportApplication` XML | Raw `LogExportApplication` XML |
| `text/xml` | SOAP 1.1 `isValidApplication` request | SOAP 1.1 `isValidApplicationResponse` |
| `application/soap+xml` | SOAP 1.2 `isValidApplication` request | SOAP 1.2 `isValidApplicationResponse` |

### Compatibility rationale

The legacy `lexisws` operation was an Axis RPC SOAP service whose
`isValidApplication(LogExportApplication)` request carried these fields as XML. The first modern
prevalidation endpoint accepted only lower-camel JSON. That required an existing NEXCOL caller to
change serialization, caused raw XML to be rejected as an unsupported media type, and allowed a
.NET PascalCase JSON object to bind as null values.

Prevalidation now accepts both modern JSON and the legacy XML/SOAP representations. This is a
transport compatibility correction only: every format maps to the same DTO, repository procedures,
validation order, error strings, and non-persisting service path.

Raw XML may use the legacy bean namespace or an unqualified root. Arrays use an `item` element:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LogExportApplication xmlns="http://beans.validation.lexis.ws.mof.gov.bc.ca">
  <boomNumber>FED26-700123</boomNumber>
  <clientNumber>00123456</clientNumber>
  <locationCode>01</locationCode>
  <timberMark>
    <item>TM001</item>
    <item>TM002</item>
  </timberMark>
</LogExportApplication>
```

SOAP compatibility includes the Axis RPC `href`/`multiRef` representation generated by the legacy
service contract, as well as an inline `logExportApplication` value. Existing namespace prefixes
and the `SOAPAction` header may be retained; validation is based on namespace URIs and element
names. The SOAP response uses the request's SOAP version and operation namespace.

Malformed JSON, XML, or SOAP returns `400`. A supported bearer token is authorized before body
processing. If an unsupported media type is supplied, LEXIS returns `415`; that error is not
rewritten as an authorization `403`.

## XML Contract

The preferred payload is the legacy ESF submission envelope containing one LEXIS schema-version-2
`LexisSubmission`. The inner `LexisSubmission` is also accepted as raw XML.

XML namespace prefixes are aliases, so the literal `esf:` and `lexis:` prefixes are not required.
LEXIS accepts an ESF envelope that uses the ESF namespace as its default namespace, as well as the
prefixed legacy form; the namespace URIs and element structure must still match the legacy schema.

The validation baseline is the legacy version-2 LEXIS XSD and legacy business-validation
behaviour. The new authentication, HTTP and JSON response contracts do not intentionally change
which submission data is accepted. Compatibility-sensitive rules include:

- exemption reason codes `E`, `S` and `U`;
- applicant type codes `A`, `M` and `O`;
- a non-negative federal office-use reference;
- case-insensitive federal package-number comparison;
- federal timber-mark type and status validation, with the first scale timber mark matched to the
  application region;
- species validation for the selected region and grade validation for the selected region and
  species; and
- the effective legacy numeric limits, including up to `999,999,999` scale pieces, `99.0` for
  average length and `99.9` for average diameter.

Federal harvested-timber submissions require summary-of-scale rows and a boom/package number.
As in legacy LEXIS, a federal standing-timber submission omits the boom/package number and may
omit its average length and diameter; only the application record is created.

The validation and submission endpoints apply the same validation before submission persists any
records.

Federal payloads include:

- `jurisdictionCode=F` and `applStatusCode=A`;
- federal applicant legal entity, contact and declaration fields;
- `applicationDetail/officeUseOnly` reference, application date, biweekly list date, applicant
  user id and language;
- harvested timber with summary-of-scale data, or standing timber; and
- version-2 element names and structure.

Permit and shipping details are outside the federal exemption-submission contract.

LEXIS validates the supplied application date and persists the service receipt date. The export
schedule is resolved from the biweekly list date, with the next available schedule used when an
exact date is unavailable.

Synthetic XML-shape fixtures are available in `backend/src/test/resources/lexis-upload-samples/`:

- `pass-federal-application.xml`
- `fail-federal-jurisdiction.xml`

Their client, location and timber-mark values are placeholders for automated tests and are not
guaranteed to pass live environment reference-data validation. The non-mutating TEST procedure in
[`gateway/smoke-test/README.md`](../gateway/smoke-test/README.md) accepts an operator-owned
live-valid fixture without storing that data in the repository.

The OpenAPI request example is kept identical to `pass-federal-application.xml`, and automated
regression coverage runs that published example through the federal validation path, including the
legacy XSD check.

## Request Examples

The following metadata applies to the XML validation and submission endpoints:

| Value | Location | Description |
|---|---|---|
| `userReference` | Query parameter | Stable business reference, maximum 50 characters |
| `originalFileName` | Query parameter | Source filename for diagnostics |
| `X-Request-ID` | Header | Correlation id for the HTTP attempt, maximum 200 characters |
| `X-Source-System` | Header | Calling system identifier |
| `X-Idempotency-Key` | Header | Stable logical submission id; required for submission |

Each HTTP attempt uses a new request id. Retries of the same logical submission reuse the same
idempotency key.

### Prevalidate legacy fields with JSON

```bash
curl -sS -X POST \
  "${LEXIS_GATEWAY_BASE_URL}/api/lexis/federal/submissions/prevalidation" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "@prevalidation.json"
```

The same request can use the existing .NET property names:

```json
{
  "BoomNumber": "FED26-700123",
  "ClientNumber": "00123456",
  "LocationCode": "01",
  "TimberMark": ["TM001", "TM002"]
}
```

### Prevalidate legacy fields with raw XML

```bash
curl -sS -X POST \
  "${LEXIS_GATEWAY_BASE_URL}/api/lexis/federal/submissions/prevalidation" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/xml" \
  --data-binary "@prevalidation.xml"
```

### Prevalidate legacy fields with SOAP 1.1

```bash
curl -sS -X POST \
  "${LEXIS_GATEWAY_BASE_URL}/api/lexis/federal/submissions/prevalidation" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H 'SOAPAction: "isValidApplication"' \
  --data-binary "@prevalidation-soap.xml"
```

The OpenAPI specification contains runnable raw XML and Axis SOAP request examples.

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
| `200` | Field prevalidation completed (inspect `errors`) or XML validated successfully |
| `201` | Submission accepted and persisted |
| `400` | Invalid request metadata or body |
| `401` | Missing, expired or invalid token |
| `403` | Required scope is absent |
| `404` | Gateway route or method is unavailable |
| `409` | The idempotency key conflicts, processing is already in flight on this replica, or the package already exists |
| `422` | XML or business validation failed |
| `503` | A LEXIS processing dependency is unavailable |

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
