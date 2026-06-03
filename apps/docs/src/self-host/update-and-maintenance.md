# 更新与维护

自部署实例需要定期更新镜像、迁移数据库并备份数据。

## 更新流程

推荐流程：

1. 备份 PostgreSQL 数据。
2. 备份对象存储数据。
3. 拉取新镜像。
4. 运行 compose。
5. 等待 `migrate` 完成。
6. 检查 `api`、`collab`、`agent`、`web` 健康状态。

## 数据库迁移

生产 compose 会通过 `migrate` 服务执行 Prisma migration。迁移完成后，`api` 再启动。

不要手动修改已经应用过的 migration 文件。需要变更数据库结构时，应通过新的向前迁移完成。

## 备份建议

至少备份：

- PostgreSQL volume。
- RustFS 或其他对象存储数据。
- 部署 `.env` 文件。

不要把含密钥的 `.env` 上传到公开仓库。

## 日志

生产 compose 使用本地日志驱动，并限制单文件大小和保留数量。排查问题时先看对应服务日志：

```bash
docker compose -f infrastructure/compose.prod.yml logs api
docker compose -f infrastructure/compose.prod.yml logs collab
docker compose -f infrastructure/compose.prod.yml logs agent
docker compose -f infrastructure/compose.prod.yml logs web
```

## 密钥轮换

模型服务商 API Key 和对象存储密钥可以按服务商侧规则轮换。`APP_SECRET` 属于根密钥，不建议在已有实例中随意更换。
