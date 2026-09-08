# Lexora Buddy Packaging

本目录提供 Lexora Buddy 桌面安装包与独立桌宠的构建入口。产品说明见 [`apps/buddy/README.md`](../../apps/buddy/README.md)。

## 构建

| 产物 | 命令 |
| --- | --- |
| Ubuntu deb | `pnpm --filter @lexora/buddy package:deb` |
| Arch Linux pacman | `pnpm --filter @lexora/buddy package:arch` |
| Windows x64 NSIS | `pnpm --filter @lexora/buddy package:windows` |
| Linux 独立桌宠 | `pnpm --filter @lexora/buddy package:pet` |

产物写入 `apps/buddy/.output/artifacts/`。桌面安装包内置 fd、ripgrep 与原生组件。构建需要 Rust 工具链，Linux 包校验需要 `bsdtar`；Windows 构建还需要 MSVC C++ Build Tools 与 Windows SDK。各平台安装包在对应系统构建和验证。

## 校验

```bash
pnpm release:version:check
pnpm --filter @lexora/buddy lint
pnpm --filter @lexora/buddy type-check
pnpm --filter @lexora/buddy test
pnpm check:buddy
```

`check:buddy` 是本地完整预检，包含质量检查与当前平台安装包构建。PR 只做 lint、类型检查和测试；发布流程构建并验证 Ubuntu、Arch Linux 与 Windows 产物。
