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

## Configuration

Gateway configuration is maintained per environment through API Services tooling. It defines:

- the environment-specific LEXIS upstream;
- validation and submission routes;
- the trusted Keycloak issuer;
- the `lexis:federal-submission:submit` OAuth scope; and
- an optional dedicated audience.

TEST and PROD use independent gateway and Keycloak client configurations. DEV uses ephemeral
application deployments and has no long-lived NEXCOL gateway.

The request, payload and response contract is documented in
[`docs/nexcol-keycloak-service-client.md`](../docs/nexcol-keycloak-service-client.md).

## Verification

Environment verification covers:

- missing token returns `401`;
- missing scope returns `403`;
- valid and invalid XML produce the expected validation results; and
- a controlled valid submission persists the expected federal records.
