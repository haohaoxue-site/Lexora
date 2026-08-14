<p align="center">
  <img src="apps/docs/src/public/logo.png" width="88" alt="Lexora Logo" />
</p>

<h1 align="center">Lexora 文灵</h1>

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

<p align="center">
  Documents and AI in a focused, self-hostable personal workspace.
</p>

<p align="center">
  <a href="https://github.com/haohaoxue-site/Lexora/blob/master/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-2f6f68"></a>
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883">
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-e0234e">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-Agent-1f6feb">
  <img alt="Tiptap" src="https://img.shields.io/badge/Tiptap-Editor-f7b955">
</p>

Lexora is a document-driven AI workspace for individuals. It brings document writing, AI chat, document AI, version history, and public publishing into one workspace, so knowledge capture and AI-assisted creation happen in the same personal context.

> This project is still under active development. Protocols, data structures, and product behavior may continue to change.

![Lexora interface preview](apps/docs/src/public/ui.png)

## Core Capabilities

Lexora consists of a document-driven web workspace and a standalone Buddy desktop product. Both are designed for individuals and keep independent runtime and data boundaries.

### Web Workspace

A document-centered AI workspace that can be self-hosted.

| Capability | Description |
| --- | --- |
| Documents and Knowledge | Page trees, rich-text editing, tables, code blocks, math, autosave, and trash. |
| AI Chat and Document AI | Model selection, streaming replies, message branches, retries, and document-aware continuation and rewriting. |
| History and Publishing | Version snapshots, history restore, single-page publishing, and site publishing. |
| Models and Deployment | BYOK, platform-level and user-level model providers, and Docker Compose self-hosting. |

### Lexora Buddy

A standalone personal AI companion that runs locally.

| Capability | Description |
| --- | --- |
| Local Conversations | Connect multiple model providers and keep conversation and run history on the local machine. |
| Project Context | Understand and work with documents, files, and code in authorized directories. |
| Controlled Execution | Use Skills, MCP, and local tools while requesting confirmation for sensitive operations. |
| Desktop Companion | Present runtime status through notifications, progress feedback, and a native desktop pet. |

## Tech Stack

### Web Workspace and Services

| Layer | Technology |
| --- | --- |
| Web | Vue 3, TypeScript, Vite, Vue Router, Pinia, Element Plus, UnoCSS |
| Editor | Tiptap, ProseMirror |
| API | NestJS, Fastify, Prisma, PostgreSQL, Redis, BullMQ |
| Agent | LangGraph, LangChain, PostgreSQL Checkpointer, Redis Streams |
| Infrastructure | Docker Compose, Nginx, RustFS |

### Lexora Buddy

| Layer | Technology |
| --- | --- |
| Desktop | Electron, Vue 3, TypeScript, Vite, Naive UI, UnoCSS |
| Agent Runtime | Pi SDK, MCP SDK, Node.js, SQLite, JSONL |
| Native Pet | Rust, GTK, Cairo, GDK Pixbuf |

## Project Structure

```txt
lexora/
├── apps/
│   ├── web/         # Vue 3 frontend app
│   ├── api/         # NestJS API service
│   ├── agent/       # LangGraph AI runtime service
│   ├── buddy/       # Local personal AI companion and desktop pet
│   └── docs/        # Product documentation site
├── packages/
│   ├── contracts/   # Shared schemas, endpoints, constants, and domain types
│   └── shared/      # Shared utility functions
└── infrastructure/  # Docker and environment configuration
```

## Local Development

Lexora uses pnpm workspace.

```bash
pnpm install
cp infrastructure/.env.dev.example infrastructure/.env
pnpm dev:infra
pnpm dev:db:sync
pnpm dev
```

`infrastructure/.env` is the local configuration source of truth. `pnpm dev` generates the API and Agent environment files from its allowlist.

## License

Lexora is licensed under [AGPL-3.0-only](LICENSE).

## Friendly Links

- [LINUX DO - A new ideal community](https://linux.do/)
