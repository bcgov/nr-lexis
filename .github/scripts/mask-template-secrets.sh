#!/usr/bin/env bash
# Masks the JSON-escaped form of secrets passed to bcgov/action-deployer-openshift.
#
# The deployer writes the processed OpenShift template to GITHUB_ENV, so every later step in the
# job prints it. oc escapes <, > and & in that JSON as \u003c, \u003e and \u0026, a form the
# runner's own secret masking does not recognise. Pass each secret that reaches `oc process` as a
# MASK_<NAME> environment variable before the deployer runs. Values whose JSON form matches the
# raw value are already masked by the runner and are skipped.
set -euo pipefail

# Escapes a string the way oc's JSON output does. The deployer installs oc 4.14, built with Go
# 1.20, which writes backspace and form feed as \u0008 and \u000c; Go 1.22 and later write
# \b and \f, which a second argument of "short" selects. A byte loop keeps the result
# identical across bash versions and caller locales.
json_escape() {
  # Walk bytes so the UTF-8 separator sequences match whatever the caller's locale is.
  local LC_ALL=C value=$1 short_controls=${2-} escaped='' char index
  for (( index = 0; index < ${#value}; index++ )); do
    case ${value:index:3} in
      $'\342\200\250') escaped+='\u2028'; (( index += 2 )); continue ;;
      $'\342\200\251') escaped+='\u2029'; (( index += 2 )); continue ;;
    esac
    char=${value:index:1}
    if [[ -n "$short_controls" ]]; then
      case $char in
        $'\b') escaped+='\b'; continue ;;
        $'\f') escaped+='\f'; continue ;;
      esac
    fi
    case $char in
      '\') escaped+='\\' ;;
      '"') escaped+='\"' ;;
      '<') escaped+='\u003c' ;;
      '>') escaped+='\u003e' ;;
      '&') escaped+='\u0026' ;;
      $'\n') escaped+='\n' ;;
      $'\r') escaped+='\r' ;;
      $'\t') escaped+='\t' ;;
      [$'\001'-$'\037'])
        printf -v char '\\u%04x' "'$char"
        escaped+=$char
        ;;
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
  # Mask the form current oc prints and the one newer oc builds would print, skipping forms the
  # runner already masks and duplicates.
  previous=$value
  for style in '' short; do
    escaped=$(json_escape "$value" "$style")
    if [[ "$escaped" == "$value" || "$escaped" == "$previous" ]]; then
      continue
    fi
    previous=$escaped
    # Workflow commands decode %25, %0D and %0A, so encode % before registering the mask.
    # printf, unlike some shells' echo, never expands the escapes being masked.
    encoded=${escaped//"%"/%25}
    printf '::add-mask::%s\n' "$encoded"
  done
done
