# Gateway integration

This folder describes the NEXCOL-to-LEXIS machine-to-machine integration pattern. It is
intentionally implementation-neutral because this is a public repository.

## Flow

```text
NEXCOL
  -> client-credentials access token
  -> API gateway
  -> LEXIS federal validation or submission API
  -> existing LEXIS federal application tables
```

Federal users do not use the LEXIS interactive login flow for these requests.

## Design

- One gateway service exposes the two approved federal operations.
- Gateway routes accept only `POST` and require the approved federal-submission authorization.
- LEXIS validates the signed gateway token and maps its authorization to the existing federal
  submission rule.
- The gateway forwards to an environment-specific LEXIS backend route.

## Operational setup

Use the API Services Portal operator documentation and the official client-credentials template
to create and configure the gateway. Keep the filled configuration in an approved private
location; it is not a repository artifact.

For the current rollout:

- Maintain a TEST gateway against the stable TEST LEXIS deployment.
- Do not maintain a long-lived DEV gateway: DEV uses changing PR-preview deployments.
- Create a separate PROD gateway only after the production LEXIS deployment is stable and the
  required operational approvals are complete.
- Keep the consumer product inactive until the external client has been provisioned and smoke
  testing is authorized.

## Backend trust

Configure Keycloak issuer trust through the deployment environment for each LEXIS target. The
gateway issuer, audience, and backend trust must be aligned for the same target environment.
Deployment values belong in the approved configuration and secret-management systems, not here.

## Verification

Before enabling a consumer, verify all of the following through the gateway:

- A valid token with the required authorization can validate valid and invalid XML.
- A valid submission writes the expected federal records.
- No token is rejected with `401`.
- A token without the required authorization is rejected with `403`.

## Public-repository boundary

Do not commit generated gateway files, gateway identifiers, public hosts, upstream URLs, issuer
URLs, audiences, product identifiers, client identifiers, client credentials, tokens, or portal
exports. Record those values only in the approved private runbook and deployment systems.
