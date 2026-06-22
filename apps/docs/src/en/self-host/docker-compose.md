# Docker Compose

Lexora recommends Docker Compose for self-hosted deployment.

## Services

Production deployment includes:

- `postgres`: PostgreSQL database.
- `redis`: runtime events, queues, locks, and collaboration invalidation messages.
- `rustfs`: S3-compatible object storage for images and attachments.
- `migrate`: runs Prisma migrations before the API starts.
- `api`: NestJS API service for product semantics, permissions, audit, and internal APIs.
- `collab`: Hocuspocus / Yjs collaboration service for real-time document connections.
- `agent`: LangGraph / LangChain AI runtime service.
- `web`: static frontend and reverse proxy entry.

## Prepare Environment Variables

Copy `infrastructure/.env.example` to the `.env` file used by your deployment and fill database, Redis, storage, login, and security values.

At minimum, configure:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `APP_SECRET`
- `APP_INTERNAL_KEY`
- `SYSTEM_ADMIN`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`

## Start

From the repository root:

```bash
docker compose -f infrastructure/compose.prod.yml --env-file infrastructure/.env up -d
```

If you deploy from another directory, make sure compose and `.env` paths match.

## Check Services

Check container status:

```bash
docker compose -f infrastructure/compose.prod.yml ps
```

`api`, `collab`, `agent`, and `web` should become healthy. On first start, `migrate` exits after database migration completes.

## Access

The production compose exposes Web on host port `80`. Use an HTTPS reverse proxy in public deployments.
