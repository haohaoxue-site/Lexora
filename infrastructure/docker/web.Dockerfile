FROM node:24-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

RUN corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --filter @haohaoxue/lexora-web... --frozen-lockfile

COPY packages/contracts packages/contracts
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm --filter @haohaoxue/lexora-web build

FROM nginx:1.30-alpine

COPY infrastructure/docker/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
