#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <staging-directory>" >&2
  exit 1
fi

RELEASE_DIR="$(cd "$1" && pwd -P)"
SECRET_FILE="$RELEASE_DIR/secrets/monitoring_webhook_token"
COMPOSE_FILE="$RELEASE_DIR/docker-compose.yml"

test -f "$COMPOSE_FILE"
test -s "$SECRET_FILE"

# Verify host-side secret ownership and permissions.
test "$(stat -c '%u:%g:%a' "$SECRET_FILE")" = "0:24000:440"
test "$(stat -c '%u:%g:%a' "$(dirname "$SECRET_FILE")")" = "0:0:700"

echo "SECRET FILE PERMISSIONS: PASS"

# Use a unique Compose project to avoid concurrent preflight conflicts.
PREFLIGHT_PROJECT="monitoring-preflight-$$"

COMPOSE=(
  docker compose
  -p "$PREFLIGHT_PROJECT"
  -f "$COMPOSE_FILE"
)

# Remove temporary preflight resources on exit.
cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" config -q
echo "COMPOSE CONFIG: PASS"

"${COMPOSE[@]}" run --rm --no-deps \
  --entrypoint /bin/amtool \
  alertmanager \
  check-config /etc/alertmanager/alertmanager.yml

echo "ALERTMANAGER CONFIG: PASS"

"${COMPOSE[@]}" run --rm --no-deps \
  --entrypoint /bin/promtool \
  prometheus \
  check config /etc/prometheus/prometheus.yml

echo "PROMETHEUS CONFIG AND RULES: PASS"

"${COMPOSE[@]}" build telegram-notifier
echo "TELEGRAM NOTIFIER BUILD: PASS"

"${COMPOSE[@]}" run --rm --no-deps \
  --entrypoint python \
  telegram-notifier \
  -c '
import os
from pathlib import Path

assert os.geteuid() != 0
assert 24000 in os.getgroups()

with Path("/run/secrets/monitoring_webhook_token").open("rb") as f:
    assert f.read(1)

print("NOTIFIER NON-ROOT SECRET READ: PASS")
'

"${COMPOSE[@]}" run --rm --no-deps \
  --entrypoint /bin/sh \
  alertmanager \
  -c '
    set -eu
    test "$(id -u)" -ne 0
    id -G | tr " " "\n" | grep -qx 24000
    cat /run/secrets/monitoring_webhook_token >/dev/null
    echo "ALERTMANAGER NON-ROOT SECRET READ: PASS"
  '

echo "MONITORING RELEASE PRE-DEPLOYMENT VALIDATION PASSED"
