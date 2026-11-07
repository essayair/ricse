#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT}/deploy/migrate-database.sh"
COMPOSE_ARGS=(--project-name test)
POSTGRES_USER=test
POSTGRES_DB=test
EVENTS=""
LEGACY=t
MIGRATE_STATUS=0
docker() {
  case " $* " in
    *" exec "*) printf '%s\n' "${LEGACY}" ;;
    *" stop "*) EVENTS+="stop;" ;;
    *" run "*) EVENTS+="migrate;"; return "${MIGRATE_STATUS}" ;;
    *) echo "Unexpected Docker call: $*" >&2; return 2 ;;
  esac
}
run_database_migrations
[[ "${INVOICE_SCHEMA_CUTOVER}" == true && "${EVENTS}" == 'stop;migrate;' ]]
EVENTS=""; LEGACY=f
run_database_migrations
[[ "${INVOICE_SCHEMA_CUTOVER}" == false && "${EVENTS}" == 'migrate;' ]]
EVENTS=""; LEGACY=t; MIGRATE_STATUS=1
if run_database_migrations; then echo '迁移失败未中止发布' >&2; exit 1; fi
[[ "${EVENTS}" == 'stop;migrate;' ]]
echo '发布迁移保护：3 个场景通过。'
