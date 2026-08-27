#!/usr/bin/env bash
set -euo pipefail
set +x

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${NEXCOL_ENV_FILE:-${SCRIPT_DIR}/.env.test.local}"
INVALID_XML_FILE="${SCRIPT_DIR}/invalid-federal-submission.xml"
REQUIRED_SCOPE="lexis:federal-submission:submit"
PREVALIDATION_PATH="/api/lexis/federal/submissions/prevalidation"
VALIDATION_PATH="/api/lexis/federal/submissions/validation"
SUBMISSION_PATH="/api/lexis/federal/submissions"
MODE="${1:-smoke}"

case "${MODE}" in
  smoke | --docs-only) ;;
  -h | --help)
    echo "Usage: $0 [--docs-only]"
    exit 0
    ;;
  *)
    echo "Usage: $0 [--docs-only]" >&2
    exit 1
    ;;
esac

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

TOKEN_URL="${TOKEN_URL:-https://test.loginproxy.gov.bc.ca/auth/realms/forests/protocol/openid-connect/token}"
CLIENT_ID="${CLIENT_ID:-lexis-nexcol-test}"
LEXIS_GATEWAY_BASE_URL="${LEXIS_GATEWAY_BASE_URL:-https://nr-lexis-nexcol-test-api-gov-bc-ca.test.api.gov.bc.ca}"
OPENAPI_SPEC_URL="${OPENAPI_SPEC_URL:-https://raw.githubusercontent.com/bcgov/nr-lexis/main/gateway/openapi.yaml}"
OPENAPI_CONSOLE_URL="${OPENAPI_CONSOLE_URL:-https://openapi.apps.gov.bc.ca/?url=${OPENAPI_SPEC_URL}}"
OPENAPI_ORIGIN="${OPENAPI_ORIGIN:-https://openapi.apps.gov.bc.ca}"
VALID_XML_FILE="${VALID_XML_FILE:-}"

for command_name in curl jq uuidgen; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nexcol-gateway.XXXXXX")"
cleanup() {
  rm -f \
    "${TMP_DIR}/openapi.yaml" \
    "${TMP_DIR}/console.html" \
    "${TMP_DIR}/cors-preflight.headers" \
    "${TMP_DIR}/cors-preflight.json" \
    "${TMP_DIR}/submission-cors-preflight.headers" \
    "${TMP_DIR}/submission-cors-preflight.json" \
    "${TMP_DIR}/prevalidation.headers" \
    "${TMP_DIR}/prevalidation.json" \
    "${TMP_DIR}/no-auth-prevalidation.headers" \
    "${TMP_DIR}/no-auth-prevalidation.json" \
    "${TMP_DIR}/no-auth.headers" \
    "${TMP_DIR}/no-auth.json" \
    "${TMP_DIR}/no-auth-submission.headers" \
    "${TMP_DIR}/no-auth-submission.json" \
    "${TMP_DIR}/invalid.headers" \
    "${TMP_DIR}/invalid.json" \
    "${TMP_DIR}/invalid-submission.headers" \
    "${TMP_DIR}/invalid-submission.json" \
    "${TMP_DIR}/valid.json" \
    "${TMP_DIR}/wrong-scope.headers" \
    "${TMP_DIR}/wrong-scope.json"
  rmdir "${TMP_DIR}" 2>/dev/null || true
  unset ACCESS_TOKEN CLIENT_SECRET WRONG_SCOPE_ACCESS_TOKEN WRONG_SCOPE_CLIENT_SECRET
}
trap cleanup EXIT

request_status() {
  local output_file="$1"
  shift
  curl --silent --show-error \
    --connect-timeout 10 --max-time 60 \
    -o "${output_file}" -w '%{http_code}' "$@"
}

expect_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  local response_file="$4"

  if [[ "${actual}" != "${expected}" ]]; then
    echo "FAIL: ${label}: expected HTTP ${expected}, received ${actual}." >&2
    if [[ -s "${response_file}" ]]; then
      jq . "${response_file}" 2>/dev/null || sed -n '1,80p' "${response_file}" >&2
    fi
    exit 1
  fi
  echo "PASS: ${label} -> HTTP ${actual}"
}

