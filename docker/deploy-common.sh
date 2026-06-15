#!/bin/bash
# Shared deploy orchestration — sourced by deploy-production.sh.
#
# This is the shipshit-shaped, single-service descendant of
# genfeed.ai/docker/deploy-common.sh. genfeed orchestrates ~10 microservices in
# dependency waves; shipshit ships exactly one host-side service (`api`) in
# front of RDS, so the wave machinery is collapsed to a simple per-service loop.
# The deploy still: hydrates env from SSM, applies Prisma migrations, pulls the
# image from ghcr, recreates the container, health-checks it, and rolls back to
# the previous image on failure.
#
# Callers MUST export before sourcing:
#   COMPOSE_FILE      — compose file path (docker/docker-compose.production.yml)
#   ENV_FILE          — root env file name (.env.production)
#   DEPLOY_ENV        — environment label for render-ssm-env.sh (production)
#   CONTAINER_PREFIX  — docker container name prefix (shipshit)
#   API_IMAGE         — fully-qualified runtime image ref (…/api:<tag>)
#   MIGRATE_IMAGE     — fully-qualified migrate image ref (…/api-migrate:<tag>)
#   DEPLOY_HEADER     — log header label
# Optional: WAIT_RETRIES, WAIT_INTERVAL, WAIT_START_DELAY, API_PORT.

set -euo pipefail

FAILED_SERVICES=()
DEPLOYED_SERVICES=()
CHANGED_SERVICES=("$@")

WAIT_RETRIES="${WAIT_RETRIES:-20}"
WAIT_INTERVAL="${WAIT_INTERVAL:-3}"
WAIT_START_DELAY="${WAIT_START_DELAY:-5}"
API_PORT="${API_PORT:-3003}"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log() { echo "[$(date '+%H:%M:%S')] $*"; }
log_header() {
  echo ""
  echo "=========================================="
  echo " $*"
  echo "=========================================="
}

show_docker_disk_usage() { log "Docker disk usage:"; docker system df 2>&1 || true; }

# ---------------------------------------------------------------------------
# Docker helpers
# ---------------------------------------------------------------------------
reclaim_docker_space() {
  log "Reclaiming docker space..."
  docker container prune -f 2>&1 || true
  docker builder prune -f 2>&1 || true
  docker image prune -af --filter "until=24h" 2>&1 || true
  docker network prune -f 2>&1 || true
}

is_changed() {
  local service="$1"
  for s in "${CHANGED_SERVICES[@]}"; do
    [ "$s" = "$service" ] && return 0
  done
  return 1
}

remove_conflicting_container() {
  local container="${CONTAINER_PREFIX}-$1"
  if docker container inspect "$container" >/dev/null 2>&1; then
    log "Removing pre-existing container ${container} to avoid name conflicts..."
    docker rm -f "$container" >/dev/null 2>&1 || {
      log "FAILED: could not remove conflicting container ${container}"
      return 1
    }
  fi
}

get_previous_image() {
  docker inspect --format='{{.Config.Image}}' "${CONTAINER_PREFIX}-$1" 2>/dev/null || echo ""
}

# wait_healthy: poll the container's healthcheck; fast-fail on unhealthy/exited.
wait_healthy() {
  local service="$1"
  local container="${CONTAINER_PREFIX}-${service}"

  log "Waiting ${WAIT_START_DELAY}s for ${service} to initialize..."
  sleep "$WAIT_START_DELAY"

  for i in $(seq 1 "$WAIT_RETRIES"); do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")

    if [ "$status" = "healthy" ]; then
      log "${service} is healthy"
      return 0
    fi

    if [ "$status" = "unhealthy" ]; then
      log "FAILED: ${service} is unhealthy — not waiting further"
      docker logs --tail=50 "$container" 2>&1 || true
      return 1
    fi

    if [ "$status" = "none" ]; then
      local running
      running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
      if [ "$running" = "true" ]; then
        log "${service} is running (no healthcheck reported yet)"
      else
        log "FAILED: ${service} container exited — not waiting further"
        docker logs --tail=50 "$container" 2>&1 || true
        return 1
      fi
    fi

    if [ "$i" -eq "$WAIT_RETRIES" ]; then
      log "FAILED: ${service} did not become healthy after $((WAIT_RETRIES * WAIT_INTERVAL))s (last: ${status})"
      docker logs --tail=50 "$container" 2>&1 || true
      return 1
    fi

    echo "  Waiting for ${service}... ($i/${WAIT_RETRIES}) [status: ${status}]"
    sleep "$WAIT_INTERVAL"
  done
}

rollback_service() {
  local service="$1" previous_image="$2"
  if [ -z "$previous_image" ]; then
    log "No previous image for ${service} — cannot rollback"
    return 1
  fi
  log "Rolling back ${service} to ${previous_image}..."
  docker pull "$previous_image" 2>/dev/null || true
  API_IMAGE="$previous_image" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
    up -d --force-recreate --no-deps "$service" 2>/dev/null || true
  log "Rollback initiated for ${service}"
}

