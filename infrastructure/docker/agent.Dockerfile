FROM node:24-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

RUN corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --filter @haohaoxue/samepage-agent... --frozen-lockfile

COPY packages/contracts packages/contracts
COPY packages/shared packages/shared
COPY apps/agent apps/agent

RUN pnpm --filter @haohaoxue/samepage-agent build

FROM node:24-slim

ENV PNPM_HOME=/pnpm
ENV NODE_ENV=production
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

RUN corepack enable \
  && corepack prepare pnpm@10.33.0 --activate \
  && mkdir -p /app/apps/agent /pnpm \
  && chown -R node:node /app /pnpm

ENV PATH="/app/apps/agent/node_modules/.bin:/app/node_modules/.bin:${PNPM_HOME}:${PATH}"

WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node apps/agent/package.json apps/agent/package.json

USER node

RUN pnpm install --filter @haohaoxue/samepage-agent --prod --frozen-lockfile \
  && rm -rf apps/agent/node_modules/@haohaoxue

COPY --chown=node:node --from=build /workspace/apps/agent/dist /app/apps/agent/dist

WORKDIR /app/apps/agent

EXPOSE 4200

CMD ["node", "dist/main.mjs"]
