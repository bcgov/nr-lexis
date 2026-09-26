#!/usr/bin/env bash
# Masks the JSON-escaped form of secrets passed to bcgov/action-deployer-openshift.
#
# The deployer writes the processed OpenShift template to GITHUB_ENV, so every later step in the
# job prints it. oc escapes <, > and & in that JSON as \u003c, \u003e and \u0026, a form the
# runner's own secret masking does not recognise. Pass each secret that reaches `oc process` as a
# MASK_<NAME> environment variable before the deployer runs. Values whose JSON form matches the
# raw value are already masked by the runner and are skipped.
set -euo pipefail

# Escapes a string the way oc's JSON output does. A character loop keeps the result identical
# across bash versions, whose pattern-substitution quoting rules differ.
json_escape() {
  local value=$1 escaped='' char index
  for (( index = 0; index < ${#value}; index++ )); do
    char=${value:index:1}
    case $char in
      '\') escaped+='\\' ;;
      '"') escaped+='\"' ;;
      '<') escaped+='\u003c' ;;
      '>') escaped+='\u003e' ;;
      '&') escaped+='\u0026' ;;
      $'\n') escaped+='\n' ;;
      $'\r') escaped+='\r' ;;
      $'\t') escaped+='\t' ;;
      *) escaped+=$char ;;
    esac
  done
  printf '%s' "$escaped"
}

for name in ${!MASK_@}; do
  value=${!name}
  if [[ -z "$value" ]]; then
    continue
  fi
  escaped=$(json_escape "$value")
  if [[ "$escaped" == "$value" ]]; then
    continue
  fi
  # Workflow commands decode %25, %0D and %0A, so encode % before registering the mask. printf,
  # unlike some shells' echo, never expands the escapes being masked.
  encoded=${escaped//"%"/%25}
  printf '::add-mask::%s\n' "$encoded"
done
