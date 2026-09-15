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
SHARED_CERT_DIR="${SHARED_CERT_DIR:-${DEPLOY_ROOT}/deploy/certs}"
TARGET_CERT_DIR="${RELEASE_DIR}/deploy/certs"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_ROOT}/backups/postgres}"
STATE_DIR="${DEPLOY_ROOT}/releases"
HOST_NGINX_TEMPLATE="${RELEASE_DIR}/deploy/nginx/host-edge.conf.template"
HOST_NGINX_CONFIG="${HOST_NGINX_CONFIG:-/etc/nginx/conf.d/ricse.conf}"
CERTBOT_HOOK_SOURCE="${RELEASE_DIR}/deploy/certbot"
HOST_NGINX_BACKUP_DIR="${DEPLOY_ROOT}/backups/nginx"

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

RELEASE_KEEP_COUNT="${RELEASE_KEEP_COUNT:-5}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP:-10}"
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-4096}"
JOURNAL_MAX_SIZE="${JOURNAL_MAX_SIZE:-500M}"
DOCKER_IMAGE_PRUNE_UNTIL="${DOCKER_IMAGE_PRUNE_UNTIL:-168h}"

DEPLOY_ROOT="${DEPLOY_ROOT}" \
RELEASE_DIR="${RELEASE_DIR}" \
BACKUP_DIR="${BACKUP_DIR}" \
RELEASE_KEEP_COUNT="${RELEASE_KEEP_COUNT}" \
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS}" \
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP}" \
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB}" \
JOURNAL_MAX_SIZE="${JOURNAL_MAX_SIZE}" \
DOCKER_IMAGE_PRUNE_UNTIL="${DOCKER_IMAGE_PRUNE_UNTIL}" \
  "${RELEASE_DIR}/deploy/host-maintenance.sh" --preflight

: "${POSTGRES_USER:?环境配置缺少 POSTGRES_USER}"
: "${POSTGRES_DB:?环境配置缺少 POSTGRES_DB}"

ENABLE_HTTPS="${ENABLE_HTTPS:-false}"
if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  if [[ ! -f "${SHARED_CERT_DIR}/fullchain.pem" || ! -f "${SHARED_CERT_DIR}/privkey.pem" ]]; then
    echo "缺少服务器共享证书：${SHARED_CERT_DIR}/fullchain.pem 或 privkey.pem" >&2
    exit 1
  fi
  install -d -m 700 "${TARGET_CERT_DIR}"
  install -m 600 "${SHARED_CERT_DIR}/fullchain.pem" "${TARGET_CERT_DIR}/fullchain.pem"
  install -m 600 "${SHARED_CERT_DIR}/privkey.pem" "${TARGET_CERT_DIR}/privkey.pem"

  if [[ ! -f "${HOST_NGINX_TEMPLATE}" ]]; then
    echo "缺少主机 Nginx 配置模板：${HOST_NGINX_TEMPLATE}" >&2
    exit 1
  fi
  if [[ ! "${PUBLIC_HOST}" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "PUBLIC_HOST 格式无效：${PUBLIC_HOST}" >&2
    exit 1
  fi
  install -d -m 700 "${HOST_NGINX_BACKUP_DIR}"
  if [[ -f "${HOST_NGINX_CONFIG}" ]]; then
    cp -p "${HOST_NGINX_CONFIG}" \
      "${HOST_NGINX_BACKUP_DIR}/ricse.conf.$(date -u +%Y%m%dT%H%M%SZ)"
  fi
  sed "s/__PUBLIC_HOST__/${PUBLIC_HOST}/g" \
    "${HOST_NGINX_TEMPLATE}" >"${HOST_NGINX_CONFIG}"
  install -d -m 755 \
    /etc/letsencrypt/renewal-hooks/pre \
    /etc/letsencrypt/renewal-hooks/deploy \
    /etc/letsencrypt/renewal-hooks/post
  install -m 755 "${CERTBOT_HOOK_SOURCE}/pre/10-ricse-nginx-stop" \
    /etc/letsencrypt/renewal-hooks/pre/10-ricse-nginx-stop
  install -m 755 "${CERTBOT_HOOK_SOURCE}/deploy/10-ricse-cert-copy" \
    /etc/letsencrypt/renewal-hooks/deploy/10-ricse-cert-copy
  install -m 755 "${CERTBOT_HOOK_SOURCE}/post/10-ricse-nginx-start" \
    /etc/letsencrypt/renewal-hooks/post/10-ricse-nginx-start
  nginx -t
fi

COMPOSE_ARGS=(
  --env-file "${TARGET_ENV}"
  -f "${RELEASE_DIR}/deploy/docker-compose.staging.yml"
)
if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  COMPOSE_ARGS+=(-f "${RELEASE_DIR}/deploy/docker-compose.https.yml")
fi

if docker compose "${COMPOSE_ARGS[@]}" ps --status running --services | grep -qx postgres; then
  backup_file="${BACKUP_DIR}/ricse-${SOURCE_TAG}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  backup_tmp="${backup_file}.tmp"
  echo "发布前备份 PostgreSQL：${backup_file}"
  if ! docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip >"${backup_tmp}"; then
    rm -f -- "${backup_tmp}"
    echo "发布前 PostgreSQL 备份失败，已停止发布。" >&2
    exit 1
  fi
  mv "${backup_tmp}" "${backup_file}"
  chmod 600 "${backup_file}"
fi

cd "${RELEASE_DIR}"
IMAGE_TAG="${SOURCE_TAG}" ./deploy/deploy.sh

if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  systemctl enable nginx
  systemctl restart nginx
fi

HEALTH_URL="http://127.0.0.1"
HEALTH_CURL_ARGS=()
if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  : "${PUBLIC_HOST:?HTTPS 环境配置缺少 PUBLIC_HOST}"
  HEALTH_URL="https://${PUBLIC_HOST}"
  HEALTH_CURL_ARGS=(--resolve "${PUBLIC_HOST}:443:127.0.0.1")
fi

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS "${HEALTH_CURL_ARGS[@]}" "${HEALTH_URL}/api/v1/health" >/dev/null \
    && curl -fsS "${HEALTH_CURL_ARGS[@]}" "${HEALTH_URL}/login" >/dev/null; then
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

DEPLOY_ROOT="${DEPLOY_ROOT}" \
RELEASE_DIR="${RELEASE_DIR}" \
BACKUP_DIR="${BACKUP_DIR}" \
RELEASE_KEEP_COUNT="${RELEASE_KEEP_COUNT}" \
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS}" \
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP}" \
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB}" \
JOURNAL_MAX_SIZE="${JOURNAL_MAX_SIZE}" \
DOCKER_IMAGE_PRUNE_UNTIL="${DOCKER_IMAGE_PRUNE_UNTIL}" \
  "${RELEASE_DIR}/deploy/host-maintenance.sh" --post-deploy

echo "源码版本 ${SOURCE_TAG} 发布完成。"
