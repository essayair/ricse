#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "用法：$0 <release-dir> <source-tag>" >&2
  exit 1
fi

RELEASE_DIR="$(cd "$1" && pwd)"
SOURCE_TAG="$2"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/ricse}"
SHARED_ENV="${SHARED_ENV:-${DEPLOY_ROOT}/deploy/.env.staging}"
TARGET_ENV="${RELEASE_DIR}/deploy/.env.staging"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_ROOT}/backups/postgres}"
STATE_DIR="${DEPLOY_ROOT}/releases"

if [[ ! -f "${SHARED_ENV}" ]]; then
  echo "缺少服务器环境配置：${SHARED_ENV}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}" "${STATE_DIR}"
chmod 700 "${BACKUP_DIR}" "${STATE_DIR}"
install -m 600 "${SHARED_ENV}" "${TARGET_ENV}"

set -a
# shellcheck disable=SC1090
source "${TARGET_ENV}"
set +a

: "${POSTGRES_USER:?环境配置缺少 POSTGRES_USER}"
: "${POSTGRES_DB:?环境配置缺少 POSTGRES_DB}"

COMPOSE_ARGS=(
  --env-file "${TARGET_ENV}"
  -f "${RELEASE_DIR}/deploy/docker-compose.staging.yml"
)

if docker compose "${COMPOSE_ARGS[@]}" ps --status running --services | grep -qx postgres; then
  backup_file="${BACKUP_DIR}/ricse-${SOURCE_TAG}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  echo "发布前备份 PostgreSQL：${backup_file}"
  docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip >"${backup_file}"
  chmod 600 "${backup_file}"
fi

cd "${RELEASE_DIR}"
IMAGE_TAG="${SOURCE_TAG}" ./deploy/deploy.sh

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/v1/health >/dev/null \
    && curl -fsS http://127.0.0.1/login >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done

if [[ "${healthy}" != "true" ]]; then
  echo "发布后健康检查失败。" >&2
  exit 1
fi

ln -sfn "${RELEASE_DIR}" "${DEPLOY_ROOT}/current"
echo "源码版本 ${SOURCE_TAG} 发布完成。"
