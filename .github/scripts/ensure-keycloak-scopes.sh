#!/usr/bin/env bash
# Provision the dedicated NEXCOL client and keep its submission scope exclusive.
set -euo pipefail

: "${KEYCLOAK_ISSUER_URI:?KEYCLOAK_ISSUER_URI is required}"
: "${KC_SA_CLIENT_ID:?KC_SA_CLIENT_ID is required}"
: "${KC_SA_CLIENT_SECRET:?KC_SA_CLIENT_SECRET is required}"
: "${NEXCOL_KEYCLOAK_CLIENT_ID:?NEXCOL_KEYCLOAK_CLIENT_ID is required}"

submission_scope="lexis:federal-submission:submit"
issuer="${KEYCLOAK_ISSUER_URI%/}"
if [[ "${issuer}" != */realms/* ]]; then
  echo "::error::KEYCLOAK_ISSUER_URI must identify a Keycloak realm."
  exit 1
fi

realm="${issuer##*/realms/}"
base="${issuer%/realms/*}"
realm_url="${base}/admin/realms/${realm}"
token_url="${issuer}/protocol/openid-connect/token"
scopes_url="${realm_url}/client-scopes"
clients_url="${realm_url}/clients"
nexcol_client_id="${NEXCOL_KEYCLOAK_CLIENT_ID}"
if [[ "${nexcol_client_id}" == "${KC_SA_CLIENT_ID}" ]]; then
  echo "::error::The NEXCOL client must be separate from the provisioning service account."
  exit 1
fi

request_json() {
  curl --silent --show-error --fail-with-body \
    --connect-timeout 10 --max-time 60 \
    -H "Authorization: Bearer ${token}" "$1"
}

request_status() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local args=(
    --silent --show-error --connect-timeout 10 --max-time 60
    -o /dev/null -w '%{http_code}' -X "${method}"
    -H "Authorization: Bearer ${token}"
  )
  if [[ -n "${body}" ]]; then
    args+=(-H 'Content-Type: application/json' -d "${body}")
  fi
  curl "${args[@]}" "${url}"
}

require_status() {
  local expected="$1"
  local actual="$2"
  local operation="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "::error::${operation} failed (HTTP ${actual})."
    exit 1
  fi
}

contains_submission_scope() {
  jq -e --arg id "${scope_uuid}" --arg name "${submission_scope}" \
    'any(.[]; .id == $id or .name == $name)' >/dev/null <<< "$1"
}

remove_approved_optional_assignment() {
  local collection_url="$1"
  local owner="$2"
  local assignments
  assignments="$(request_json "${collection_url}")"
  if contains_submission_scope "${assignments}"; then
    local code
    code="$(request_status DELETE "${collection_url}/${scope_uuid}")"
    require_status 204 "${code}" "Removing ${submission_scope} from ${owner}"
    echo "migrated approved optional scope assignment: ${owner}"
  fi

  assignments="$(request_json "${collection_url}")"
  if contains_submission_scope "${assignments}"; then
    echo "::error::Client scope '${submission_scope}' remains assigned to ${owner}."
    exit 1
  fi
}

require_scope_absent() {
  local collection_url="$1"
  local owner="$2"
  local assignments
  assignments="$(request_json "${collection_url}")"
  if contains_submission_scope "${assignments}"; then
    echo "::error::Client scope '${submission_scope}' is assigned to ${owner}; remove that unrelated assignment before deploying LEXIS."
    exit 1
  fi
}

fetch_all_clients() {
  local first=0
  local page_size=100
  local clients='[]'
  while true; do
    local page count
    page="$(request_json "${clients_url}?first=${first}&max=${page_size}")"
    count="$(jq 'length' <<< "${page}")"
    clients="$(jq -cn --argjson clients "${clients}" --argjson page "${page}" '$clients + $page')"
    if (( count < page_size )); then
      break
    fi
    first=$((first + count))
  done
  printf '%s' "${clients}"
}

echo "Keycloak realm: ${realm}"

token="$(curl --silent --show-error --fail-with-body \
  --connect-timeout 10 --max-time 60 -X POST "${token_url}" \
  -d grant_type=client_credentials \
  -d client_id="${KC_SA_CLIENT_ID}" \
  --data-urlencode "client_secret=${KC_SA_CLIENT_SECRET}" \
  | jq -r '.access_token // empty')"

if [[ -z "${token}" ]]; then
  echo "::error::Could not obtain a Keycloak administration token."
  exit 1
fi

scope_catalog="$(request_json "${scopes_url}")"
scope_count="$(jq --arg scope "${submission_scope}" \
  '[.[] | select(.name == $scope)] | length' <<< "${scope_catalog}")"

if [[ "${scope_count}" == "0" ]]; then
  scope_body="$(jq -n --arg name "${submission_scope}" '{
    name: $name,
    protocol: "openid-connect",
    description: "Managed by nr-lexis CI",
    attributes: {
      "include.in.token.scope": "true",
      "display.on.consent.screen": "false"
    }
  }')"
  code="$(request_status POST "${scopes_url}" "${scope_body}")"
  require_status 201 "${code}" "Creating client scope '${submission_scope}'"
  scope_catalog="$(request_json "${scopes_url}")"
  scope_count="$(jq --arg scope "${submission_scope}" \
    '[.[] | select(.name == $scope)] | length' <<< "${scope_catalog}")"
