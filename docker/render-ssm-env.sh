#!/bin/bash
# Render the deploy-time env file from AWS SSM Parameter Store.
#
# Mirrors genfeed.ai/docker/render-ssm-env.sh, trimmed for shipshit's single
# `api` service: it writes ONE root env file (.env.production); there are no
# per-service override files to render.
#
# Intended to run ON the EC2 host, which carries an instance role granting
# ssm:GetParametersByPath on ${SSM_PARAMETER_PATH_PREFIX}/<env>/*. The CI runner
# never reads SSM — it only SSHes in and invokes the deploy script, which calls
# this. That is what keeps AWS credentials off GitHub Actions entirely.
#
# Usage: ./docker/render-ssm-env.sh production

set -euo pipefail

DEPLOY_ENV="${1:-}"
SSM_PARAMETER_PATH_PREFIX="${SSM_PARAMETER_PATH_PREFIX:-/shipshit}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV_FILE="${ROOT_DIR}/.env.${DEPLOY_ENV}"

if [ -z "${DEPLOY_ENV}" ]; then
  echo "Usage: ./docker/render-ssm-env.sh <production>" >&2
  exit 1
fi

case "${DEPLOY_ENV}" in
  production) ;;
  *)
    echo "Unsupported deploy environment: ${DEPLOY_ENV}" >&2
    exit 1
    ;;
esac

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    log "ERROR: required command not found: ${command_name}"
    exit 1
  fi
}

# Resolve the AWS region from the environment, the CLI config, or IMDSv2 — in
# that order — so the script works whether or not AWS_REGION was exported.
resolve_aws_region() {
  if [ -n "${AWS_REGION:-}" ]; then
    export AWS_DEFAULT_REGION="${AWS_REGION}"
    return 0
  fi

  if [ -n "${AWS_DEFAULT_REGION:-}" ]; then
    export AWS_REGION="${AWS_DEFAULT_REGION}"
    return 0
  fi

  local configured_region
  configured_region="$(aws configure get region 2>/dev/null || true)"
  if [ -n "${configured_region}" ]; then
    export AWS_REGION="${configured_region}"
    export AWS_DEFAULT_REGION="${configured_region}"
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    log "ERROR: AWS region is not configured and curl is unavailable for IMDS lookup"
    exit 1
  fi

  local token
  token="$(
    curl -fsS -X PUT \
      --connect-timeout 1 --max-time 2 \
      "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
      2>/dev/null || true
  )"

  if [ -z "${token}" ]; then
    log "ERROR: AWS region is not configured and IMDSv2 token lookup failed"
    exit 1
  fi

  local identity
  identity="$(
    curl -fsS \
      --connect-timeout 1 --max-time 2 \
      -H "X-aws-ec2-metadata-token: ${token}" \
      "http://169.254.169.254/latest/dynamic/instance-identity/document" \
      2>/dev/null || true
  )"

  local region
  region="$(printf '%s\n' "${identity}" | sed -n 's/.*"region"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [ -z "${region}" ]; then
    log "ERROR: failed to resolve AWS region from IMDS"
    exit 1
  fi

  export AWS_REGION="${region}"
  export AWS_DEFAULT_REGION="${region}"
}

render_root_env_file() {
  local temp_file
  temp_file="$(mktemp "${ROOT_ENV_FILE}.tmp.XXXXXX")"

  {
    printf '%s\n' "# Generated from AWS SSM Parameter Store for ${DEPLOY_ENV}."
    printf '%s\n' "# Parameter path: ${SSM_PARAMETER_PATH_PREFIX}/${DEPLOY_ENV}"
    printf '%s\n' "# This file is recreated on every deploy — do not edit by hand."
    printf '%s\n' ""

    for key in $(printf '%s\n' "${!SSM_VALUES[@]}" | sort); do
      printf '%s=%s\n' "${key}" "${SSM_VALUES[${key}]}"
    done
  } > "${temp_file}"

  chmod 600 "${temp_file}"
  mv "${temp_file}" "${ROOT_ENV_FILE}"
}

require_command aws
resolve_aws_region

declare -A SSM_VALUES=()
SSM_PATH="${SSM_PARAMETER_PATH_PREFIX}/${DEPLOY_ENV}"

log "Fetching SSM parameters from ${SSM_PATH} in ${AWS_REGION}"

PARAMETER_ROWS="$(
  aws ssm get-parameters-by-path \
    --path "${SSM_PATH}" \
    --recursive \
    --with-decryption \
    --region "${AWS_REGION}" \
    --query 'Parameters[].[Name,Value]' \
    --output text
)"

if [ -z "${PARAMETER_ROWS}" ] || [ "${PARAMETER_ROWS}" = "None" ]; then
  log "ERROR: no SSM parameters found under ${SSM_PATH}"
  exit 1
fi

while IFS=$'\t' read -r full_name parameter_value; do
  [ -n "${full_name}" ] || continue

  # A multiline parameter value breaks the tab-separated text framing above:
  # its continuation lines arrive as rows whose first field is not an SSM path.
  # Reject them early — store single-line values in SSM.
  case "${full_name}" in
    /*) ;;
    *)
      log "ERROR: multiline env value detected (row fragment: ${full_name%%=*}) — store single-line values in SSM"
      exit 1
      ;;
  esac

  key="${full_name##*/}"
  if [ -z "${key}" ]; then
    log "ERROR: invalid SSM parameter name: ${full_name}"
    exit 1
  fi

  if [ -n "${SSM_VALUES[${key}]:-}" ]; then
    log "ERROR: duplicate SSM parameter leaf detected for ${key}"
    exit 1
  fi

  SSM_VALUES["${key}"]="${parameter_value}"
done <<< "${PARAMETER_ROWS}"

umask 077
render_root_env_file

log "Rendered ${#SSM_VALUES[@]} env keys from SSM for ${DEPLOY_ENV}"
