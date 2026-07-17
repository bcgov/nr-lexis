#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
TARGET="${ROOT_DIR}/.github/scripts/ensure-keycloak-scopes.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT
mkdir -p "${TEST_DIR}/bin"

cat > "${TEST_DIR}/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail

method=GET
output=""
write_format=""
url=""
while (( $# > 0 )); do
  case "$1" in
    -X)
      method="$2"
      shift 2
      ;;
    -o)
      output="$2"
      shift 2
      ;;
    -w)
      write_format="$2"
      shift 2
      ;;
    -H|-d|--data-urlencode|--connect-timeout|--max-time)
      shift 2
      ;;
    --silent|--show-error|--fail-with-body)
      shift
      ;;
    http*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

printf '%s\t%s\n' "${method}" "${url}" >> "${MOCK_STATE_DIR}/calls.log"
scope_object='{"id":"scope-1","name":"lexis:federal-submission:submit","protocol":"openid-connect","attributes":{"include.in.token.scope":"true","display.on.consent.screen":"false"}}'
scope="${scope_object}"
case "${MOCK_SCOPE_MODE:-valid}" in
  invalid)
    scope_object='{"id":"scope-1","name":"lexis:federal-submission:submit","protocol":"saml","attributes":{"include.in.token.scope":"true","display.on.consent.screen":"false"}}'
    scope="${scope_object}"
    ;;
  duplicate)
    scope="${scope_object},${scope_object}"
    ;;
esac

status=200
body='[]'
case "${method} ${url}" in
  "POST "*"/protocol/openid-connect/token")
    body='{"access_token":"admin-token"}'
    ;;
  "GET "*"/client-scopes")
    if [[ "${MOCK_PROVISION_MODE:-existing}" = "create" && ! -f "${MOCK_STATE_DIR}/scope-created" ]]; then
      body='[]'
    else
      body="[${scope}]"
    fi
    ;;
  "POST "*"/client-scopes")
    touch "${MOCK_STATE_DIR}/scope-created"
    status=201
    ;;
  "GET "*"/clients?clientId="*)
    if [[ "${MOCK_PROVISION_MODE:-existing}" = "create" && ! -f "${MOCK_STATE_DIR}/client-created" ]]; then
      body='[]'
    else
      body='[{"id":"approved-uuid","clientId":"lexis-nexcol-test"}]'
    fi
    ;;
  "POST "*"/clients")
    touch "${MOCK_STATE_DIR}/client-created"
    status=201
    ;;
  "GET "*"/clients/approved-uuid")
    body='{"id":"approved-uuid","clientId":"lexis-nexcol-test","enabled":true,"protocol":"openid-connect","publicClient":false,"bearerOnly":false,"clientAuthenticatorType":"client-secret","serviceAccountsEnabled":true,"standardFlowEnabled":false,"directAccessGrantsEnabled":false,"implicitFlowEnabled":false}'
    ;;
  "GET "*"/default-default-client-scopes")
    if [[ "${MOCK_ASSIGNMENT_MODE:-exclusive}" = "realm-default" ]]; then body="[${scope_object}]"; else body='[]'; fi
    ;;
  "GET "*"/default-optional-client-scopes")
    body='[]'
    ;;
  "GET "*"/clients?first=0&max=100")
    body='[{"id":"approved-uuid","clientId":"lexis-nexcol-test"},{"id":"rogue-uuid","clientId":"rogue-client"}]'
    ;;
  "GET "*"/clients/rogue-uuid/default-client-scopes")
    body='[]'
    ;;
  "GET "*"/clients/rogue-uuid/optional-client-scopes")
    if [[ "${MOCK_ASSIGNMENT_MODE:-exclusive}" = "rogue" ]]; then body="[${scope_object}]"; else body='[]'; fi
    ;;
  "GET "*"/clients/approved-uuid/optional-client-scopes")
    if [[ "${MOCK_PROVISION_MODE:-existing}" = "create" || -f "${MOCK_STATE_DIR}/approved-optional-removed" ]]; then body='[]'; else body="[${scope_object}]"; fi
    ;;
  "DELETE "*"/clients/approved-uuid/optional-client-scopes/scope-1")
    touch "${MOCK_STATE_DIR}/approved-optional-removed"
    status=204
    ;;
  "GET "*"/clients/approved-uuid/default-client-scopes")
    if [[ "${MOCK_PROVISION_MODE:-existing}" = "create" && ! -f "${MOCK_STATE_DIR}/default-assigned" ]]; then body='[]'; else body="[${scope_object}]"; fi
    ;;
  "PUT "*"/clients/approved-uuid/default-client-scopes/scope-1")
    touch "${MOCK_STATE_DIR}/default-assigned"
    status=204
    ;;
  *)
    echo "Unexpected mocked curl request: ${method} ${url}" >&2
    exit 90
    ;;
esac

if [[ "${output}" != "/dev/null" ]]; then
  printf '%s' "${body}"