echo "Checking the OpenAPI contract..."
status="$(request_status "${TMP_DIR}/openapi.yaml" -L "${OPENAPI_SPEC_URL}")"
expect_status 200 "${status}" "raw OpenAPI contract" "${TMP_DIR}/openapi.yaml"
grep -Fq 'openapi: 3.0.3' "${TMP_DIR}/openapi.yaml"
grep -Fq '  /api/lexis/federal/submissions/prevalidation:' "${TMP_DIR}/openapi.yaml"
grep -Fq '  /api/lexis/federal/submissions/validation:' "${TMP_DIR}/openapi.yaml"
grep -Fq '  /api/lexis/federal/submissions:' "${TMP_DIR}/openapi.yaml"
grep -Fq 'https://test.loginproxy.gov.bc.ca/auth/realms/forests/protocol/openid-connect/token' "${TMP_DIR}/openapi.yaml"
grep -Fq 'https://loginproxy.gov.bc.ca/auth/realms/forests/protocol/openid-connect/token' "${TMP_DIR}/openapi.yaml"
grep -Fq '              name: ESFSubmission' "${TMP_DIR}/openapi.yaml"
grep -Fq '                <esf:ESFSubmission' "${TMP_DIR}/openapi.yaml"
if grep -Fq 'externalValue:' "${TMP_DIR}/openapi.yaml"; then
  echo "FAIL: XML request examples must be inline for the Swagger request editor." >&2
  exit 1
fi

status="$(request_status "${TMP_DIR}/console.html" -L "${OPENAPI_CONSOLE_URL}")"
expect_status 200 "${status}" "BC Government OpenAPI viewer" "${TMP_DIR}/console.html"

if [[ "${MODE}" == "--docs-only" ]]; then
  echo "Documentation checks passed."
  exit 0
fi

prevalidation_url="${LEXIS_GATEWAY_BASE_URL%/}${PREVALIDATION_PATH}"
validation_url="${LEXIS_GATEWAY_BASE_URL%/}${VALIDATION_PATH}"
submission_url="${LEXIS_GATEWAY_BASE_URL%/}${SUBMISSION_PATH}"
status="$(curl --silent --show-error \
  --connect-timeout 10 --max-time 60 \
  --dump-header "${TMP_DIR}/cors-preflight.headers" \
  --output "${TMP_DIR}/cors-preflight.json" \
  --write-out '%{http_code}' \
  --request OPTIONS "${validation_url}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type,x-request-id,x-source-system")"
if [[ "${status}" != "200" && "${status}" != "204" ]]; then
  echo "FAIL: Swagger CORS preflight: expected HTTP 200 or 204, received ${status}." >&2
  exit 1
fi
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" \
  "${TMP_DIR}/cors-preflight.headers"
grep -Eqi '^access-control-allow-methods:.*POST' "${TMP_DIR}/cors-preflight.headers"
for required_header in authorization content-type x-request-id x-source-system; do
  grep -Eqi "^access-control-allow-headers:.*${required_header}" \
    "${TMP_DIR}/cors-preflight.headers"
done
echo "PASS: Swagger CORS preflight -> HTTP ${status}"

status="$(curl --silent --show-error \
  --connect-timeout 10 --max-time 60 \
  --dump-header "${TMP_DIR}/submission-cors-preflight.headers" \
  --output "${TMP_DIR}/submission-cors-preflight.json" \
  --write-out '%{http_code}' \
  --request OPTIONS "${submission_url}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type,x-idempotency-key,x-request-id,x-source-system")"
if [[ "${status}" != "200" && "${status}" != "204" ]]; then
  echo "FAIL: submission Swagger CORS preflight: expected HTTP 200 or 204, received ${status}." >&2
  exit 1
fi
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" \
  "${TMP_DIR}/submission-cors-preflight.headers"
grep -Eqi '^access-control-allow-methods:.*POST' \
  "${TMP_DIR}/submission-cors-preflight.headers"
for required_header in authorization content-type x-idempotency-key x-request-id x-source-system; do
  grep -Eqi "^access-control-allow-headers:.*${required_header}" \
    "${TMP_DIR}/submission-cors-preflight.headers"
done
echo "PASS: submission Swagger CORS preflight -> HTTP ${status}"

if [[ -z "${CLIENT_SECRET:-}" ]]; then
  echo "CLIENT_SECRET is required. Supply the NEXCOL runtime-client secret." >&2
  exit 1
