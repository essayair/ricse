FROM node:22-bookworm-slim AS build

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_VERSION=10.33.4

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install --global "pnpm@${PNPM_VERSION}" --registry="${NPM_REGISTRY}"
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm config set registry "${NPM_REGISTRY}" \
  && pnpm install --frozen-lockfile --filter @ricse/web...

COPY apps/web apps/web
COPY packages/shared-types packages/shared-types

RUN pnpm --filter @ricse/web build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

WORKDIR /app

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3001

CMD ["node", "apps/web/server.js"]
