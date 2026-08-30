<p align="center">
  <img src="packages/assets/brand/lexora-avatar.png" width="160" alt="Lexora Logo" />
</p>

<h1 align="center">Lexora 文灵</h1>

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

<p align="center">
  让文字成为工作、创作与生活的起点。
</p>

<p align="center">
  <img alt="Pi" src="https://img.shields.io/badge/Pi-Agent-6f42c1">
  <a href="https://github.com/haohaoxue-site/Lexora/blob/master/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-2f6f68"></a>
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883">
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-e0234e">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-Agent-1f6feb">
</p>

<p align="center">
  <a href="https://github.com/haohaoxue-site/Lexora/releases/latest">下载 Lexora 桌面版</a>
  ·
  <a href="https://docs.haohaoxue.site/">网站</a>
</p>

Lexora 是一个以 Desktop 为核心的个人 AI 工作台。在你授权的范围内使用本地文件与工具，想你所想，行你所行。

## Desktop

Desktop 在本地运行，以任务为中心，将对话、本地上下文、工具执行、自动化和产物集中在同一个工作台中。

![Lexora Desktop 界面预览](apps/docs/src/public/buddy-ui.png)

### 核心能力

| 能力 | 描述 |
| --- | --- |
| 任务工作台 | 通过自然语言发起任务，持续呈现执行过程、运行历史与生成产物。 |
| 本地上下文 | 在授权目录中理解和处理文档、图片、文件与代码。 |
| 工具与控制 | 连接多种模型，使用 Skills、MCP 与本机工具，并在关键操作前请求确认。 |
| 自动化 | 创建定时与重复任务，记录每次执行过程与结果。 |
| 桌面反馈 | 通过通知和原生桌宠呈现任务状态。 |

### 技术栈

| 层级 | 技术 |
| --- | --- |
| Desktop | Electron、Vue 3、TypeScript、Vite、Naive UI、UnoCSS |
| Agent Runtime | Pi SDK、MCP SDK、Node.js、SQLite、JSONL |
| Native Pet | Rust、GTK、Cairo、GDK Pixbuf |

### 本地开发

```bash
pnpm install
pnpm dev:buddy
```

## Web

Web 将逐步成为 Desktop 在文档编辑、知识沉淀与公开发布方面的内容延伸。目前仍独立运行，并支持自部署。

![Lexora Web 界面预览](apps/docs/src/public/ui.png)

### 核心能力

页面树、富文本编辑、文档 AI、历史版本、单页发布和站点发布。

### 技术栈

| 层级 | 技术 |
| --- | --- |
| Web | Vue 3、TypeScript、Vite、Vue Router、Pinia、Element Plus、UnoCSS |
| Editor | Tiptap、ProseMirror |
| API | NestJS、Fastify、Prisma、PostgreSQL、Redis、BullMQ |
| Agent | LangGraph、LangChain、PostgreSQL Checkpointer、Redis Streams |
| Infrastructure | Docker Compose、Nginx、RustFS |

### 本地开发

```bash
pnpm install
cp infrastructure/.env.dev.example infrastructure/.env
pnpm dev:infra
pnpm dev:db:sync
pnpm dev
```

`infrastructure/.env` 是本地开发配置真源。`pnpm dev` 会先按白名单生成 `apps/api/.env` 和 `apps/agent/.env`；这些生成文件可以临时手改，但下一次运行 `pnpm dev` 会被覆盖。

## 项目结构

```txt
lexora/
├── apps/
│   ├── web/         # Vue 3 前端应用
│   ├── api/         # NestJS API 服务
│   ├── agent/       # LangGraph AI 运行服务
│   ├── buddy/       # Lexora Desktop
│   └── docs/        # 产品文档站点
├── packages/
│   ├── assets/      # 跨应用品牌与运行时资产
│   ├── contracts/   # 共享契约层：schema、endpoint、常量、领域类型
│   └── shared/      # 共享函数层
└── infrastructure/  # docker 及环境配置
```

## 许可证

Lexora 使用 [AGPL-3.0-only](LICENSE) 许可证。

## 友情链接

- [LINUX DO - 新的理想型社区](https://linux.do/)
