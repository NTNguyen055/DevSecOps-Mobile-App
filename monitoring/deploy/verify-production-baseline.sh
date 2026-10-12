#!/usr/bin/env bash
set -euo pipefail

MONITORING_DIR="${MONITORING_DIR:-/home/ubuntu/monitoring}"
EXPECTED_PROJECT="monitoring"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v docker >/dev/null ||
  fail "Docker CLI is missing"

docker info >/dev/null 2>&1 ||
  fail "Docker daemon is unavailable"

test -f "$MONITORING_DIR/docker-compose.yml" ||
  fail "Existing monitoring Compose file not found"

check_container() {
  local container="$1"
  local actual_project

  docker container inspect "$container" >/dev/null 2>&1 ||
    fail "Existing container not found: $container"

  actual_project="$(
    docker inspect \
      --format '{{index .Config.Labels "com.docker.compose.project"}}' \
      "$container"
  )"

  test "$actual_project" = "$EXPECTED_PROJECT" ||
    fail "$container belongs to project '$actual_project', expected '$EXPECTED_PROJECT'"

  echo "COMPOSE PROJECT VERIFIED: $container"
}

check_container monitoring-prometheus
check_container monitoring-grafana

PROM_VOLUME="$(
  docker inspect \
    --format '{{range .Mounts}}{{if eq .Destination "/prometheus"}}{{.Name}}{{end}}{{end}}' \
    monitoring-prometheus
)"

GRAFANA_VOLUME="$(
  docker inspect \
    --format '{{range .Mounts}}{{if eq .Destination "/var/lib/grafana"}}{{.Name}}{{end}}{{end}}' \
    monitoring-grafana
)"

test "$PROM_VOLUME" = "monitoring_prometheus-data" ||
  fail "Unexpected Prometheus volume: $PROM_VOLUME"

test "$GRAFANA_VOLUME" = "monitoring_grafana-data" ||
  fail "Unexpected Grafana volume: $GRAFANA_VOLUME"

docker volume inspect "$PROM_VOLUME" >/dev/null 2>&1 ||
  fail "Prometheus data volume not found"

docker volume inspect "$GRAFANA_VOLUME" >/dev/null 2>&1 ||
  fail "Grafana data volume not found"

echo "PROMETHEUS DATA VOLUME VERIFIED"
echo "GRAFANA DATA VOLUME VERIFIED"
echo "PRODUCTION BASELINE VERIFICATION PASSED"