# ---------------------------------------------------------------------------
# Database migrations — apply pending Prisma migrations before the API boots.
# Gated on the api service (it owns the schema); `migrate deploy` is idempotent.
# Uses the dedicated migrate image (Dockerfile `builder` target) because the
# runtime image is node-slim with no bun/prisma CLI and no migrations folder.
# ---------------------------------------------------------------------------
run_db_migrations() {
  if ! is_changed "api"; then
    log "Skipping DB migrations (api not in this deploy)"
    return 0
  fi

  log_header "Database Migrations"
  log "Applying Prisma migrations using image: ${MIGRATE_IMAGE}"

  if docker run --rm \
      --user root \
      -e HOME=/tmp \
      --env-file "$ENV_FILE" \
      -w /app/apps/api \
      "$MIGRATE_IMAGE" \
      bunx prisma migrate deploy; then
    log "Prisma migrations applied (or already up to date)"
    return 0
  fi

  log "FATAL: prisma migrate deploy failed"
  return 1
}

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------
deploy_service() {
  local service="$1"
  local previous_image
  previous_image=$(get_previous_image "$service")
  [ -n "$previous_image" ] && log "  ${service} current image: ${previous_image}"

  remove_conflicting_container "$service"

  log "Deploying ${service}..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate --no-deps "$service"

  if wait_healthy "$service"; then
    DEPLOYED_SERVICES+=("$service")
    return 0
  fi

  log "FAILED: ${service} — rolling back"
  rollback_service "$service" "$previous_image"
  FAILED_SERVICES+=("$service")
  return 1
}

print_summary() {
  log_header "Deployment Summary"
  [ ${#DEPLOYED_SERVICES[@]} -gt 0 ] && log "Deployed: ${DEPLOYED_SERVICES[*]}"
  [ ${#FAILED_SERVICES[@]} -gt 0 ] && log "FAILED (rolled back): ${FAILED_SERVICES[*]}"
}

write_github_step_summary() {
  [ -z "${GITHUB_STEP_SUMMARY:-}" ] && return 0
  {
    echo "## API Deployment"
    echo ""
    echo "| Service | Status |"
    echo "|---------|--------|"
    for s in "${DEPLOYED_SERVICES[@]:-}"; do [ -n "$s" ] && echo "| ${s} | deployed |"; done
    for s in "${FAILED_SERVICES[@]:-}"; do [ -n "$s" ] && echo "| ${s} | **FAILED** (rolled back) |"; done
    echo ""
    echo "**Image tag:** \`${IMAGE_TAG:-unknown}\`"
    echo "**Commit:** \`${GITHUB_SHA:-unknown}\`"
    echo "**Time:** $(date -u)"
  } >> "$GITHUB_STEP_SUMMARY"
}

run_deploy() {
  if [ ${#CHANGED_SERVICES[@]} -eq 0 ]; then
    log "No services to deploy"
    exit 0
  fi

  log_header "${DEPLOY_HEADER}"
  log "Services to deploy: ${CHANGED_SERVICES[*]}"
  log "Runtime image: ${API_IMAGE}"

  # 0. Hydrate env from SSM (writes ./.env.production via the instance role).
  log_header "SSM Env Hydration"
  ./docker/render-ssm-env.sh "${DEPLOY_ENV}"
  if [ ! -f "$ENV_FILE" ]; then
    log "ERROR: ${ENV_FILE} missing after SSM hydration"
    exit 1
  fi

  # 1. Authenticate to ghcr so the host can pull the private image.
  log_header "Registry Login"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-shipshitgames}" --password-stdin
    log "Logged into ghcr.io"
  else
    log "GITHUB_TOKEN not set — assuming the host is already logged in"
  fi

  # 2. Pull the images this deploy needs.
  log_header "Pulling Images"
  reclaim_docker_space
  docker pull "$API_IMAGE"
  if is_changed "api"; then
    docker pull "$MIGRATE_IMAGE"
  fi

  # 3. Migrations before the container starts serving.
  run_db_migrations || { log "FATAL: DB migrations failed — aborting deploy"; exit 1; }

  # 4. Deploy each changed service.
  log_header "Deploying Services"
  for service in "${CHANGED_SERVICES[@]}"; do
    deploy_service "$service" || { log "FATAL: ${service} failed — aborting deploy"; print_summary; write_github_step_summary; exit 1; }
  done

  # 5. Final external health check on the published port.
  if is_changed "api"; then
    log_header "Final API Verification"
    for i in $(seq 1 10); do
      if curl -sf --max-time 10 "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
        log "api.shipshit.games is healthy (HTTP check passed)"
        break
      fi
      [ "$i" -eq 10 ] && log "WARNING: API HTTP health check did not pass after 10 attempts"
      sleep 5
    done
  fi

  # 6. Cleanup + summary.
  log_header "Docker Cleanup"
  docker image prune -f --filter "until=24h" 2>&1 || true

  print_summary
  write_github_step_summary

  if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
    log "Deployment completed with failures"
    exit 1
  fi
  log "Deployment completed successfully"
  exit 0
}
