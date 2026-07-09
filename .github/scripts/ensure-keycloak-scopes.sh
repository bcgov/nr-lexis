#!/usr/bin/env bash
#
# Ensure the OAuth2 client scopes LEXIS enforces for machine-to-machine clients
# exist in the target Keycloak realm. Idempotent: existing scopes are left
# untouched.
#
# Authenticates with a confidential service-account client in the same realm;
# that client needs the realm-management `manage-clients` role.
#
# Required environment:
#   KEYCLOAK_ISSUER_URI   e.g. https://dev.loginproxy.gov.bc.ca/auth/realms/my-realm
#   KC_SA_CLIENT_ID       service-account client id used to manage client scopes
#   KC_SA_CLIENT_SECRET   service-account client secret
set -euo pipefail

: "${KEYCLOAK_ISSUER_URI:?KEYCLOAK_ISSUER_URI is required}"
: "${KC_SA_CLIENT_ID:?KC_SA_CLIENT_ID is required}"
: "${KC_SA_CLIENT_SECRET:?KC_SA_CLIENT_SECRET is required}"

SCOPES=(
  "lexis:federal-submission:submit"
)

issuer="${KEYCLOAK_ISSUER_URI%/}"
realm="${issuer##*/realms/}"
base="${issuer%/realms/*}"
token_url="${issuer}/protocol/openid-connect/token"
scopes_url="${base}/admin/realms/${realm}/client-scopes"

echo "Keycloak realm: ${realm}"
echo "Client-scopes endpoint: ${scopes_url}"

token="$(curl -sS -X POST "${token_url}" \
  -d grant_type=client_credentials \
  -d client_id="${KC_SA_CLIENT_ID}" \
  --data-urlencode "client_secret=${KC_SA_CLIENT_SECRET}" \
  | jq -r '.access_token // empty')"

if [ -z "${token}" ]; then
  echo "::error::Could not obtain a Keycloak admin token. Check the service-account client id/secret and that it has the realm-management 'manage-clients' role."
  exit 1
fi

existing="$(curl -sS -H "Authorization: Bearer ${token}" "${scopes_url}" | jq -r '.[].name')"

created=0
for scope in "${SCOPES[@]}"; do
  if grep -qxF "${scope}" <<< "${existing}"; then
    echo "exists: ${scope}"
    continue
  fi

  echo "creating: ${scope}"
  body="$(jq -n --arg name "${scope}" '{
    name: $name,
    protocol: "openid-connect",
    description: "Managed by nr-lexis CI",
    attributes: {
      "include.in.token.scope": "true",
      "display.on.consent.screen": "false"
    }
  }')"

  code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${scopes_url}" \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -d "${body}")"

  if [ "${code}" != "201" ]; then
    echo "::error::Failed to create client scope '${scope}' (HTTP ${code})."
    exit 1
  fi
  created=$((created + 1))
done

echo "Done. ${created} scope(s) created, $(( ${#SCOPES[@]} - created )) already present."
