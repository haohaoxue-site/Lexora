# Lexora Buddy Packaging

本目录维护 Lexora Buddy 的 Linux 安装包与独立桌宠产物。产品说明见 [`apps/buddy/README.md`](../../apps/buddy/README.md)。

## 构建

- `package:deb`：Ubuntu deb；
- `package:arch`：Arch Linux pacman 包；
- `package:pet`：独立桌宠 tar 包。

```bash
pnpm --filter @lexora/buddy package:deb
pnpm --filter @lexora/buddy package:arch
pnpm --filter @lexora/buddy package:pet
```

产物统一写入 `apps/buddy/.output/artifacts/`。

## 校验

```bash
pnpm release:version:check
pnpm check:buddy:source
pnpm check:buddy
```

`check:buddy:source` 只校验源码与发布契约；`check:buddy` 继续执行源码校验和 Ubuntu deb 构建。
