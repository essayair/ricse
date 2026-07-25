#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

export CI="${CI:-true}"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
