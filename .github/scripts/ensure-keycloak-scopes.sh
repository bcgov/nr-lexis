#!/usr/bin/env bash
#
# Ensure the OAuth2 client scopes LEXIS enforces and, when configured, the
# dedicated NEXCOL calling client exist in the target Keycloak realm.
# Idempotent: existing scopes and clients are left intact.
#
# Authenticates with a confidential service-account client in the same realm;
# that client needs the realm-management `manage-clients` role.
#
# Required environment:
#   KEYCLOAK_ISSUER_URI   e.g. https://dev.loginproxy.gov.bc.ca/auth/realms/my-realm
#   KC_SA_CLIENT_ID       service-account client id used to manage clients/scopes
#   KC_SA_CLIENT_SECRET   service-account client secret
# Optional environment:
#   NEXCOL_KEYCLOAK_CLIENT_ID  dedicated confidential calling client to create/check
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
clients_url="${base}/admin/realms/${realm}/clients"
nexcol_client_id="${NEXCOL_KEYCLOAK_CLIENT_ID:-}"

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

if [ -z "${nexcol_client_id}" ]; then
  echo "NEXCOL client provisioning skipped: NEXCOL_KEYCLOAK_CLIENT_ID is not configured."
  exit 0
fi

encoded_client_id="$(jq -nr --arg value "${nexcol_client_id}" '$value | @uri')"
client_matches="$(curl -sS -H "Authorization: Bearer ${token}" \
  "${clients_url}?clientId=${encoded_client_id}")"
client_count="$(jq --arg client_id "${nexcol_client_id}" \
  '[.[] | select(.clientId == $client_id)] | length' <<< "${client_matches}")"

if [ "${client_count}" -gt 1 ]; then
  echo "::error::More than one Keycloak client matched '${nexcol_client_id}'."
  exit 1
fi

if [ "${client_count}" -eq 0 ]; then
  echo "creating client: ${nexcol_client_id}"
  client_body="$(jq -n --arg client_id "${nexcol_client_id}" '{
    clientId: $client_id,
    name: $client_id,
    description: "Managed by nr-lexis CI for NEXCOL machine-to-machine submissions",
    enabled: true,
    protocol: "openid-connect",
    publicClient: false,
    bearerOnly: false,
    clientAuthenticatorType: "client-secret",
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
    directAccessGrantsEnabled: false,
    implicitFlowEnabled: false,
    consentRequired: false
  }')"

  code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${clients_url}" \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -d "${client_body}")"

  if [ "${code}" != "201" ]; then
    echo "::error::Failed to create Keycloak client '${nexcol_client_id}' (HTTP ${code})."
    exit 1
  fi

  client_matches="$(curl -sS -H "Authorization: Bearer ${token}" \
    "${clients_url}?clientId=${encoded_client_id}")"
else
  echo "exists client: ${nexcol_client_id}"
fi

client_uuid="$(jq -r --arg client_id "${nexcol_client_id}" \
  '[.[] | select(.clientId == $client_id)] | if length == 1 then .[0].id else empty end' \
  <<< "${client_matches}")"

if [ -z "${client_uuid}" ]; then
  echo "::error::Could not resolve Keycloak client '${nexcol_client_id}' after provisioning."
  exit 1
fi

client="$(curl -sS -H "Authorization: Bearer ${token}" \
  "${clients_url}/${client_uuid}")"

client_is_valid="$(jq -r '
  .enabled == true
    and .publicClient == false
    and .bearerOnly == false
    and .serviceAccountsEnabled == true
    and .standardFlowEnabled == false
    and .directAccessGrantsEnabled == false
    and .implicitFlowEnabled == false
' <<< "${client}")"

if [ "${client_is_valid}" != "true" ]; then
  echo "::error::Keycloak client '${nexcol_client_id}' exists but is not configured as the required service-account-only confidential client."
  exit 1
fi

scope_json="$(curl -sS -H "Authorization: Bearer ${token}" "${scopes_url}")"
submission_scope="${SCOPES[0]}"
scope_uuid="$(jq -r --arg scope "${submission_scope}" \
  '.[] | select(.name == $scope) | .id' <<< "${scope_json}")"

if [ -z "${scope_uuid}" ]; then
  echo "::error::Could not resolve client scope '${submission_scope}'."
  exit 1
fi

default_scopes_url="${clients_url}/${client_uuid}/default-client-scopes"
default_scopes="$(curl -sS -H "Authorization: Bearer ${token}" "${default_scopes_url}")"

if jq -e --arg scope "${submission_scope}" \
  'any(.[]; .name == $scope)' <<< "${default_scopes}" >/dev/null; then
  echo "exists client scope assignment: ${nexcol_client_id} -> ${submission_scope}"
else
  echo "assigning client scope: ${nexcol_client_id} -> ${submission_scope}"
  code="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
    "${default_scopes_url}/${scope_uuid}" \
    -H "Authorization: Bearer ${token}")"

  if [ "${code}" != "204" ]; then
    echo "::error::Failed to assign '${submission_scope}' to '${nexcol_client_id}' (HTTP ${code})."
    exit 1
  fi
fi

echo "NEXCOL client ready: ${nexcol_client_id}. Client secret was not read or printed."
