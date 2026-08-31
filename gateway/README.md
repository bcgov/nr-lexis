# NEXCOL API Gateway

The gateway is the external entry point for NEXCOL federal prevalidation, validation, and submission
traffic.

```text
NEXCOL -> Keycloak token -> API gateway -> OpenShift Service -> LEXIS backend
```

## Responsibilities

- Keycloak owns the dedicated NEXCOL client and OAuth scope assignment.
- The gateway exposes only the three federal `POST` endpoints.
- The gateway validates issuer, expiry, required scope and audience when configured.
- Bearer tokens are accepted through the `Authorization` header, not URL query parameters.
- The gateway provides centralized routing, traffic controls, metrics and operational visibility.
- LEXIS validates the forwarded token and applies application-level authorization and business
  validation.

Consumer credentials are provisioned in Keycloak rather than through an API Services Portal
application.

## API contract

[`openapi.yaml`](openapi.yaml) is the machine-readable external contract for the three gateway
operations. It can be loaded into Swagger UI, Swagger Editor, Postman, or client-generation tools.
Select an available environment gateway from the OpenAPI `servers` list and authorize with a
NEXCOL runtime-client access token. The deployment provisioning client is not a calling credential.

The prevalidation operation accepts JSON, raw legacy `LogExportApplication` XML, Axis SOAP 1.1,
and SOAP 1.2. Its response follows the request format. Validation and submission retain their
existing XML-request and JSON-response contracts.

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
| PROD | `https://nr-lexis-nexcol.api.gov.bc.ca` | Gateway provisioned; application deployment pending |

The PROD hostname follows the API Services production vanity-URL convention and is listed so
consumers can prepare environment configuration before production provisioning is complete.

## Configuration

[`nr-lexis-nexcol-test.kong.yaml`](nr-lexis-nexcol-test.kong.yaml) and
[`nr-lexis-nexcol-prod.kong.yaml`](nr-lexis-nexcol-prod.kong.yaml) are the non-secret declarative
configurations for the TEST and PROD gateways. They define:

- the corresponding cluster-local `nr-lexis-backend-${ZONE}.da5fad-${ZONE}.svc:8080` upstream;
- prevalidation, validation, and submission routes;
- the trusted Keycloak issuer;
- the `lexis:federal-submission:submit` OAuth scope; and
- exact-origin Swagger CORS behavior.

The gateway data plane and LEXIS run on the Gold cluster but in different namespaces. The backend
NetworkPolicy admits the APS Gold gateway namespace (`name=b8840c`) only when its `environment`
label matches the LEXIS deployment zone. The backend template declares no public Route and does not
admit the OpenShift ingress router, so a Route left by an earlier `oc apply` cannot reach the pods.
The public frontend Route remains available for interactive LEXIS traffic, but Caddy returns `404`
for the NEXCOL-only submission path and its child paths instead of proxying them.

DEV uses ephemeral application deployments and has no long-lived NEXCOL gateway. The PROD gateway
configuration is ready for the future application rollout, but the upstream cannot become healthy
until the PROD backend Service is deployed.

The integration flow and XML contract are documented in
[`docs/nexcol-keycloak-service-client.md`](../docs/nexcol-keycloak-service-client.md).

## Verification

Environment verification covers:

- missing token returns `401`;
- missing scope returns `403`;
- lower-camel JSON, .NET PascalCase JSON, raw XML, and Axis SOAP prevalidation return the same
  legacy field decisions;
- valid and invalid XML produce the expected validation results; and
- a controlled valid submission persists the expected federal records.

The reusable non-mutating TEST procedure is available in
[`smoke-test/README.md`](smoke-test/README.md). It accepts runtime credentials and a live-valid XML
fixture through ignored local configuration; no credentials or environment reference data are
stored in the repository.
