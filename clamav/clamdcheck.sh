#!/usr/bin/env sh
set -eu

printf 'zPING\0' | nc -w 5 127.0.0.1 3310 | grep -q PONG

if [ "${1:-ready}" = "live" ]; then
  exit 0
fi

# Treat definitions older than 72 hours as unhealthy so the platform surfaces refresh failures.
find /opt/app-root/src -type f \( -name '*.cvd' -o -name '*.cld' \) -mmin -4320 -print -quit \
  | grep -q .
