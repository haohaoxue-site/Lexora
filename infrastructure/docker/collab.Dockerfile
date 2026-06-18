FROM node:26-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

RUN npm install --global pnpm@11.5.0 \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/collab/package.json apps/collab/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --filter @haohaoxue/lexora-collab... --frozen-lockfile

COPY packages/contracts packages/contracts
COPY packages/shared packages/shared
COPY apps/collab apps/collab

RUN pnpm --filter @haohaoxue/lexora-collab build

FROM node:26-slim AS production-deps

ENV PNPM_HOME=/pnpm
ENV NODE_ENV=production
ENV PATH="/app/apps/collab/node_modules/.bin:/app/node_modules/.bin:${PNPM_HOME}:${PATH}"
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

RUN npm install --global pnpm@11.5.0 \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/apps/collab /pnpm \
  && chown -R node:node /app /pnpm

WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node apps/collab/package.json apps/collab/package.json
COPY --chown=node:node apps/api/prisma apps/collab/prisma

USER node

RUN pnpm install --filter @haohaoxue/lexora-collab --prod --frozen-lockfile \
  && cd /app/apps/collab \
  && prisma generate --schema prisma \
  && rm -rf /app/apps/collab/prisma /app/apps/collab/node_modules/@haohaoxue

FROM node:26-slim

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/apps/collab \
  && chown -R node:node /app

WORKDIR /app

COPY --chown=node:node --from=production-deps /app/node_modules /app/node_modules
COPY --chown=node:node --from=production-deps /app/apps/collab/node_modules /app/apps/collab/node_modules

COPY --chown=node:node --from=build /workspace/apps/collab/dist /app/apps/collab/dist

USER node

WORKDIR /app/apps/collab

EXPOSE 4100

CMD ["node", "dist/main.mjs"]
