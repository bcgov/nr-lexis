# API Services Portal gateway

This folder captures the API Services Portal gateway setup for the NEXCOL to LEXIS
machine-to-machine path.

Target flow:

```text
NEXCOL
  -> API Services Portal gateway client_credentials token
  -> gateway host
  -> LEXIS backend API route
  -> POST /api/lexis/federal/submissions/validation
  -> POST /api/lexis/federal/submissions
```

## Repo-side route

The backend deploy publishes a direct API route for gateway upstream traffic:

```text
https://nr-lexis-api-<slot>.apps.gold.devops.gov.bc.ca
```

The `<slot>` value is the deployment slot used by the target LEXIS environment, such as a PR preview
slot, `test`, or `prod`.

## Gateway setup

Install and configure `gwa`, then create one gateway for the NEXCOL integration:

```bash
gwa config set host api.gov.bc.ca
gwa login
gwa gateway create
gwa config set gateway <gateway-id>
```

Generate the official protected template:

```bash
gwa generate-config \
  --template client-credentials-shared-idp \
  --service nr-lexis-nexcol \
  --upstream https://nr-lexis-api-test.apps.gold.devops.gov.bc.ca
```

Use the generated file as the source of truth. Do not commit the filled gateway config unless the
team decides the gateway ID, hosts, audiences, and product publication settings are stable
repo-owned infrastructure.

## Environment Values

Typical API Services Portal and LEXIS host values:

| APS env | Gateway host | LEXIS upstream host | APS issuer | Expected audience |
| --- | --- | --- | --- | --- |
| dev | `nr-lexis-nexcol.dev.api.gov.bc.ca` | `nr-lexis-api-<slot>.apps.gold.devops.gov.bc.ca` | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-<gateway-id>-default-dev` |
| test | `nr-lexis-nexcol.test.api.gov.bc.ca` | `nr-lexis-api-test.apps.gold.devops.gov.bc.ca` | `https://test.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-<gateway-id>-default-test` |
| prod | `nr-lexis-nexcol.api.gov.bc.ca` | `nr-lexis-api-prod.apps.gold.devops.gov.bc.ca` | `https://loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-<gateway-id>-default-prod` |

Apply:

```bash
gwa apply --input <generated-gateway-config>.yaml
gwa status --hosts
```

## Auth alignment

The official `client-credentials-shared-idp` template uses the API Services shared
`apigw` Keycloak realm. LEXIS still accepts the existing `forests` Keycloak issuer
for direct testing, but API Services gateway traffic needs the backend to also trust
the `apigw` issuer.

Set this GitHub environment variable for each LEXIS environment to the API Services Portal issuer
that will call that environment:

```bash
gh variable set KEYCLOAK_ADDITIONAL_ISSUER_URIS \
  --env dev \
  --body "https://dev.loginproxy.gov.bc.ca/auth/realms/apigw"

gh variable set KEYCLOAK_ADDITIONAL_ISSUER_URIS \
  --env test \
  --body "https://test.loginproxy.gov.bc.ca/auth/realms/apigw"

gh variable set KEYCLOAK_ADDITIONAL_ISSUER_URIS \
  --env prod \
  --body "https://loginproxy.gov.bc.ca/auth/realms/apigw"
```

If a gateway environment points at a different LEXIS environment, the upstream LEXIS environment
must trust the issuer from the calling gateway environment. Otherwise keep issuer trust aligned
one-to-one by environment.

The gateway config should grant and enforce the client role:

```text
lexis:federal-submission:submit
```

The backend maps Keycloak client roles to the same `SCOPE_...` authority used by
the existing federal submission authorization rule.
