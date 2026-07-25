#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env.staging}"
COMPOSE_ARGS=(
  --env-file "${ENV_FILE}"
  -f "${DEPLOY_DIR}/docker-compose.staging.yml"
)
HTTPS_ARGUMENT=false
RUN_SEED=false

for argument in "$@"; do
  case "${argument}" in
    --https) HTTPS_ARGUMENT=true ;;
    --seed) RUN_SEED=true ;;
    *)
      echo "未知参数：${argument}；仅支持 --https 和 --seed。" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "缺少环境变量文件：${ENV_FILE}" >&2
  echo "请复制 deploy/.env.staging.example 并填写真实配置。" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

ENABLE_HTTPS="${ENABLE_HTTPS:-false}"
if [[ "${HTTPS_ARGUMENT}" == "true" ]]; then
  ENABLE_HTTPS=true
fi

if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  if [[ ! -f "${DEPLOY_DIR}/certs/fullchain.pem" || ! -f "${DEPLOY_DIR}/certs/privkey.pem" ]]; then
    echo "缺少 HTTPS 证书：deploy/certs/fullchain.pem 或 deploy/certs/privkey.pem" >&2
    exit 1
  fi
  COMPOSE_ARGS+=(-f "${DEPLOY_DIR}/docker-compose.https.yml")
fi

docker compose "${COMPOSE_ARGS[@]}" config >/dev/null
docker compose "${COMPOSE_ARGS[@]}" build
docker compose "${COMPOSE_ARGS[@]}" up -d postgres redis minio
docker compose "${COMPOSE_ARGS[@]}" run --rm api \
  ./apps/api/node_modules/.bin/prisma migrate deploy \
  --schema apps/api/prisma/schema.prisma
if [[ "${RUN_SEED}" == "true" ]]; then
  docker compose "${COMPOSE_ARGS[@]}" run --rm api \
    node apps/api/dist/prisma/seed.js
fi
docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans
docker compose "${COMPOSE_ARGS[@]}" ps

echo "RICSE 测试环境部署完成。"
