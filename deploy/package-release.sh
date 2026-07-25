#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_DIR}/dist}"

: "${API_IMAGE:?请设置 API_IMAGE}"
: "${WEB_IMAGE:?请设置 WEB_IMAGE}"
: "${IMAGE_TAG:?请设置 IMAGE_TAG}"

mkdir -p "${OUTPUT_DIR}"
package_root="$(mktemp -d)"
trap 'rm -rf "${package_root}"' EXIT

install -d "${package_root}/deploy/nginx"
install -m 755 "${PROJECT_DIR}/deploy/release.sh" "${package_root}/deploy/release.sh"
install -m 644 "${PROJECT_DIR}/deploy/docker-compose.staging.yml" "${package_root}/deploy/docker-compose.staging.yml"
install -m 644 "${PROJECT_DIR}/deploy/docker-compose.https.yml" "${package_root}/deploy/docker-compose.https.yml"
install -m 644 "${PROJECT_DIR}/deploy/nginx/http.conf.template" "${package_root}/deploy/nginx/http.conf.template"
install -m 644 "${PROJECT_DIR}/deploy/nginx/https.conf.template" "${package_root}/deploy/nginx/https.conf.template"

{
  printf 'API_IMAGE=%q\n' "${API_IMAGE}"
  printf 'WEB_IMAGE=%q\n' "${WEB_IMAGE}"
  printf 'IMAGE_TAG=%q\n' "${IMAGE_TAG}"
} >"${package_root}/deploy/.release-image.env"
chmod 600 "${package_root}/deploy/.release-image.env"

package_path="${OUTPUT_DIR}/ricse-release-${IMAGE_TAG}.tgz"
tar -C "${package_root}" -czf "${package_path}" deploy
printf '%s\n' "${package_path}" >"${OUTPUT_DIR}/release-package-path.txt"

echo "发布包已生成：${package_path}"
