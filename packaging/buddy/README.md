# Lexora Buddy Packaging

本目录维护 Lexora Buddy Desktop、独立桌宠与 Linux 发布材料。产品说明见 [`apps/buddy/README.md`](../../apps/buddy/README.md)。

## 产物

- `package:full`：包含 Desktop 与 native pet 的完整 deb；
- `package:pet`：仅包含 native pet、桌面入口与图标的独立桌宠包。

```bash
pnpm --filter @lexora/buddy package:full
pnpm --filter @lexora/buddy package:pet
```

生成内容统一写入 `apps/buddy/.output/`，可发布产物位于 `artifacts/desktop/` 与 `artifacts/pet/`。

```bash
pnpm --filter @lexora/buddy run clean
```

## 版本与校验

```bash
pnpm buddy:version:check
pnpm check:buddy
```

产品版本以 `apps/buddy/buddy.version.json` 为唯一输入。`check:buddy` 是本地完整发布门禁。

## GitHub Release 与 AUR

`lexora-buddy-bin` 从 `haohaoxue-site/Lexora` 的同版本 Release 下载 Desktop deb。公开资产只允许由 `master` 经 `buddy-release` Environment 审批后发布。
