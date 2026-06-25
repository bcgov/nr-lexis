#!/usr/bin/env bash
set -euo pipefail

frontend_url="${1:?frontend URL is required}"
attempts="${2:-30}"
sleep_seconds="${3:-10}"
shell_marker="${4:-<div id=\"root\"}"
curl_max_seconds="${5:-10}"
response_file="/tmp/frontend-index.html"

echo "Waiting for frontend route: ${frontend_url}/"

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  if curl --ipv4 \
    --fail \
    --silent \
    --show-error \
    --location \
    --connect-timeout 10 \
    --max-time "${curl_max_seconds}" \
    --user-agent "nr-lexis-ci-route-check/1.0" \
    --header "Accept: text/html,application/xhtml+xml" \
    "${frontend_url}/" > "${response_file}"; then
    if grep -q "${shell_marker}" "${response_file}"; then
      echo "Frontend route is ready."
      exit 0
    fi
    echo "Frontend responded but did not look like the app shell."
  else
    echo "Frontend route is not ready yet (attempt ${attempt}/${attempts})."
  fi
  sleep "${sleep_seconds}"
done

echo "Frontend route did not become ready: ${frontend_url}/"
exit 1
