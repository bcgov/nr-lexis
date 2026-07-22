# NEXCOL API Gateway

The gateway is the external entry point for NEXCOL federal validation and submission traffic.

```text
NEXCOL -> Keycloak token -> API gateway -> LEXIS backend
```

## Responsibilities

- Keycloak owns the dedicated NEXCOL client and OAuth scope assignment.
- The gateway exposes only the two federal `POST` endpoints.
- The gateway validates issuer, expiry, required scope and audience when configured.
- The gateway provides centralized routing, traffic controls, metrics and operational visibility.
- LEXIS validates the forwarded token and applies application-level authorization and business
  validation.

Consumer credentials are provisioned in Keycloak rather than through an API Services Portal
application.

## API contract

[`openapi.yaml`](openapi.yaml) is the machine-readable external contract for the two gateway
operations. It can be loaded into Swagger UI, Swagger Editor, Postman, or client-generation tools.
Select an available environment gateway from the OpenAPI `servers` list and authorize with a
NEXCOL runtime-client access token. The deployment provisioning client is not a calling credential.

It can be rendered in the
[BC Government OpenAPI console](https://openapi.apps.gov.bc.ca?url=https://raw.githubusercontent.com/bcgov/nr-lexis/main/gateway/openapi.yaml).

The specification is maintained separately from generated backend documentation because the LEXIS
backend contains additional UI and administrative endpoints that are not part of the NEXCOL API.

The application deployment does not host Swagger UI or `/v3/api-docs`. The contract is available
locally as soon as the file is checked out, from GitHub after the branch is pushed, and through the
linked OpenAPI console after it is merged to `main`. Publishing the product and documentation to
the API Directory is a separate API Services Portal action.

### Environment endpoints

| Environment | Gateway base URL | Status |
|---|---|---|
| TEST | `https://nr-lexis-nexcol-test-api-gov-bc-ca.test.api.gov.bc.ca` | Available |
| PROD | `https://nr-lexis-nexcol.api.gov.bc.ca` | Projected; available after production provisioning |

The PROD hostname follows the API Services production vanity-URL convention and is listed so
consumers can prepare environment configuration before production provisioning is complete.

## Configuration

Gateway configuration is maintained per environment through API Services tooling. It defines:

- the environment-specific LEXIS upstream;
- validation and submission routes;
- the trusted Keycloak issuer;
- the `lexis:federal-submission:submit` OAuth scope; and
- an optional dedicated audience.

TEST and PROD use independent gateway and Keycloak client configurations. DEV uses ephemeral
application deployments and has no long-lived NEXCOL gateway.

The integration flow and XML contract are documented in
[`docs/nexcol-keycloak-service-client.md`](../docs/nexcol-keycloak-service-client.md).

## Verification

Environment verification covers:

- missing token returns `401`;
- missing scope returns `403`;
- valid and invalid XML produce the expected validation results; and
- a controlled valid submission persists the expected federal records.

The reusable non-mutating TEST procedure is available in
[`smoke-test/README.md`](smoke-test/README.md). It accepts runtime credentials and a live-valid XML
fixture through ignored local configuration; no credentials or environment reference data are
stored in the repository.
