# NEXCOL Keycloak Service Client

This flow replaces the old NEXCOL -> ESF path for federal LEXIS XML submissions with a direct
NEXCOL -> LEXIS API path.

## Runtime Flow

```text
NEXCOL
  -> API Services Portal gateway client_credentials token
  -> bearer token containing scope/client role lexis:federal-submission:submit
  -> API Services Portal gateway route
  -> LEXIS backend federal validation/submission endpoint
  -> existing federal application import path
```

LEXIS still uses Cognito/FAM for interactive users. Keycloak is only for NEXCOL
machine-to-machine traffic. The API Services Portal gateway setup is captured in `gateway/`.

## LEXIS-Owned Scope

Required scope:

```text
lexis:federal-submission:submit
```

LEXIS creates this client scope in each target Keycloak realm during deploy through:

```text
.github/scripts/ensure-keycloak-scopes.sh
```

The deploy step is opt-in and runs when these GitHub environment secrets are present:

```text
keycloak_sa_client_id
keycloak_sa_client_secret
```

Those credentials are for a Keycloak management service account that can create client scopes. They
are not the NEXCOL runtime client credentials.

When using API Services Portal's shared `apigw` IdP, APS can grant the same value as a client role
through the gateway `CredentialIssuer`. The backend maps Keycloak client roles to the same
`SCOPE_...` authority as OAuth scopes, so `lexis:federal-submission:submit` remains the single
authorization contract either way.

Each GitHub environment also needs:

```text
KEYCLOAK_ISSUER_URI
```

Current LEXIS/NEXCOL setup should use the `forests` realm unless the Keycloak team directs
otherwise.

```text
https://dev.loginproxy.gov.bc.ca/auth/realms/forests
```

Example GitHub environment setup:

```bash
gh variable set KEYCLOAK_ISSUER_URI --env dev --body "https://dev.loginproxy.gov.bc.ca/auth/realms/forests"
gh variable set KEYCLOAK_ISSUER_URI --env test --body "https://test.loginproxy.gov.bc.ca/auth/realms/forests"
gh variable set KEYCLOAK_ISSUER_URI --env prod --body "https://loginproxy.gov.bc.ca/auth/realms/forests"

gh secret set keycloak_sa_client_id --env dev --body "<scope-management-client-id>"
gh secret set keycloak_sa_client_secret --env dev --body "<scope-management-client-secret>"
gh secret set keycloak_sa_client_id --env test --body "<scope-management-client-id>"
gh secret set keycloak_sa_client_secret --env test --body "<scope-management-client-secret>"
gh secret set keycloak_sa_client_id --env prod --body "<scope-management-client-id>"
gh secret set keycloak_sa_client_secret --env prod --body "<scope-management-client-secret>"
```

Only the scope-management client credentials belong in GitHub Actions. Do not store the NEXCOL
runtime client id/secret in this repository unless LEXIS itself needs to call NEXCOL, which this
flow does not require.

## Direct Keycloak Client Setup

This section applies when NEXCOL calls LEXIS with a direct `forests` Keycloak token. For the API
Services Portal path, create credentials through the gateway product/application flow in `gateway/`
instead.

Create the NEXCOL confidential client once in Keycloak, not on every LEXIS deploy.

Recommended client shape:

```text
Client authentication: on
Service accounts: on
Authorization code / standard flow: off
Direct access grants: off
Grant type used by NEXCOL: client_credentials
Assigned client scope: lexis:federal-submission:submit
```

Prefer assigning `lexis:federal-submission:submit` as a default client scope for the NEXCOL client so
the token always carries it. If it is configured as an optional client scope, NEXCOL must request it
explicitly in the token request.

## Direct Token Request

Token endpoint:

```text
${KEYCLOAK_ISSUER_URI}/protocol/openid-connect/token
```

Default-scope client:

```bash
curl -sS -X POST "${KEYCLOAK_ISSUER_URI}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d grant_type=client_credentials \
  -d client_id="${NEXCOL_CLIENT_ID}" \
  --data-urlencode "client_secret=${NEXCOL_CLIENT_SECRET}"
```

Optional-scope client:

```bash
curl -sS -X POST "${KEYCLOAK_ISSUER_URI}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d grant_type=client_credentials \
  -d client_id="${NEXCOL_CLIENT_ID}" \
  --data-urlencode "client_secret=${NEXCOL_CLIENT_SECRET}" \
  --data-urlencode "scope=lexis:federal-submission:submit"
```

The access token must contain:

```text
scope: lexis:federal-submission:submit
iss: ${KEYCLOAK_ISSUER_URI}
```

## LEXIS Endpoints

Validation:

```text
POST /api/lexis/federal/submissions/validation
```

Submission:

```text
POST /api/lexis/federal/submissions
```

Supported payload styles:

```text
Content-Type: application/xml
Content-Type: text/xml
Content-Type: application/soap+xml
Content-Type: text/plain
Content-Type: multipart/form-data with file or formFile
```

Useful optional metadata:

```text
query: userReference
query: originalFileName
header: X-Request-Id
header: Idempotency-Key
header: X-Source-System
```

Raw XML example:

```bash
curl -sS -X POST "${LEXIS_GATEWAY_BASE_URL}/api/lexis/federal/submissions/validation?originalFileName=federal.xml" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/xml" \
  --data-binary "@federal.xml"
```
