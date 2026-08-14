<p align="center">
  <img src="apps/docs/src/public/logo.png" width="88" alt="Lexora Logo" />
</p>

<h1 align="center">Lexora 文灵</h1>

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

<p align="center">
  文档与 AI 汇入一个专注、可自部署的个人工作台。
</p>

<p align="center">
  <a href="https://github.com/haohaoxue-site/Lexora/blob/master/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-2f6f68"></a>
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883">
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-e0234e">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-Agent-1f6feb">
  <img alt="Tiptap" src="https://img.shields.io/badge/Tiptap-Editor-f7b955">
</p>

Lexora 是一个面向个人的文档驱动 AI 工作空间。它把文档编写、AI 对话、文档 AI、历史版本和公开发布放在同一个工作台里，目标是让知识沉淀与 AI 辅助创作自然发生在同一份个人上下文中。

> 项目仍处于开发阶段，协议、数据结构和产品形态会持续调整。

![Lexora 界面预览](apps/docs/src/public/ui.png)

## 核心能力

Lexora 由文档驱动的 Web 工作台和独立的 Buddy 桌面产品组成。两者都面向个人使用，并保持各自的运行与数据边界。

### Web 工作台

以文档为中心的 AI 工作空间，支持自部署。

| 能力 | 描述 |
| --- | --- |
| 文档与知识 | 页面树、富文本编辑、表格、代码块、数学公式、自动保存和回收站。 |
| AI 对话与文档 AI | 模型选择、流式回复、消息分支、失败重试，以及基于文档上下文的续写与改写。 |
| 历史与发布 | 文档版本快照、历史恢复、单页发布和站点发布。 |
| 模型与部署 | 支持 BYOK、平台级与用户级模型服务商，以及 Docker Compose 自部署。 |

### Lexora Buddy

独立运行于本机的个人 AI 伙伴。

| 能力 | 描述 |
| --- | --- |
| 本地对话 | 连接多种模型服务商，并在本机保存会话与运行历史。 |
| 项目上下文 | 在授权目录中理解和处理文档、文件与代码。 |
| 受控执行 | 使用 Skills、MCP 与本机工具完成任务，在关键操作前请求确认。 |
| 桌面陪伴 | 通过通知、过程反馈和原生桌宠呈现运行状态。 |

## 技术栈

### Web 工作台与服务端

| 层级 | 技术 |
| --- | --- |
| Web | Vue 3、TypeScript、Vite、Vue Router、Pinia、Element Plus、UnoCSS |
| Editor | Tiptap、ProseMirror |
| API | NestJS、Fastify、Prisma、PostgreSQL、Redis、BullMQ |
| Agent | LangGraph、LangChain、PostgreSQL Checkpointer、Redis Streams |
| Infrastructure | Docker Compose、Nginx、RustFS |

### Lexora Buddy

| 层级 | 技术 |
| --- | --- |
| Desktop | Electron、Vue 3、TypeScript、Vite、Naive UI、UnoCSS |
| Agent Runtime | Pi SDK、MCP SDK、Node.js、SQLite、JSONL |
| Native Pet | Rust、GTK、Cairo、GDK Pixbuf |

## 项目结构

```txt
lexora/
├── apps/
│   ├── web/         # Vue 3 前端应用
│   ├── api/         # NestJS API 服务
│   ├── agent/       # LangGraph AI 运行服务
│   ├── buddy/       # 本地个人 AI 伙伴与桌宠
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
cp infrastructure/.env.dev.example infrastructure/.env
pnpm dev:infra
pnpm dev:db:sync
pnpm dev
```

`infrastructure/.env` 是本地开发配置真源。`pnpm dev` 会先按白名单生成 `apps/api/.env` 和 `apps/agent/.env`；这些生成文件可以临时手改，但下一次运行 `pnpm dev` 会被覆盖。

## 许可证

Lexora 使用 [AGPL-3.0-only](LICENSE) 许可证。

## 友情链接

- [LINUX DO - 新的理想型社区](https://linux.do/)
