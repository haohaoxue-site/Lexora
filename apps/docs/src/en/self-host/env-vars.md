# Environment Variables

Environment variables define database, cache, storage, login, and system security settings.

## Database and Cache

| Variable | Description |
| --- | --- |
| `POSTGRES_DB` | PostgreSQL database name. |
| `POSTGRES_USER` | PostgreSQL username. |
| `POSTGRES_PASSWORD` | PostgreSQL password. |
| `DATABASE_URL` | Database connection string used by API, migrations, and collaboration service. |
| `REDIS_URL` | Redis URL used by API, collaboration service, and Agent. |

## System Security

| Variable | Description |
| --- | --- |
| `APP_SECRET` | Root signing and encryption secret. Use a strong random value. |
| `APP_INTERNAL_KEY` | Internal service key shared by API, Collab, and Agent. Production deployments must use a strong random value; development can use the default. |
| `SYSTEM_ADMIN` | Initial system administrator identifier. |

Do not change `APP_SECRET` casually on an existing instance, because it may affect issued credentials or encrypted data.

## Login and OAuth

| Variable | Description |
| --- | --- |
| `OAUTH_PROXY_URL` | Optional OAuth proxy URL. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth configuration. |
| `LINUX_DO_CLIENT_ID` / `LINUX_DO_CLIENT_SECRET` | Linux Do OAuth configuration. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth configuration. |

Unconfigured OAuth providers are not displayed as available login methods.

## Object Storage

| Variable | Description |
| --- | --- |
| `STORAGE_ENDPOINT` | S3-compatible object storage endpoint. |
| `STORAGE_ACCESS_KEY` | Object storage access key ID. |
| `STORAGE_SECRET_KEY` | Object storage secret key. |

Development and production compose files use RustFS by default. Other S3-compatible services can be used if endpoint and credentials are correct.

## Internal Service URL

`API_INTERNAL_URL` is used by collab and agent services to call API internal endpoints. It must be the API origin and must not include `/api`.

Production compose uses:

```txt
API_INTERNAL_URL=http://api:3000
```
