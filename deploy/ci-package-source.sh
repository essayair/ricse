#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

SOURCE_TAG="${SOURCE_TAG:-$(git rev-parse --short=12 HEAD)}"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_DIR}/dist}"
package_path="${OUTPUT_DIR}/ricse-source-${SOURCE_TAG}.tgz"

mkdir -p "${OUTPUT_DIR}"
git archive --format=tar.gz --output="${package_path}" HEAD
printf '%s\n' "${SOURCE_TAG}" >"${OUTPUT_DIR}/source-tag.txt"
printf '%s\n' "${package_path}" >"${OUTPUT_DIR}/source-package-path.txt"

echo "源码发布包已生成：${package_path}"
