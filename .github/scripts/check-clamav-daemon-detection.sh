#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-nr-lexis-clamav:ci}"
CONTAINER="${2:-nr-lexis-clamav-ci}"
ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}

show_logs() {
  docker logs "${CONTAINER}" 2>/dev/null || true
  tmpdir="$(mktemp -d)"
  if docker cp "${CONTAINER}:/var/log/clamav/clamav.log" "${tmpdir}/clamav.log" >/dev/null 2>&1; then
    echo "--- /var/log/clamav/clamav.log ---"
    cat "${tmpdir}/clamav.log"
  fi
  rm -rf "${tmpdir}"
}

cleanup
trap cleanup EXIT

docker build --pull -t "${IMAGE}" "${ROOT_DIR}/clamav"

docker run -d --name "${CONTAINER}" -p 3310:3310 "${IMAGE}" sh -c '
  set -eu
  cat > /opt/app-root/src/ci-test.ndb <<EOF
ClamAv-Ci-Test-Signature:0:*:58354F2150254041505B345C505A58353428505E2937434329377D2445494341522D5354414E444152442D414E544956495255532D544553542D46494C452124482B482A
EOF
  exec clamd
'

ready=false
for _ in $(seq 1 60); do
  if ! docker inspect "${CONTAINER}" >/dev/null 2>&1; then
    echo "ClamAV container exited before becoming ready."
    show_logs
    exit 1
  fi

  if [ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER}")" != "true" ]; then
    echo "ClamAV container is not running."
    show_logs
    exit 1
  fi

  if docker exec "${CONTAINER}" /opt/app-root/clamdcheck.sh live >/dev/null 2>&1; then
    ready=true
    break
  fi

  sleep 5
done

if [ "${ready}" != "true" ]; then
  echo "ClamAV did not become ready before the timeout."
  show_logs
  exit 1
fi

python3 <<'PY'
import socket
import struct
import sys

test_signature_hex = (
    "58354F2150254041505B345C505A58353428505E2937434329377D244549434152"
    "2D5354414E444152442D414E544956495255532D544553542D46494C452124482B482A"
)
test_payload = bytes.fromhex(test_signature_hex)

with socket.create_connection(("127.0.0.1", 3310), timeout=10) as sock:
    sock.sendall(b"zINSTREAM\0")
    sock.sendall(struct.pack(">I", len(test_payload)))
    sock.sendall(test_payload)
    sock.sendall(struct.pack(">I", 0))
    response = sock.recv(4096).decode("utf-8", errors="replace").strip("\0\r\n")

print(response)
if "FOUND" not in response:
    print("Expected ClamAV to detect the CI test payload.", file=sys.stderr)
    sys.exit(1)
PY
