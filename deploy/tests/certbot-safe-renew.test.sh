#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "${TMP}/renewal"
printf 'authenticator = webroot\n' >"${TMP}/renewal/api.conf"
printf 'authenticator = standalone\n' >"${TMP}/renewal/data-v.conf"
printf 'authenticator = webroot\n' >"${TMP}/renewal/website.conf"
cat >"${TMP}/certbot" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${CALL_LOG}"
if [[ "${FAIL_NAME:-}" && "$*" == *"--cert-name ${FAIL_NAME} "* ]]; then exit 1; fi
MOCK
chmod +x "${TMP}/certbot"
export CALL_LOG="${TMP}/calls" CERTBOT_BIN="${TMP}/certbot" RENEWAL_DIR="${TMP}/renewal" DEPLOY_HOOK=/mock/deploy SYSTEMCTL_BIN=/mock/systemctl
bash "${ROOT}/deploy/certbot/safe-renew.sh" --dry-run
[[ "$(wc -l <"${CALL_LOG}" | tr -d ' ')" == 3 ]]
grep -- '--cert-name api ' "${CALL_LOG}" | grep -q -- '--no-directory-hooks'
! grep -- '--cert-name api ' "${CALL_LOG}" | grep -q -- '--pre-hook'
! grep -- '--cert-name website ' "${CALL_LOG}" | grep -q -- '--pre-hook'
grep -- '--cert-name data-v ' "${CALL_LOG}" | grep -q -- '--pre-hook /mock/systemctl stop nginx --post-hook /mock/systemctl start nginx'
grep -q -- '--dry-run' "${CALL_LOG}"
export FAIL_NAME=api
if bash "${ROOT}/deploy/certbot/safe-renew.sh" 2>/dev/null; then exit 1; fi
[[ "$(wc -l <"${CALL_LOG}" | tr -d ' ')" == 6 ]]
printf 'PASS: per-lineage hooks, webroot no-stop, standalone isolation, dry-run and failure reporting\n'
