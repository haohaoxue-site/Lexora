<p align="center">
  <img src="apps/docs/src/public/logo.png" width="88" alt="SamePage AI Logo" />
</p>

<h1 align="center">SamePage AI</h1>

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

<p align="center">
  AI 与协作同在一页。
</p>

<p align="center">
  <a href="https://github.com/haohaoxue-site/SamePage-AI/blob/master/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-2f6f68"></a>
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883">
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-e0234e">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-Agent-1f6feb">
  <img alt="Yjs" src="https://img.shields.io/badge/Yjs-Collaboration-f7b955">
</p>

SamePage AI 是一个面向个人、小团队和社区组织的在线协作文档平台。它把文档编写、AI 对话、多人协作和公开发布放在同一个工作台里，目标是让知识沉淀、协同编辑和 AI 辅助写作自然发生在同一个页面上下文中。

> 项目仍处于开发阶段，协议、数据结构和产品形态会持续调整。

![SamePage AI 界面预览](apps/docs/src/public/ui.png)

## 核心能力

| 能力 | 描述 |
| --- | --- |
| AI 对话 | 模型选择、流式回复、消息分支、失败重试，以及从文档场景带入上下文。 |
| 文档编写 | 页面树、富文本块、表格、代码块、数学公式、历史版本和回收站。 |
| 文档协作 | 指定用户邀请、协作链接、读写权限和子页面授权范围。 |
| 公开发布 | 单页发布和站点发布，站点访问时为 VitePress-Like 风格的页面。 |
| BYOK 模型接入 | 支持平台级或用户级模型服务商，并兼容 OpenAI-Compatible、Anthropic-Compatible 等接口。 |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Web | Vue 3、Vite、Vue Router、Pinia、Element Plus、UnoCSS |
| Editor | Tiptap、ProseMirror、Yjs、Hocuspocus Provider |
| API | NestJS、Fastify、Prisma、PostgreSQL、Redis、BullMQ |
| Collab | Hocuspocus Server、Yjs、Redis 权限失效通知 |
| Agent | LangGraph、LangChain、Postgres Checkpointer、Redis 队列 |
| Contracts | Zod、共享 endpoint registry、领域常量和类型 |
| Infrastructure | Docker Compose、RustFS、Nginx |

## 项目结构

```txt
samepage-ai/
├── apps/
│   ├── web/         # Vue 3 前端应用
│   ├── api/         # NestJS API 服务
│   ├── collab/      # Hocuspocus / Yjs 协作服务
│   ├── agent/       # LangGraph AI 运行服务
│   └── docs/        # 产品文档站点
├── packages/
│   ├── contracts/   # 共享契约层：schema、endpoint、常量、领域类型
│   └── shared/      # 共享函数层
└── infrastructure/  # docker 及环境配置
```

## 本地开发

项目使用 pnpm workspace。

```bash
pnpm install
pnpm dev:infra
cp apps/api/.env.example apps/api/.env
cp apps/collab/.env.example apps/collab/.env
cp apps/agent/.env.example apps/agent/.env
pnpm dev:db:sync
pnpm dev
```

`apps/api/.env` 至少需要补齐 `APP_SECRET`、`SYSTEM_ADMIN`、`STORAGE_ACCESS_KEY` 和 `STORAGE_SECRET_KEY`。

## 许可证

SamePage AI 使用 [AGPL-3.0-only](LICENSE) 许可证。

## 友情链接

- [LINUX DO - 新的理想型社区](https://linux.do/)