fi
if [[ -n "${write_format}" ]]; then
  printf '%s' "${status}"
fi
MOCK_CURL
chmod 0755 "${TEST_DIR}/bin/curl"

run_script() {
  local state="$1"
  shift
  mkdir -p "${state}"
  env \
    PATH="${TEST_DIR}/bin:${PATH}" \
    MOCK_STATE_DIR="${state}" \
    KEYCLOAK_ISSUER_URI="https://keycloak.example.test/auth/realms/forests" \
    KC_SA_CLIENT_ID="provisioner" \
    KC_SA_CLIENT_SECRET="not-a-real-secret" \
    NEXCOL_KEYCLOAK_CLIENT_ID="lexis-nexcol-test" \
    "$@" \
    bash "${TARGET}"
}

valid_output="$(run_script "${TEST_DIR}/valid")"
grep -Fq "exclusive submission scope are ready" <<< "${valid_output}"
grep -Fq $'DELETE\thttps://keycloak.example.test/auth/admin/realms/forests/clients/approved-uuid/optional-client-scopes/scope-1' \
  "${TEST_DIR}/valid/calls.log"
if grep -Eq $'DELETE\t.*(default-default-client-scopes|clients/rogue-uuid)' \
  "${TEST_DIR}/valid/calls.log"; then
  echo "Provisioning must not mutate realm defaults or unrelated clients." >&2
  exit 1
fi

create_output="$(run_script "${TEST_DIR}/create" MOCK_PROVISION_MODE=create)"
grep -Fq "exclusive submission scope are ready" <<< "${create_output}"
grep -Fq $'POST\thttps://keycloak.example.test/auth/admin/realms/forests/client-scopes' \
  "${TEST_DIR}/create/calls.log"
grep -Fq $'POST\thttps://keycloak.example.test/auth/admin/realms/forests/clients' \
  "${TEST_DIR}/create/calls.log"
grep -Fq $'PUT\thttps://keycloak.example.test/auth/admin/realms/forests/clients/approved-uuid/default-client-scopes/scope-1' \
  "${TEST_DIR}/create/calls.log"

if run_script "${TEST_DIR}/unrelated" MOCK_ASSIGNMENT_MODE=realm-default >"${TEST_DIR}/unrelated.out" 2>&1; then
  echo "Expected an unrelated realm-default assignment to fail." >&2
  exit 1
fi
grep -Fq "remove that unrelated assignment before deploying LEXIS" "${TEST_DIR}/unrelated.out"
if grep -q $'^DELETE\t' "${TEST_DIR}/unrelated/calls.log"; then
  echo "Provisioning must report unrelated assignments without deleting them." >&2
  exit 1
fi

if run_script "${TEST_DIR}/rogue" MOCK_ASSIGNMENT_MODE=rogue >"${TEST_DIR}/rogue.out" 2>&1; then
  echo "Expected an unrelated client assignment to fail." >&2
  exit 1
fi
grep -Fq "client 'rogue-client' optional scopes" "${TEST_DIR}/rogue.out"
if grep -q $'^DELETE\t' "${TEST_DIR}/rogue/calls.log"; then
  echo "Provisioning must not delete an unrelated client assignment." >&2
  exit 1
fi

if run_script "${TEST_DIR}/invalid" MOCK_SCOPE_MODE=invalid >"${TEST_DIR}/invalid.out" 2>&1; then
  echo "Expected invalid existing scope configuration to fail." >&2
  exit 1
fi
grep -Fq "unexpected protocol or token attributes" "${TEST_DIR}/invalid.out"

if run_script "${TEST_DIR}/duplicate" MOCK_SCOPE_MODE=duplicate >"${TEST_DIR}/duplicate.out" 2>&1; then
  echo "Expected duplicate scope names to fail." >&2
  exit 1
fi
grep -Fq "Expected exactly one Keycloak client scope" "${TEST_DIR}/duplicate.out"

if env \
  KEYCLOAK_ISSUER_URI="https://keycloak.example.test/auth/realms/forests" \
  KC_SA_CLIENT_ID="provisioner" \
  KC_SA_CLIENT_SECRET="not-a-real-secret" \
  bash "${TARGET}" >"${TEST_DIR}/missing.out" 2>&1; then
  echo "Expected a missing NEXCOL client id to fail." >&2
  exit 1
fi
grep -Fq "NEXCOL_KEYCLOAK_CLIENT_ID is required" "${TEST_DIR}/missing.out"

if run_script \
  "${TEST_DIR}/same-client" \
  NEXCOL_KEYCLOAK_CLIENT_ID=provisioner >"${TEST_DIR}/same-client.out" 2>&1; then
  echo "Expected the provisioner and NEXCOL client to be distinct." >&2
  exit 1
fi
grep -Fq "must be separate from the provisioning service account" \
  "${TEST_DIR}/same-client.out"

echo "Keycloak provisioning script checks passed."
