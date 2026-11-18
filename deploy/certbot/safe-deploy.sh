#!/usr/bin/env bash
set -euo pipefail
# 复用现有 RICSE 证书同步逻辑。非 RICSE lineage 不会复制到共享目录。
COPY_HOOK=/etc/letsencrypt/renewal-hooks/deploy/10-ricse-cert-copy
if [[ -x "${COPY_HOOK}" ]]; then "${COPY_HOOK}"; fi
# standalone 的 post-hook 会启动 Nginx；webroot 则平滑重载，不停站。
if systemctl is-active --quiet nginx; then
  nginx -t
  systemctl reload nginx
fi
