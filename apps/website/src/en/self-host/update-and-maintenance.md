# Updates and Maintenance

Self-hosted instances should regularly update images, run migrations, and back up data.

## Update Flow

Recommended flow:

1. Back up PostgreSQL data.
2. Back up object storage data.
3. Stop the current `web`, `agent`, and `api` application containers.
4. Pull new images.
5. Start compose with `--remove-orphans`.
6. Wait for `migrate` to complete.
7. Check `api`, `agent`, and `web` health.

```bash
docker compose -f infrastructure/compose.prod.yml --env-file infrastructure/.env stop web agent api
docker compose -f infrastructure/compose.prod.yml --env-file infrastructure/.env pull
docker compose -f infrastructure/compose.prod.yml --env-file infrastructure/.env up -d --remove-orphans
```

## Database Migrations

Production compose runs Prisma migrations through the `migrate` service. The API starts after migration completes.

Do not manually edit migration files that have already been applied. Database changes should be added through new forward migrations.

## Backups

At minimum, back up:

- PostgreSQL volume.
- RustFS or other object storage data.
- Deployment `.env` file.

Never upload secret-bearing `.env` files to public repositories.

## Logs

Production compose uses local logs with file size and retention limits. Start troubleshooting with service logs:

```bash
docker compose -f infrastructure/compose.prod.yml logs api
docker compose -f infrastructure/compose.prod.yml logs agent
docker compose -f infrastructure/compose.prod.yml logs web
```

## Key Rotation

Model provider API keys and object storage credentials can be rotated according to provider rules. `APP_SECRET` is a root secret and should not be changed casually on an existing instance.
