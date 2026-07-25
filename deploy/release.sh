#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env.staging}"
MANIFEST_FILE="${MANIFEST_FILE:-${DEPLOY_DIR}/.release-image.env}"
STATE_DIR="${DEPLOY_DIR}/.release"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups/postgres}"
ENABLE_HTTPS=false

for argument in "$@"; do
  case "${argument}" in
    --https) ENABLE_HTTPS=true ;;
    *)
      echo "未知参数：${argument}；仅支持 --https。" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "缺少环境变量文件：${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "${MANIFEST_FILE}" ]]; then
  echo "缺少流水线镜像清单：${MANIFEST_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
# shellcheck disable=SC1090
source "${MANIFEST_FILE}"
set +a

: "${API_IMAGE:?镜像清单缺少 API_IMAGE}"
: "${WEB_IMAGE:?镜像清单缺少 WEB_IMAGE}"
: "${IMAGE_TAG:?镜像清单缺少 IMAGE_TAG}"
: "${POSTGRES_USER:?环境配置缺少 POSTGRES_USER}"
: "${POSTGRES_DB:?环境配置缺少 POSTGRES_DB}"

COMPOSE_ARGS=(
  --env-file "${ENV_FILE}"
  -f "${DEPLOY_DIR}/docker-compose.staging.yml"
)

if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  if [[ ! -f "${DEPLOY_DIR}/certs/fullchain.pem" || ! -f "${DEPLOY_DIR}/certs/privkey.pem" ]]; then
    echo "缺少 HTTPS 证书：deploy/certs/fullchain.pem 或 deploy/certs/privkey.pem" >&2
    exit 1
  fi
  COMPOSE_ARGS+=(-f "${DEPLOY_DIR}/docker-compose.https.yml")
fi

mkdir -p "${STATE_DIR}" "${BACKUP_DIR}"
chmod 700 "${STATE_DIR}" "${BACKUP_DIR}"

exec 9>"${STATE_DIR}/deploy.lock"
if ! flock -n 9; then
  echo "已有发布任务正在执行，本次发布退出。" >&2
  exit 1
fi

CURRENT_STATE="${STATE_DIR}/current.env"
PREVIOUS_API_IMAGE=""
PREVIOUS_WEB_IMAGE=""
PREVIOUS_IMAGE_TAG=""

if [[ -f "${CURRENT_STATE}" ]]; then
  # shellcheck disable=SC1090
  source "${CURRENT_STATE}"
  PREVIOUS_API_IMAGE="${API_IMAGE:-}"
  PREVIOUS_WEB_IMAGE="${WEB_IMAGE:-}"
  PREVIOUS_IMAGE_TAG="${IMAGE_TAG:-}"

  # 重新载入本次发布清单，避免旧状态覆盖目标版本。
  # shellcheck disable=SC1090
  source "${MANIFEST_FILE}"
  export API_IMAGE WEB_IMAGE IMAGE_TAG
fi

rollback_application() {
  if [[ -z "${PREVIOUS_API_IMAGE}" || -z "${PREVIOUS_WEB_IMAGE}" || -z "${PREVIOUS_IMAGE_TAG}" ]]; then
    echo "没有可用的上一版本，无法自动回退应用镜像。" >&2
    return 0
  fi

  echo "健康检查失败，正在回退到应用版本 ${PREVIOUS_IMAGE_TAG}。" >&2
  API_IMAGE="${PREVIOUS_API_IMAGE}" \
  WEB_IMAGE="${PREVIOUS_WEB_IMAGE}" \
  IMAGE_TAG="${PREVIOUS_IMAGE_TAG}" \
    docker compose "${COMPOSE_ARGS[@]}" up -d api web nginx
}

docker compose "${COMPOSE_ARGS[@]}" config >/dev/null
docker compose "${COMPOSE_ARGS[@]}" pull api web
docker compose "${COMPOSE_ARGS[@]}" up -d postgres redis minio

if docker compose "${COMPOSE_ARGS[@]}" ps --status running --services | grep -qx postgres; then
  backup_file="${BACKUP_DIR}/ricse-${IMAGE_TAG}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  echo "发布前备份 PostgreSQL：${backup_file}"
  docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip >"${backup_file}"
  chmod 600 "${backup_file}"
fi

docker compose "${COMPOSE_ARGS[@]}" run --rm api \
  ./apps/api/node_modules/.bin/prisma migrate deploy \
  --schema apps/api/prisma/schema.prisma

docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans

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
  rollback_application
  exit 1
fi

state_tmp="$(mktemp "${STATE_DIR}/current.env.XXXXXX")"
{
  printf 'API_IMAGE=%q\n' "${API_IMAGE}"
  printf 'WEB_IMAGE=%q\n' "${WEB_IMAGE}"
  printf 'IMAGE_TAG=%q\n' "${IMAGE_TAG}"
} >"${state_tmp}"
chmod 600 "${state_tmp}"
mv "${state_tmp}" "${CURRENT_STATE}"

docker compose "${COMPOSE_ARGS[@]}" ps
echo "RICSE 镜像版本 ${IMAGE_TAG} 发布完成。"
