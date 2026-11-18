#!/usr/bin/env bash
# 每张证书分别续期：webroot 不停 Nginx，standalone 只在自身续期时停/启。
set -uo pipefail
CERTBOT_BIN="${CERTBOT_BIN:-/usr/bin/certbot}"
RENEWAL_DIR="${RENEWAL_DIR:-/etc/letsencrypt/renewal}"
DEPLOY_HOOK="${DEPLOY_HOOK:-/usr/local/libexec/ricse-cert-deploy}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-/usr/bin/systemctl}"
status=0
shopt -s nullglob
for config in "${RENEWAL_DIR}"/*.conf; do
  name="$(basename "${config}" .conf)"
  authenticator="$(awk -F ' *= *' '$1 == "authenticator" {print $2; exit}' "${config}")"
  args=(renew --cert-name "${name}" --noninteractive --no-random-sleep-on-renew --no-directory-hooks --deploy-hook "${DEPLOY_HOOK}")
  case "${authenticator}" in
    webroot|nginx) ;;
    standalone)
      args+=(--pre-hook "${SYSTEMCTL_BIN} stop nginx" --post-hook "${SYSTEMCTL_BIN} start nginx")
      ;;
    *) printf 'Unsupported certificate authenticator: %s (%s)\n' "${name}" "${authenticator}" >&2; status=1; continue ;;
  esac
  if ! "${CERTBOT_BIN}" "${args[@]}" "$@"; then
    printf 'Certificate renewal failed: %s\n' "${name}" >&2
    status=1
  fi
done
exit "${status}"
