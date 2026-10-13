#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <validated-staging-directory>" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Deployment requires root" >&2
  exit 1
fi

STAGE_DIR="$(cd "$1" && pwd -P)"
MONITORING_DIR="${MONITORING_DIR:-/home/ubuntu/monitoring}"
PROJECT="monitoring"
RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)-$$"
RELEASE_DIR="$MONITORING_DIR/releases/$RELEASE_ID"
ROLLBACK_DIR="$MONITORING_DIR/rollback/$RELEASE_ID"
ACTIVE_FILE="$MONITORING_DIR/.active-release"
DEPLOY_STARTED=0

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# Map service names to their stable container names.
container_for_service() {
  case "$1" in
    prometheus) echo monitoring-prometheus ;;
    node-exporter) echo monitoring-node-exporter ;;
    docker-exporter) echo monitoring-docker-exporter ;;
    blackbox-exporter) echo monitoring-blackbox-exporter ;;
    alertmanager) echo monitoring-alertmanager ;;
    grafana) echo monitoring-grafana ;;
    telegram-notifier) echo monitoring-telegram-notifier ;;
    *) return 1 ;;
  esac
}

# Prevent concurrent deployments.
exec 9>"$MONITORING_DIR/.deploy.lock"
flock -n 9 || fail "Another Monitoring deployment is running"

# Validate prerequisites before updating Production.
test -f "$STAGE_DIR/docker-compose.yml" ||
  fail "Missing staging Compose file"

test -s "$STAGE_DIR/secrets/monitoring_webhook_token" ||
  fail "Missing staging secret"

test -f "$STAGE_DIR/deploy/verify-monitoring-health.sh" ||
  fail "Missing health script"

MONITORING_DIR="$MONITORING_DIR" bash \
  "$STAGE_DIR/deploy/verify-production-baseline.sh"

# Resolve the currently active release.
OLD_DIR="$MONITORING_DIR"

if [ -f "$ACTIVE_FILE" ]; then
  IFS= read -r OLD_DIR < "$ACTIVE_FILE"

  case "$OLD_DIR" in
    "$MONITORING_DIR"/releases/*) ;;
    *) fail "Unexpected active release directory" ;;
  esac
fi

test -f "$OLD_DIR/docker-compose.yml" ||
  fail "Old Compose configuration missing"

docker compose -p "$PROJECT" \
  -f "$OLD_DIR/docker-compose.yml" config -q

# Prepare an independent release directory.
install -d -m 0700 \
  "$MONITORING_DIR/releases" \
  "$MONITORING_DIR/rollback"

mkdir "$RELEASE_DIR" "$ROLLBACK_DIR"
cp -a "$STAGE_DIR/." "$RELEASE_DIR/"

test "$(stat -c '%u:%g:%a' \
  "$RELEASE_DIR/secrets/monitoring_webhook_token")" = \
  "0:24000:440" ||
  fail "Release secret permissions invalid"

docker compose -p "$PROJECT" \
  -f "$RELEASE_DIR/docker-compose.yml" config -q


# Discover services defined by the previous release.
OLD_SERVICES="$(
  docker compose -p "$PROJECT" \
    -f "$OLD_DIR/docker-compose.yml" \
    config --services
)"

test -n "$OLD_SERVICES" ||
  fail "No services found in previous release"

# Preserve exact image IDs for rollback.
# Only services from the previous release are included.
{
  echo 'services:'

  while IFS= read -r service; do
    container="$(container_for_service "$service")" ||
      fail "Unsupported previous service: $service"

    docker container inspect "$container" >/dev/null 2>&1 ||
      fail "Previous release container missing: $container"

    image_id="$(
      docker inspect --format '{{.Image}}' "$container"
    )"

    docker image inspect "$image_id" >/dev/null 2>&1 ||
      fail "Previous image unavailable: $container"

    rollback_tag="monitoring-rollback-${RELEASE_ID}-${service}:pinned"

    docker image tag "$image_id" "$rollback_tag"

    printf '  %s:\n    image: %s\n' \
      "$service" "$rollback_tag"

    echo "ROLLBACK IMAGE SAVED: $service" >&2

  done <<< "$OLD_SERVICES"

} > "$ROLLBACK_DIR/images.override.yml"

# Check rollback Compose configuration before deployment.
docker compose -p "$PROJECT" \
  -f "$OLD_DIR/docker-compose.yml" \
  -f "$ROLLBACK_DIR/images.override.yml" \
  config -q

rollback_if_failed() {
  rc=$?
  trap - EXIT

  if [ "$rc" -ne 0 ] && [ "$DEPLOY_STARTED" -eq 1 ]; then
    echo "Deployment failed; restoring previous release" >&2

    if docker compose -p "$PROJECT" \
      -f "$OLD_DIR/docker-compose.yml" \
      -f "$ROLLBACK_DIR/images.override.yml" \
      up -d --no-build --pull never \
      --force-recreate --remove-orphans; then

      # A successful Compose command alone does not prove rollback health.
      rollback_containers_ok=1
      while IFS= read -r old_service; do
        old_container="$(container_for_service "$old_service")" || {
          rollback_containers_ok=0
          break
        }
        if [ "$(docker inspect -f '{{.State.Running}}' \
          "$old_container" 2>/dev/null)" != "true" ]; then
          echo "CRITICAL: Restored container is not running: $old_container" >&2
          rollback_containers_ok=0
        fi
      done <<< "$OLD_SERVICES"

      if [ "$rollback_containers_ok" -eq 1 ]; then
        echo "Rollback containers running; verify application endpoints manually" >&2
      else
        echo "CRITICAL: Rollback container verification failed" >&2
      fi
    else
      echo "CRITICAL: Automatic rollback failed" >&2
    fi
  fi

  exit "$rc"
}

trap rollback_if_failed EXIT
# Convert graceful cancellation into a failed exit, triggering rollback.
trap 'exit 143' TERM
trap 'exit 130' INT

# Deploy the new release.
DEPLOY_STARTED=1

docker compose -p "$PROJECT" \
  -f "$RELEASE_DIR/docker-compose.yml" \
  up -d --build --remove-orphans

# Verify the new release before marking it active.
bash "$RELEASE_DIR/deploy/verify-monitoring-health.sh"

printf '%s\n' "$RELEASE_DIR" \
  > "$MONITORING_DIR/.active-release.tmp"

mv -f "$MONITORING_DIR/.active-release.tmp" "$ACTIVE_FILE"

DEPLOY_STARTED=0

echo "MONITORING PRODUCTION DEPLOYMENT PASSED: $RELEASE_ID"
