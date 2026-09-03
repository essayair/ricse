FROM node:22-bookworm-slim AS build

ARG DEBIAN_MIRROR=http://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=http://deb.debian.org/debian-security
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_VERSION=10.33.4

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=development

RUN sed -i \
  "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g; s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
  /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "pnpm@${PNPM_VERSION}" --registry="${NPM_REGISTRY}"
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm config set registry "${NPM_REGISTRY}" \
  && pnpm install --frozen-lockfile --filter @ricse/api...

COPY apps/api apps/api
COPY packages/shared-types packages/shared-types

RUN pnpm --filter @ricse/api prisma:generate
RUN pnpm --filter @ricse/api build

FROM node:22-bookworm-slim AS runtime

ARG DEBIAN_MIRROR=http://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=http://deb.debian.org/debian-security

ENV NODE_ENV=production
ENV PORT=3000

RUN sed -i \
  "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g; s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
  /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/packages/shared-types ./packages/shared-types

USER node
EXPOSE 3000

CMD ["node", "apps/api/dist/src/main.js"]