fi

if [[ -n "${VALID_XML_FILE}" && ! -f "${VALID_XML_FILE}" ]]; then
  echo "VALID_XML_FILE does not exist: ${VALID_XML_FILE}" >&2
  exit 1
fi

token_response="$(curl --silent --show-error --fail-with-body \
  --connect-timeout 10 --max-time 60 \
  -X POST "${TOKEN_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}")"
ACCESS_TOKEN="$(jq -er '.access_token' <<< "${token_response}")"
unset token_response

introspection="$(curl --silent --show-error --fail-with-body \
  --connect-timeout 10 --max-time 60 \
  -X POST "${TOKEN_URL}/introspect" \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  --data-urlencode "token=${ACCESS_TOKEN}")"

if ! jq -e --arg client_id "${CLIENT_ID}" --arg required_scope "${REQUIRED_SCOPE}" '
  .active == true
    and .client_id == $client_id
    and (((.scope // "") | split(" ") | index($required_scope)) != null)
' >/dev/null <<< "${introspection}"; then
  echo "FAIL: runtime token is inactive, belongs to another client, or lacks ${REQUIRED_SCOPE}." >&2
  jq '{active, client_id, scope, exp}' <<< "${introspection}" >&2
  exit 1
fi
echo "PASS: runtime token is active and contains ${REQUIRED_SCOPE}"

status="$(request_status "${TMP_DIR}/no-auth.json" \
  --dump-header "${TMP_DIR}/no-auth.headers" \
  -X POST "${validation_url}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Content-Type: application/xml" \
  --data-binary "@${INVALID_XML_FILE}")"
expect_status 401 "${status}" "missing token" "${TMP_DIR}/no-auth.json"
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" "${TMP_DIR}/no-auth.headers"

status="$(request_status "${TMP_DIR}/no-auth-prevalidation.json" \
  --dump-header "${TMP_DIR}/no-auth-prevalidation.headers" \
  -X POST "${prevalidation_url}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Content-Type: application/json" \
  --data-binary '{"boomNumber":"NEXCOL-SMOKE-PREVALIDATION","clientNumber":"X","locationCode":"ZZ","timberMark":["NOT-A-MARK"]}')"
expect_status 401 "${status}" "prevalidation missing token" \
  "${TMP_DIR}/no-auth-prevalidation.json"
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" \
  "${TMP_DIR}/no-auth-prevalidation.headers"

status="$(request_status "${TMP_DIR}/no-auth-submission.json" \
  --dump-header "${TMP_DIR}/no-auth-submission.headers" \
  -X POST "${submission_url}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Content-Type: application/xml" \
  -H "X-Idempotency-Key: NEXCOL-SMOKE-NO-AUTH" \
  --data-binary "@${INVALID_XML_FILE}")"
expect_status 401 "${status}" "submission missing token" \
  "${TMP_DIR}/no-auth-submission.json"
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" \
  "${TMP_DIR}/no-auth-submission.headers"

status="$(request_status "${TMP_DIR}/prevalidation.json" \
  --dump-header "${TMP_DIR}/prevalidation.headers" \
  -X POST "${prevalidation_url}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Content-Type: application/json" \
  --data-binary '{"boomNumber":"NEXCOL-SMOKE-PREVALIDATION","clientNumber":"X","locationCode":"ZZ","timberMark":["NOT-A-MARK"]}')"
expect_status 200 "${status}" "legacy field prevalidation" "${TMP_DIR}/prevalidation.json"
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" \
  "${TMP_DIR}/prevalidation.headers"
jq -e '
  .boomNumber == "NEXCOL-SMOKE-PREVALIDATION"
    and .clientNumber == "X"
    and .locationCode == "ZZ"
    and .timberMark == ["NOT-A-MARK"]
    and ((.errors // null) | type == "array")
    and ((.errors // []) | length >= 3)
' "${TMP_DIR}/prevalidation.json" >/dev/null

request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
status="$(request_status "${TMP_DIR}/invalid.json" \
  --dump-header "${TMP_DIR}/invalid.headers" \
  -X POST "${validation_url}" \
  --url-query "userReference=NEXCOL-SMOKE-INVALID" \
  --url-query "originalFileName=invalid-federal-submission.xml" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Content-Type: application/xml" \
  -H "X-Request-ID: ${request_id}" \
  -H "X-Source-System: NEXCOL" \
  --data-binary "@${INVALID_XML_FILE}")"
expect_status 422 "${status}" "invalid federal XML" "${TMP_DIR}/invalid.json"
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" "${TMP_DIR}/invalid.headers"
jq -e '.status == "rejected" and ((.errors // []) | length > 0)' \
  "${TMP_DIR}/invalid.json" >/dev/null

request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
idempotency_key="$(uuidgen | tr '[:upper:]' '[:lower:]')"
status="$(request_status "${TMP_DIR}/invalid-submission.json" \
  --dump-header "${TMP_DIR}/invalid-submission.headers" \
  -X POST "${submission_url}" \
  --url-query "userReference=NEXCOL-SMOKE-SUBMIT-INVALID" \
  --url-query "originalFileName=invalid-federal-submission.xml" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Origin: ${OPENAPI_ORIGIN}" \
  -H "Content-Type: application/xml" \
  -H "X-Idempotency-Key: ${idempotency_key}" \
  -H "X-Request-ID: ${request_id}" \
  -H "X-Source-System: NEXCOL" \
  --data-binary "@${INVALID_XML_FILE}")"
expect_status 422 "${status}" "invalid federal submission" \
  "${TMP_DIR}/invalid-submission.json"
grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" \
  "${TMP_DIR}/invalid-submission.headers"
jq -e '.status == "rejected" and ((.errors // []) | length > 0)' \
  "${TMP_DIR}/invalid-submission.json" >/dev/null

if [[ -n "${VALID_XML_FILE}" ]]; then
  request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  status="$(request_status "${TMP_DIR}/valid.json" \
    -X POST "${validation_url}" \
    --url-query "userReference=NEXCOL-SMOKE-VALID" \
    --url-query "originalFileName=$(basename "${VALID_XML_FILE}")" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/xml" \
    -H "X-Request-ID: ${request_id}" \
    -H "X-Source-System: NEXCOL" \
    --data-binary "@${VALID_XML_FILE}")"
  expect_status 200 "${status}" "valid federal XML" "${TMP_DIR}/valid.json"
  jq -e '.status == "validated" and ((.errors // []) | length == 0)' \
    "${TMP_DIR}/valid.json" >/dev/null
else
  echo "SKIP: valid XML check; VALID_XML_FILE was not supplied."
fi

if [[ -n "${WRONG_SCOPE_CLIENT_ID:-}" || -n "${WRONG_SCOPE_CLIENT_SECRET:-}" ]]; then
  if [[ -z "${WRONG_SCOPE_CLIENT_ID:-}" || -z "${WRONG_SCOPE_CLIENT_SECRET:-}" ]]; then
    echo "Set both WRONG_SCOPE_CLIENT_ID and WRONG_SCOPE_CLIENT_SECRET." >&2
    exit 1
  fi

  wrong_scope_response="$(curl --silent --show-error --fail-with-body \
    --connect-timeout 10 --max-time 60 \
    -X POST "${TOKEN_URL}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=client_credentials" \
    --data-urlencode "client_id=${WRONG_SCOPE_CLIENT_ID}" \
    --data-urlencode "client_secret=${WRONG_SCOPE_CLIENT_SECRET}")"
  WRONG_SCOPE_ACCESS_TOKEN="$(jq -er '.access_token' <<< "${wrong_scope_response}")"
  unset wrong_scope_response

  status="$(request_status "${TMP_DIR}/wrong-scope.json" \
    --dump-header "${TMP_DIR}/wrong-scope.headers" \
    -X POST "${validation_url}" \
    -H "Authorization: Bearer ${WRONG_SCOPE_ACCESS_TOKEN}" \
    -H "Origin: ${OPENAPI_ORIGIN}" \
    -H "Content-Type: application/xml" \
    --data-binary "@${INVALID_XML_FILE}")"
  expect_status 403 "${status}" "token without submission scope" "${TMP_DIR}/wrong-scope.json"
  grep -Fqi "access-control-allow-origin: ${OPENAPI_ORIGIN}" \
    "${TMP_DIR}/wrong-scope.headers"
else
  echo "SKIP: wrong-scope check; no separate wrong-scope client was supplied."
fi

echo "Non-mutating TEST gateway checks passed."
