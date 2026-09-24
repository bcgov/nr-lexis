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

# A running login shell without these values cannot authenticate anyone. Fail startup before
# writing config.js, and report only the missing variable name rather than its configured value.
require_non_blank "VITE_OIDC_ISSUER_URI" "${VITE_OIDC_ISSUER_URI:-}"
require_non_blank "VITE_OIDC_CLIENT_ID" "${VITE_OIDC_CLIENT_ID:-}"

# /tmp is mounted as an emptyDir when readOnlyRootFilesystem=true.
mkdir -p /tmp/coraza

CONFIG_FILE=/srv/config.js

escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$CONFIG_FILE" <<EOF2
// Generated at container start by docker-entrypoint.sh from VITE_* env vars.
window.config = {
  VITE_OIDC_ISSUER_URI: "$(escape "${VITE_OIDC_ISSUER_URI:-}")",
  VITE_OIDC_CLIENT_ID: "$(escape "${VITE_OIDC_CLIENT_ID:-}")",
  VITE_OIDC_IDIR_HINT: "$(escape "${VITE_OIDC_IDIR_HINT:-azureidir}")",
  VITE_OIDC_BCEID_HINT: "$(escape "${VITE_OIDC_BCEID_HINT:-bceidbusiness}")",
  VITE_OIDC_SITEMINDER_LOGOUT_URL: "$(escape "${VITE_OIDC_SITEMINDER_LOGOUT_URL:-}")",
  VITE_LEXIS_PROD_RTM_ONLY: "$(escape "${VITE_LEXIS_PROD_RTM_ONLY:-false}")",
  VITE_LEXIS_REPORT_ENDPOINT_BASE: "$(escape "${VITE_LEXIS_REPORT_ENDPOINT_BASE:-/api}")",
  VITE_LEXIS_REPORT_API_BASE: "$(escape "${VITE_LEXIS_REPORT_API_BASE:-/lexis/reports}")"
};
EOF2

exec /usr/bin/caddy "$@"
