# 环境变量

环境变量集中定义实例的数据库、缓存、存储、登录和系统安全配置。

## 数据库与缓存

| 变量 | 说明 |
| --- | --- |
| `POSTGRES_DB` | PostgreSQL 数据库名。 |
| `POSTGRES_USER` | PostgreSQL 用户名。 |
| `POSTGRES_PASSWORD` | PostgreSQL 密码。 |
| `DATABASE_URL` | API、迁移和协作服务使用的数据库连接串。 |
| `REDIS_URL` | API、协作服务和 Agent 使用的 Redis 地址。 |

## 系统安全

| 变量 | 说明 |
| --- | --- |
| `APP_SECRET` | API 加密和签名相关的根密钥，必须使用高强度随机值。 |
| `SYSTEM_ADMIN` | 初始系统管理员标识。 |

`APP_SECRET` 不应在重启或升级时随意变化，否则可能影响已签发凭据或加密数据。

## 登录与 OAuth

| 变量 | 说明 |
| --- | --- |
| `OAUTH_PROXY_URL` | OAuth 代理地址，可为空。 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth 配置。 |
| `LINUX_DO_CLIENT_ID` / `LINUX_DO_CLIENT_SECRET` | Linux Do OAuth 配置。 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 配置。 |

未配置的 OAuth 服务不会作为可用登录方式展示。

## 对象存储

| 变量 | 说明 |
| --- | --- |
| `STORAGE_ENDPOINT` | S3 兼容对象存储地址。 |
| `STORAGE_ACCESS_KEY` | 对象存储访问密钥 ID。 |
| `STORAGE_SECRET_KEY` | 对象存储访问密钥。 |

开发和生产 compose 默认使用 RustFS。也可以替换为其他 S3 兼容服务，但需要保证访问地址和凭据正确。

## 服务间地址

`API_INTERNAL_URL` 用于 collab 和 agent 调用 API 内部接口。它应是 API 服务 origin，不包含 `/api`。

生产 compose 内部默认使用：

```txt
API_INTERNAL_URL=http://api:3000
```
