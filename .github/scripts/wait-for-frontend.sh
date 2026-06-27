#!/usr/bin/env bash
set -euo pipefail

frontend_url="${1:?frontend URL is required}"
attempts="${2:-30}"
sleep_seconds="${3:-10}"
shell_marker="${4:-<div id=\"root\"}"
curl_max_seconds="${5:-20}"
curl_connect_seconds="${6:-10}"
curl_retries="${7:-2}"
response_file="${RUNNER_TEMP:-/tmp}/frontend-index.html"
frontend_host="${frontend_url#*://}"
frontend_host="${frontend_host%%/*}"
frontend_host="${frontend_host%%:*}"

echo "Waiting for frontend route: ${frontend_url}/"
if command -v getent >/dev/null 2>&1; then
  getent ahosts "${frontend_host}" || true
elif command -v dig >/dev/null 2>&1; then
  dig +short "${frontend_host}" || true
fi

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  if curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --connect-timeout "${curl_connect_seconds}" \
    --max-time "${curl_max_seconds}" \
    --retry "${curl_retries}" \
    --retry-delay 2 \
    --retry-connrefused \
    --retry-all-errors \
    --user-agent "nr-lexis-ci-route-check/1.0" \
    --header "Accept: text/html,application/xhtml+xml" \
    "${frontend_url}/" > "${response_file}"; then
    if grep -q "${shell_marker}" "${response_file}"; then
      echo "Frontend route is ready."
      exit 0
    fi
    echo "Frontend responded but did not look like the app shell."
  else
    curl_status=$?
    echo "Frontend route is not ready yet (attempt ${attempt}/${attempts}, curl exit ${curl_status})."
  fi
  if ((attempt < attempts)); then
    sleep "${sleep_seconds}"
  fi
done

echo "Frontend route did not become ready: ${frontend_url}/"
exit 1
