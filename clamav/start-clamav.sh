#!/usr/bin/env bash
set -Eeuo pipefail

clamd_pid=""
freshclam_pid=""
shutdown_requested=false

stop_children() {
  if [[ -n "${freshclam_pid}" ]]; then
    kill -TERM "${freshclam_pid}" 2>/dev/null || true
  fi
  if [[ -n "${clamd_pid}" ]]; then
    kill -TERM "${clamd_pid}" 2>/dev/null || true
  fi
}

wait_for_children() {
  if [[ -n "${freshclam_pid}" ]]; then
    wait "${freshclam_pid}" 2>/dev/null || true
  fi
  if [[ -n "${clamd_pid}" ]]; then
    wait "${clamd_pid}" 2>/dev/null || true
  fi
}

handle_shutdown() {
  shutdown_requested=true
  stop_children
}

trap handle_shutdown TERM INT HUP

# Fail startup closed if no current definitions can be obtained, then keep them refreshed.
freshclam &
freshclam_pid=$!
if wait "${freshclam_pid}"; then
  initial_refresh_status=0
else
  initial_refresh_status=$?
fi
if [[ "${shutdown_requested}" == "true" ]]; then
  wait_for_children
  exit 0
fi
freshclam_pid=""
if [[ "${initial_refresh_status}" -ne 0 ]]; then
  exit "${initial_refresh_status}"
fi

freshclam --daemon --foreground=true &
freshclam_pid=$!
clamd &
clamd_pid=$!
if [[ "${shutdown_requested}" == "true" ]]; then
  stop_children
  wait_for_children
  exit 0
fi

exited_pid=""
if wait -n -p exited_pid "${freshclam_pid}" "${clamd_pid}"; then
  exit_status=0
else
  exit_status=$?
fi

if [[ "${shutdown_requested}" == "true" ]]; then
  wait_for_children
  exit 0
fi

if [[ "${exited_pid}" == "${freshclam_pid}" ]]; then
  process_name="freshclam refresh daemon"
elif [[ "${exited_pid}" == "${clamd_pid}" ]]; then
  process_name="clamd scanner daemon"
else
  process_name="unknown scanner process"
fi

echo "${process_name} exited unexpectedly; stopping the ClamAV container for restart." >&2
stop_children
wait_for_children

# A normally exiting long-running child is still an unhealthy supervisor outcome.
if [[ "${exit_status}" -eq 0 ]]; then
  exit 1
fi
exit "${exit_status}"
