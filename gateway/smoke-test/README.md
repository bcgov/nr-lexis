# TEST gateway smoke test

This non-mutating smoke test verifies the published OpenAPI contract, Keycloak runtime-client
authentication, gateway authorization, and federal XML validation behavior.

It uses only the dedicated NEXCOL runtime client. The deployment provisioning client is not a
calling credential and is outside the scope of this test.

## Prerequisites

- `bash`
- `curl`
- `jq`
- `uuidgen`
- the TEST NEXCOL runtime-client secret from the approved operational process

## Configuration

Copy the example configuration and protect the local file:

```bash
cp gateway/smoke-test/.env.test.example gateway/smoke-test/.env.test.local
chmod 600 gateway/smoke-test/.env.test.local
```

Set `CLIENT_SECRET` in `.env.test.local`. The file is ignored by Git. Alternatively, export the
variables in the current shell and do not create a file.

`VALID_XML_FILE` is optional. When supplied, it must point to an operator-owned TEST fixture whose
client/location, federal `B08` timber mark, and region exist in the target LEXIS database. The
tracked XML examples use synthetic reference values to document and unit-test the XML shape; they
are not guaranteed to pass validation against a deployed environment.

## Run

From the repository root:

```bash
./gateway/smoke-test/run-test-gateway.sh --docs-only
./gateway/smoke-test/run-test-gateway.sh
```

The smoke test verifies:

- the raw OpenAPI contract and its viewer are reachable;
- Swagger CORS preflights succeed for both federal operations;
- the runtime token is active and contains `lexis:federal-submission:submit`;
- gateway-generated `401` and optional `403` responses include the approved CORS origin;
- invalid XML returns `422` with CORS headers from both validation and submission operations; and
- when `VALID_XML_FILE` is supplied, valid XML returns `200` with status `validated`.

An optional wrong-scope check runs when both `WRONG_SCOPE_CLIENT_ID` and
`WRONG_SCOPE_CLIENT_SECRET` are supplied. It expects `403`.

The submission check deliberately sends invalid XML and expects rejection before persistence.
Controlled valid submission testing should follow the request contract in `gateway/openapi.yaml`
after validation passes.
