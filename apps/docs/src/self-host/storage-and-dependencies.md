# 存储与服务依赖

SamePage AI 的自部署实例依赖数据库、Redis 和对象存储。

## PostgreSQL

PostgreSQL 是持久化真源，用于保存用户、工作区、文档元数据、当前读模型、历史版本、聊天记录、AI 配置和审计数据。

不要在未备份的情况下删除 PostgreSQL volume。

## Redis

Redis 用于运行时能力，包括：

- Agent command 和运行事件。
- 多副本锁。
- 协作权限失效通知。
- 后台任务协调。

Redis 不是业务数据的最终真源，但 Redis 不可用会影响 AI 运行、协作通知和部分后台任务。

## 对象存储

图片和附件通过 S3 兼容对象存储保存。正文中保存稳定资源身份，访问 URL 由运行时按权限解析。

## 服务间依赖

- `api` 依赖 PostgreSQL、Redis 和对象存储。
- `collab` 依赖 API、PostgreSQL 和 Redis。
- `agent` 依赖 API 和 Redis，并使用数据库作为 checkpointer。
- `web` 依赖 API 和 collab。

如果某个服务启动失败，优先查看它依赖的服务是否健康。
