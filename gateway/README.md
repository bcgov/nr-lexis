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

Generate the official protected template for reference:

```bash
gwa generate-config \
  --template client-credentials-shared-idp \
  --service nr-lexis-nexcol \
  --upstream https://nr-lexis-api-test.apps.gold.devops.gov.bc.ca
```

Then adapt `nr-lexis-nexcol.gateway.template.yaml` by replacing:

```text
__GATEWAY_ID__ Gateway ID from `gwa gateway create`, for example gw-abc12.
```

## Environment Values

Typical API Services Portal and LEXIS host values:

| APS env | Gateway host | LEXIS upstream host | APS issuer | Expected audience |
| --- | --- | --- | --- | --- |
| dev | `nr-lexis-nexcol.dev.api.gov.bc.ca` | `nr-lexis-api-<slot>.apps.gold.devops.gov.bc.ca` | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-<gateway-id>-default-dev` |
| test | `nr-lexis-nexcol.test.api.gov.bc.ca` | `nr-lexis-api-test.apps.gold.devops.gov.bc.ca` | `https://test.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-<gateway-id>-default-test` |
| prod | `nr-lexis-nexcol.api.gov.bc.ca` | `nr-lexis-api-prod.apps.gold.devops.gov.bc.ca` | `https://loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-<gateway-id>-default-prod` |

Template placeholders:

```text
__LEXIS_DEV_BACKEND_ROUTE_HOST__   LEXIS host only, no scheme.
__LEXIS_TEST_BACKEND_ROUTE_HOST__  LEXIS host only, no scheme.
__LEXIS_PROD_BACKEND_ROUTE_HOST__  LEXIS host only, no scheme.
__DEV_GATEWAY_HOST__               APS dev gateway host only.
__TEST_GATEWAY_HOST__              APS test gateway host only.
__PROD_GATEWAY_HOST__              APS prod gateway host only.
__DEV_APIGW_ISSUER_URI__           APS dev apigw issuer.
__TEST_APIGW_ISSUER_URI__          APS test apigw issuer.
__PROD_APIGW_ISSUER_URI__          APS prod apigw issuer.
__DEV_APIGW_ALLOWED_AUD__          Usually ap-<gateway-id>-default-dev.
__TEST_APIGW_ALLOWED_AUD__         Usually ap-<gateway-id>-default-test.
__PROD_APIGW_ALLOWED_AUD__         Usually ap-<gateway-id>-default-prod.
```

The template keeps all Product environments `active: false` by default, matching the official
`gwa` template. Set `active: true` for environments that should be published.

Apply:

```bash
gwa apply --input nr-lexis-nexcol.gateway.yaml
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

The gateway template grants and enforces the client role:

```text
lexis:federal-submission:submit
```

The backend maps Keycloak client roles to the same `SCOPE_...` authority used by
the existing federal submission authorization rule.