fi

if [[ "${scope_count}" != "1" ]]; then
  echo "::error::Expected exactly one Keycloak client scope named '${submission_scope}'; found ${scope_count}."
  exit 1
fi

scope_is_valid="$(jq -r --arg scope "${submission_scope}" '
  [.[] | select(.name == $scope)][0]
  | .protocol == "openid-connect"
    and .attributes["include.in.token.scope"] == "true"
    and .attributes["display.on.consent.screen"] == "false"
' <<< "${scope_catalog}")"
if [[ "${scope_is_valid}" != "true" ]]; then
  echo "::error::Client scope '${submission_scope}' has an unexpected protocol or token attributes."
  exit 1
fi
scope_uuid="$(jq -r --arg scope "${submission_scope}" \
  '[.[] | select(.name == $scope)][0].id' <<< "${scope_catalog}")"

encoded_client_id="$(jq -nr --arg value "${nexcol_client_id}" '$value | @uri')"
client_matches="$(request_json "${clients_url}?clientId=${encoded_client_id}")"
client_count="$(jq --arg client_id "${nexcol_client_id}" \
  '[.[] | select(.clientId == $client_id)] | length' <<< "${client_matches}")"

if [[ "${client_count}" == "0" ]]; then
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
  code="$(request_status POST "${clients_url}" "${client_body}")"
  require_status 201 "${code}" "Creating NEXCOL client '${nexcol_client_id}'"
  client_matches="$(request_json "${clients_url}?clientId=${encoded_client_id}")"
  client_count="$(jq --arg client_id "${nexcol_client_id}" \
    '[.[] | select(.clientId == $client_id)] | length' <<< "${client_matches}")"
fi

if [[ "${client_count}" != "1" ]]; then
  echo "::error::Expected exactly one Keycloak client named '${nexcol_client_id}'; found ${client_count}."
  exit 1
fi

client_uuid="$(jq -r --arg client_id "${nexcol_client_id}" \
  '[.[] | select(.clientId == $client_id)][0].id' <<< "${client_matches}")"
client="$(request_json "${clients_url}/${client_uuid}")"
client_is_valid="$(jq -r '
  .enabled == true
    and .protocol == "openid-connect"
    and .publicClient == false
    and .bearerOnly == false
    and .clientAuthenticatorType == "client-secret"
    and .serviceAccountsEnabled == true
    and .standardFlowEnabled == false
    and .directAccessGrantsEnabled == false
    and .implicitFlowEnabled == false
' <<< "${client}")"
if [[ "${client_is_valid}" != "true" ]]; then
  echo "::error::Keycloak client '${nexcol_client_id}' is not service-account-only and confidential."
  exit 1
fi

# The federal-submission scope is exclusive to the approved NEXCOL client.
require_scope_absent "${realm_url}/default-default-client-scopes" "the realm default scopes"
require_scope_absent "${realm_url}/default-optional-client-scopes" "the realm optional scopes"

all_clients="$(fetch_all_clients)"
while IFS= read -r candidate; do
  candidate_uuid="$(jq -r '.id' <<< "${candidate}")"
  candidate_id="$(jq -r '.clientId' <<< "${candidate}")"
  if [[ "${candidate_uuid}" == "${client_uuid}" ]]; then
    continue
  fi
  require_scope_absent \
    "${clients_url}/${candidate_uuid}/default-client-scopes" "client '${candidate_id}' default scopes"
  require_scope_absent \
    "${clients_url}/${candidate_uuid}/optional-client-scopes" "client '${candidate_id}' optional scopes"
done < <(jq -c '.[] | {id, clientId}' <<< "${all_clients}")

approved_optional_url="${clients_url}/${client_uuid}/optional-client-scopes"
remove_approved_optional_assignment \
  "${approved_optional_url}" "client '${nexcol_client_id}' optional scopes"

approved_default_url="${clients_url}/${client_uuid}/default-client-scopes"
approved_defaults="$(request_json "${approved_default_url}")"
if ! contains_submission_scope "${approved_defaults}"; then
  code="$(request_status PUT "${approved_default_url}/${scope_uuid}")"
  require_status 204 "${code}" "Assigning '${submission_scope}' to '${nexcol_client_id}'"
fi

approved_defaults="$(request_json "${approved_default_url}")"
approved_count="$(jq --arg id "${scope_uuid}" --arg name "${submission_scope}" \
  '[.[] | select(.id == $id or .name == $name)] | length' <<< "${approved_defaults}")"
if [[ "${approved_count}" != "1" ]]; then
  echo "::error::The approved NEXCOL client does not have exactly one default '${submission_scope}' assignment."
  exit 1
fi

echo "NEXCOL client and exclusive submission scope are ready. Client secrets were not read or printed."
