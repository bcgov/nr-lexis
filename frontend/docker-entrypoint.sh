#!/bin/sh
# Generate /srv/config.js from VITE_* env vars at container start.
# index.html loads /config.js before the app bundle; src/env.ts then merges
# window.config over import.meta.env, so runtime values win.
set -eu

require_non_blank() {
  variable_name="$1"
  variable_value="$2"
  normalized_value="$(printf '%s' "${variable_value}" | tr -d '[:space:]')"
  if [ -z "${normalized_value}" ]; then
    echo "${variable_name} is required for deployed LEXIS authentication." >&2
    exit 1
  fi
}

require_supported_zone() {
  normalized_zone="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "${normalized_zone}" in
    dev|test|prod) ;;
    *)
      echo "VITE_ZONE must be configured as dev, test, or prod for deployed LEXIS authentication." >&2
      exit 1
      ;;
  esac
}

# A running login shell without these values cannot authenticate anyone. Fail startup before
# writing config.js, and report only the missing variable name rather than its configured value.
require_non_blank "VITE_USER_POOLS_ID" "${VITE_USER_POOLS_ID:-}"
require_non_blank "VITE_USER_POOLS_WEB_CLIENT_ID" "${VITE_USER_POOLS_WEB_CLIENT_ID:-}"
require_non_blank "VITE_COGNITO_DOMAIN" "${VITE_COGNITO_DOMAIN:-}"
require_non_blank "VITE_ZONE" "${VITE_ZONE:-}"
require_supported_zone "${VITE_ZONE}"

# /tmp is mounted as an emptyDir when readOnlyRootFilesystem=true.
mkdir -p /tmp/coraza

CONFIG_FILE=/srv/config.js

escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$CONFIG_FILE" <<EOF2
// Generated at container start by docker-entrypoint.sh from VITE_* env vars.
window.config = {
  VITE_USER_POOLS_ID: "$(escape "${VITE_USER_POOLS_ID:-}")",
  VITE_USER_POOLS_WEB_CLIENT_ID: "$(escape "${VITE_USER_POOLS_WEB_CLIENT_ID:-}")",
  VITE_COGNITO_DOMAIN: "$(escape "${VITE_COGNITO_DOMAIN:-}")",
  VITE_REDIRECT_SIGN_IN: "$(escape "${VITE_REDIRECT_SIGN_IN:-}")",
  VITE_REDIRECT_SIGN_OUT: "$(escape "${VITE_REDIRECT_SIGN_OUT:-}")",
  VITE_COGNITO_SCOPES: "$(escape "${VITE_COGNITO_SCOPES:-}")",
  VITE_ZONE: "$(escape "${VITE_ZONE:-dev}")",
  VITE_LEXIS_PROD_RTM_ONLY: "$(escape "${VITE_LEXIS_PROD_RTM_ONLY:-false}")",
  VITE_FAM_MANAGE_URL: "$(escape "${VITE_FAM_MANAGE_URL:-}")",
  VITE_LEXIS_REPORT_ENDPOINT_BASE: "$(escape "${VITE_LEXIS_REPORT_ENDPOINT_BASE:-/api}")",
  VITE_LEXIS_REPORT_API_BASE: "$(escape "${VITE_LEXIS_REPORT_API_BASE:-/lexis/reports}")"
};
EOF2

exec /usr/bin/caddy "$@"
