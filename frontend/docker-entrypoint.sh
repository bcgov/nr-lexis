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
  AWS_COGNITO_ISSUER_URI: "$(escape "${AWS_COGNITO_ISSUER_URI:-}")",
  VITE_AWS_COGNITO_ISSUER_URI: "$(escape "${VITE_AWS_COGNITO_ISSUER_URI:-${AWS_COGNITO_ISSUER_URI:-}}")",
  VITE_LOGIN_URL: "$(escape "${VITE_LOGIN_URL:-}")",
  VITE_LOGOUT_URL: "$(escape "${VITE_LOGOUT_URL:-}")",
  VITE_LEXIS_REPORT_ENDPOINT_BASE: "$(escape "${VITE_LEXIS_REPORT_ENDPOINT_BASE:-/api}")",
  VITE_LEXIS_REPORT_API_BASE: "$(escape "${VITE_LEXIS_REPORT_API_BASE:-/lexis/reports}")"
};
EOF2

exec /usr/bin/caddy "$@"
