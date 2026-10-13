#!/usr/bin/env bash
set -euo pipefail

MAX_WAIT_SECONDS=120
CHECK_INTERVAL_SECONDS=5

CONTAINERS=(
  monitoring-prometheus
  monitoring-node-exporter
  monitoring-docker-exporter
  monitoring-blackbox-exporter
  monitoring-alertmanager
  monitoring-grafana
  monitoring-telegram-notifier
)

check_health() {
  local container
  local url

  # All expected containers must be running.
  for container in "${CONTAINERS[@]}"; do
    if [ "$(docker inspect -f '{{.State.Running}}' \
      "$container" 2>/dev/null)" != "true" ]; then
      echo "Waiting for container: $container"
      return 1
    fi
  done

  # Check service readiness and exporter metrics.
  for url in \
    "http://127.0.0.1:9090/-/ready" \
    "http://127.0.0.1:9093/-/ready" \
    "http://127.0.0.1:3000/api/health" \
    "http://127.0.0.1:9100/metrics" \
    "http://127.0.0.1:9713/metrics" \
    "http://127.0.0.1:9115/metrics"
  do
    if ! curl --fail --silent \
      --connect-timeout 3 --max-time 5 \
      "$url" >/dev/null; then
      echo "Waiting for endpoint: $url"
      return 1
    fi
  done

  # Verify Gunicorn is accepting connections inside Notifier.
  if ! docker exec monitoring-telegram-notifier \
    python -c '
import socket

with socket.create_connection(("127.0.0.1", 8080), timeout=5):
    pass
' >/dev/null 2>&1; then
    echo "Waiting for Telegram Notifier on port 8080"
    return 1
  fi

  return 0
}

echo "Starting Monitoring health verification"

DEADLINE=$((SECONDS + MAX_WAIT_SECONDS))

while [ "$SECONDS" -lt "$DEADLINE" ]; do
  if check_health; then
    echo "MONITORING HEALTH CHECK PASSED"
    exit 0
  fi

  sleep "$CHECK_INTERVAL_SECONDS"
done

echo "ERROR: Monitoring health verification timed out" >&2
exit 1
