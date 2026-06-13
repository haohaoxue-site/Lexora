# Storage and Dependencies

A self-hosted Lexora instance depends on PostgreSQL, Redis, and object storage.

## PostgreSQL

PostgreSQL is the persistence source of truth for users, workspaces, document metadata, current read projections, historical versions, chat records, AI configuration, and audit data.

Do not delete the PostgreSQL volume without a backup.

## Redis

Redis supports runtime behavior, including:

- Agent commands and run events.
- Multi-replica locks.
- Collaboration permission invalidation messages.
- Background task coordination.

Redis is not the final business data source, but Redis outages affect AI runs, collaboration notifications, and some background tasks.

## Object Storage

Images and attachments are stored in S3-compatible object storage. Document content stores stable asset identities; runtime code resolves access URLs according to permissions.

## Service Dependencies

- `api` depends on PostgreSQL, Redis, and object storage.
- `collab` depends on API, PostgreSQL, and Redis.
- `agent` depends on API and Redis, and uses the database as checkpointer storage.
- `web` depends on API and collab.

If a service fails to start, check its dependencies first.
