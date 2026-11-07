#!/usr/bin/env bash

# 由 deploy.sh / release.sh 在新镜像就绪、数据库备份完成后调用。
# 此迁移删除旧字段：旧 API 必须先退出，迁移成功后不可单独回退旧应用。
run_database_migrations() {
  INVOICE_SCHEMA_CUTOVER=false
  local legacy_columns
  legacy_columns="$(docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
      psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -At -v ON_ERROR_STOP=1 \
      -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoice_records' AND column_name = 'settlementId');")" || return 1
  if [[ "${legacy_columns}" == "t" ]]; then
    INVOICE_SCHEMA_CUTOVER=true
    echo "发票结构升级：暂停旧 API/Web，防止迁移期间继续读写旧字段。"
    docker compose "${COMPOSE_ARGS[@]}" stop -t 30 api web || return 1
  fi

  if ! docker compose "${COMPOSE_ARGS[@]}" run --rm api \
    ./apps/api/node_modules/.bin/prisma migrate deploy \
    --schema apps/api/prisma/schema.prisma; then
    echo "数据库迁移失败，停止发布；请核查迁移与备份后恢复服务，不自动切换应用。" >&2
    return 1
  fi
}
