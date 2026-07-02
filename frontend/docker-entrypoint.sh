#!/bin/sh
# Generate /srv/config.js from VITE_* env vars at container start.
# index.html loads /config.js before the app bundle; src/env.ts then merges
# window.config over import.meta.env, so runtime values win.
set -eu

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
  VITE_LEXIS_REPORT_ENDPOINT_BASE: "$(escape "${VITE_LEXIS_REPORT_ENDPOINT_BASE:-/api}")",
  VITE_LEXIS_REPORT_API_BASE: "$(escape "${VITE_LEXIS_REPORT_API_BASE:-/lexis/reports}")"
};
EOF2

exec /usr/bin/caddy "$@"
