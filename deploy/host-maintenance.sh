#!/usr/bin/env bash

set -euo pipefail

MODE="${1:---preflight}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/ricse}"
RELEASE_DIR="${RELEASE_DIR:-}"
RELEASE_KEEP_COUNT="${RELEASE_KEEP_COUNT:-5}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP:-10}"
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-4096}"
JOURNAL_MAX_SIZE="${JOURNAL_MAX_SIZE:-500M}"
DOCKER_IMAGE_PRUNE_UNTIL="${DOCKER_IMAGE_PRUNE_UNTIL:-168h}"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_ROOT}/backups/postgres}"

case "${MODE}" in
  --preflight|--post-deploy) ;;
  *)
    echo "未知参数：${MODE}；仅支持 --preflight 和 --post-deploy。" >&2
    exit 1
    ;;
esac

for value_name in RELEASE_KEEP_COUNT BACKUP_RETENTION_DAYS BACKUP_MIN_KEEP MIN_FREE_DISK_MB; do
  value="${!value_name}"
  if [[ ! "${value}" =~ ^[0-9]+$ ]]; then
    echo "${value_name} 必须是非负整数，当前值：${value}" >&2
    exit 1
  fi
done

available_disk_mb() {
  df -Pm "${DEPLOY_ROOT}" | awk 'NR == 2 { print $4 }'
}

prune_releases() {
  [[ -d "${RELEASES_DIR}" ]] || return 0
  local current_release
  current_release="$(readlink -f "${DEPLOY_ROOT}/current" 2>/dev/null || true)"
  mapfile -t releases < <(
    find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
      | sort -rn \
      | cut -d' ' -f2-
  )

  local kept=0
  local path
  for path in "${releases[@]}"; do
    if (( kept < RELEASE_KEEP_COUNT )) || [[ "${path}" == "${current_release}" ]] || [[ -n "${RELEASE_DIR}" && "${path}" == "${RELEASE_DIR}" ]]; then
      ((kept += 1))
      continue
    fi
    echo "清理旧发布目录：${path}"
    rm -rf -- "${path}"
  done
}

prune_backups() {
  [[ -d "${BACKUP_DIR}" ]] || return 0
  mapfile -t backups < <(
    find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'ricse-*.sql.gz' -printf '%T@ %p\n' \
      | sort -rn \
      | cut -d' ' -f2-
  )

  local now
  now="$(date +%s)"
  local index path modified age_days
  for index in "${!backups[@]}"; do
    (( index < BACKUP_MIN_KEEP )) && continue
    path="${backups[index]}"
    modified="$(stat -c %Y "${path}")"
    age_days=$(( (now - modified) / 86400 ))
    if (( age_days > BACKUP_RETENTION_DAYS )); then
      echo "清理过期数据库备份：${path}"
      rm -f -- "${path}"
    fi
  done
}

prune_releases
prune_backups

if command -v journalctl >/dev/null 2>&1; then
  journalctl --vacuum-size="${JOURNAL_MAX_SIZE}" >/dev/null || echo "警告：systemd 日志压缩失败，继续执行磁盘检查。" >&2
fi

if [[ "${MODE}" == "--post-deploy" ]]; then
  docker builder prune -af >/dev/null || echo "警告：Docker 构建缓存清理失败。" >&2
  docker image prune -af --filter "until=${DOCKER_IMAGE_PRUNE_UNTIL}" >/dev/null || echo "警告：Docker 旧镜像清理失败。" >&2
fi

free_mb="$(available_disk_mb)"
if [[ "${MODE}" == "--preflight" && "${free_mb}" -lt "${MIN_FREE_DISK_MB}" ]]; then
  echo "可用空间仅 ${free_mb}MB，执行紧急 Docker 缓存清理。"
  docker builder prune -af >/dev/null || true
  docker image prune -af --filter "until=${DOCKER_IMAGE_PRUNE_UNTIL}" >/dev/null || true
  free_mb="$(available_disk_mb)"
fi

if [[ "${free_mb}" -lt "${MIN_FREE_DISK_MB}" ]]; then
  if [[ "${MODE}" == "--preflight" ]]; then
    echo "可用磁盘空间 ${free_mb}MB，低于发布安全线 ${MIN_FREE_DISK_MB}MB；停止发布，避免损坏数据库。" >&2
    exit 1
  fi
  echo "警告：部署后可用磁盘空间 ${free_mb}MB，低于建议值 ${MIN_FREE_DISK_MB}MB，请尽快扩容或清理。" >&2
fi

echo "主机维护完成：可用磁盘 ${free_mb}MB，发布保留 ${RELEASE_KEEP_COUNT} 个，数据库备份保留 ${BACKUP_RETENTION_DAYS} 天且至少 ${BACKUP_MIN_KEEP} 份。"
