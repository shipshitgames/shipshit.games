#!/bin/bash
# Production deploy orchestration for api.shipshit.games.
# Runs ON the EC2 host via a single SSH session from GitHub Actions.
#
# Usage: ./docker/deploy-production.sh <space-separated services>
# Example: ./docker/deploy-production.sh api
#
# The CI job exports IMAGE_TAG (=github.sha), GITHUB_TOKEN, GITHUB_ACTOR,
# SSM_PARAMETER_PATH_PREFIX and AWS_REGION before invoking this over SSH.

set -euo pipefail

COMPOSE_FILE="docker/docker-compose.production.yml"
ENV_FILE=".env.production"
DEPLOY_ENV="production"
CONTAINER_PREFIX="shipshit"
DEPLOY_HEADER="Production Deployment — api.shipshit.games"

REGISTRY="ghcr.io"
IMAGE_REPO="shipshitgames/shipshitgames"
# Exported so docker-compose.production.yml resolves ${API_IMAGE} to this exact
# tag, and so rollback_service can pin a previous tag.
export IMAGE_TAG="${IMAGE_TAG:-latest}"
export API_IMAGE="${REGISTRY}/${IMAGE_REPO}/api:${IMAGE_TAG}"
export MIGRATE_IMAGE="${REGISTRY}/${IMAGE_REPO}/api-migrate:${IMAGE_TAG}"

# Production health-check tuning: fail fast.
WAIT_RETRIES=20
WAIT_INTERVAL=3
WAIT_START_DELAY=5

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=docker/deploy-common.sh
source "${SCRIPT_DIR}/deploy-common.sh"

run_deploy
