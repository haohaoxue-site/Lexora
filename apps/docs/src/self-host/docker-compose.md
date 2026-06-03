# Docker Compose 部署

SamePage AI 推荐使用 Docker Compose 部署。

## 服务组成

生产部署包含以下核心服务：

- `postgres`：PostgreSQL 数据库。
- `redis`：运行事件、队列、锁和协作权限失效通知。
- `rustfs`：S3 兼容对象存储，用于图片和附件。
- `migrate`：启动前执行 Prisma migration。
- `api`：NestJS API 服务，拥有产品语义、权限、审计和内部接口。
- `collab`：Hocuspocus / Yjs 协作服务，负责实时文档连接。
- `agent`：LangGraph / LangChain AI 运行服务。
- `web`：前端静态资源和反向代理入口。

## 准备环境变量

复制 `infrastructure/.env.example` 为部署环境使用的 `.env` 文件，并填写数据库、Redis、对象存储、登录和系统密钥。

至少需要准备：

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `APP_SECRET`
- `SYSTEM_ADMIN`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`

## 启动

在仓库根目录运行：

```bash
docker compose -f infrastructure/compose.prod.yml --env-file infrastructure/.env up -d
```

如果你使用自己的部署目录，请确保 compose 文件和 `.env` 路径对应。

## 检查服务

启动后检查容器状态：

```bash
docker compose -f infrastructure/compose.prod.yml ps
```

`api`、`collab`、`agent` 和 `web` 都应进入健康状态。首次启动时，`migrate` 会在数据库迁移完成后退出。

## 访问实例

默认生产 compose 将 Web 暴露到宿主机 `80` 端口。建议在公网环境前面再接入 HTTPS 反向代理。
