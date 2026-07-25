#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

: "${API_IMAGE:?请设置 API_IMAGE，例如 registry.cn-hangzhou.aliyuncs.com/ricse/api}"
: "${WEB_IMAGE:?请设置 WEB_IMAGE，例如 registry.cn-hangzhou.aliyuncs.com/ricse/web}"

IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short=12 HEAD)}"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_DIR}/dist}"
DEBIAN_MIRROR="${DEBIAN_MIRROR:-http://mirrors.aliyun.com/debian}"
DEBIAN_SECURITY_MIRROR="${DEBIAN_SECURITY_MIRROR:-http://mirrors.aliyun.com/debian-security}"

export IMAGE_TAG

./deploy/ci-verify.sh

docker build \
  --build-arg "DEBIAN_MIRROR=${DEBIAN_MIRROR}" \
  --build-arg "DEBIAN_SECURITY_MIRROR=${DEBIAN_SECURITY_MIRROR}" \
  --tag "${API_IMAGE}:${IMAGE_TAG}" \
  --file apps/api/Dockerfile \
  .

docker build \
  --tag "${WEB_IMAGE}:${IMAGE_TAG}" \
  --file apps/web/Dockerfile \
  .

docker push "${API_IMAGE}:${IMAGE_TAG}"
docker push "${WEB_IMAGE}:${IMAGE_TAG}"

OUTPUT_DIR="${OUTPUT_DIR}" ./deploy/package-release.sh

echo "API_IMAGE=${API_IMAGE}"
echo "WEB_IMAGE=${WEB_IMAGE}"
echo "IMAGE_TAG=${IMAGE_TAG}"
