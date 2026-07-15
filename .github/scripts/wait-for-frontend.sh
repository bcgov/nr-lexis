#!/usr/bin/env bash
set -euo pipefail

frontend_url="${1:?frontend URL is required}"
attempts="${2:-60}"
sleep_seconds="${3:-5}"
shell_marker="${4:-<div id=\"root\"}"
curl_max_seconds="${5:-30}"
curl_connect_seconds="${6:-5}"
curl_retries="${7:-1}"
response_file="${RUNNER_TEMP:-/tmp}/frontend-index.html"
frontend_host="${frontend_url#*://}"
frontend_host="${frontend_host%%/*}"
frontend_host="${frontend_host%%:*}"
curl_ip_mode="${WAIT_FOR_FRONTEND_IP_MODE:-ipv4}"
curl_ip_args=()
case "${curl_ip_mode}" in
  ipv4)
    curl_ip_args=(--ipv4)
    ;;
  ipv6)
    curl_ip_args=(--ipv6)
    ;;
  any)
    ;;
  *)
    echo "Unsupported WAIT_FOR_FRONTEND_IP_MODE '${curl_ip_mode}'. Use ipv4, ipv6, or any."
    exit 2
    ;;
esac

echo "Waiting for frontend route: ${frontend_url}/"
echo "Route probe IP mode: ${curl_ip_mode}"
count_dns_records() {
  if command -v getent >/dev/null 2>&1; then
    getent ahosts "${frontend_host}" 2>/dev/null | awk 'NF {print $1}' | sort -u | wc -l | tr -d ' '
  elif command -v dig >/dev/null 2>&1; then
    dig +short "${frontend_host}" 2>/dev/null | awk 'NF {print $1}' | sort -u | wc -l | tr -d ' '
  else
    printf '0'
  fi
}
dns_count="$(count_dns_records || printf '0')"
if [[ "${dns_count}" == "0" ]]; then
  echo "Route DNS lookup returned no address records."
else
  echo "Route DNS lookup returned ${dns_count} address record(s)."
fi

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  if curl \
    "${curl_ip_args[@]}" \
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
