# Lexora Buddy Packaging

本目录维护 Lexora Buddy 桌面端发布材料，包括 Linux deb、AUR `lexora-buddy-bin`、Windows NSIS、CI evidence 和外部验收脚本。Buddy 产品范围与本地运行时说明见 `apps/buddy/README.md`。

## 结构

- `aur/`：Arch Linux `lexora-buddy-bin` 元数据与包校验。
- `ci/`：GitHub Actions workflow 直接调用的脚本。
- `release/`：本地门禁、远端 asset 校验与外部验收。
- `__tests__/`：本地 packaging contract tests，不进入公开交付。

## 产物

- Linux deb：`.github/workflows/buddy-linux-deb.yml`
- Arch Linux `lexora-buddy-bin`：从已发布 deb 解包
- Windows NSIS：`.github/workflows/buddy-windows.yml`

Arch Linux 是优先支持的 Linux 发布目标。AUR 构建不重新编译 Rust 或 Node 依赖。

## 版本与 Asset

Buddy 产品版本真源：

- `apps/buddy/buddy.version.json`

以下文件中的版本号都是派生副本：

- `apps/buddy/package.json`
- `apps/buddy/src-tauri/tauri.conf.json`
- `apps/buddy/src-tauri/Cargo.toml`
- `packaging/buddy/aur/lexora-buddy-bin/PKGBUILD`
- `packaging/buddy/aur/lexora-buddy-bin/.SRCINFO`

升级版本：

```bash
pnpm buddy:version:set <x.y.z>
pnpm buddy:version:check
```

Tauri deb 文件名约定：

```txt
Lexora Buddy_<pkgver>_amd64.deb
```

刷新 AUR 元数据：

```bash
pnpm build:buddy:arch
sha256sum "apps/buddy/src-tauri/target/release/bundle/deb/Lexora Buddy_<pkgver>_amd64.deb"
cd packaging/buddy/aur/lexora-buddy-bin
makepkg --printsrcinfo > .SRCINFO
```

写入 sha256 后，不再重建同版本 deb；该 hash 必须对应最终上传的 release asset。

## 本地门禁

完整发布前检查：

```bash
pnpm check:buddy
```

聚焦检查：

```bash
pnpm check:buddy:delivery
pnpm check:buddy:delivery:list
node packaging/buddy/aur/verify-bin-package.mjs
```

`verify-bin-package.mjs` 校验本地 deb、AUR 元数据、deb 内容、生成的 pacman 包和安装后二进制 health check。

## CI 与外部验收

CI workflow 负责产物构建、smoke 和 evidence 生成：

- `.github/workflows/buddy-linux-deb.yml`
- `.github/workflows/buddy-aur-install.yml`
- `.github/workflows/buddy-windows.yml`

Release asset 上传后运行：

```bash
pnpm check:buddy:asset
pnpm check:buddy:external
```

最终外部验收 evidence：

```bash
pnpm check:buddy:external:template > /tmp/lexora-buddy-external-readiness.json
node packaging/buddy/release/verify-external-readiness.mjs \
  --evidence /tmp/lexora-buddy-external-readiness.json
```

Evidence 文件是发布工作产物，不提交仓库。

## 包内容

包内至少包含：

- `usr/bin/lexora-buddy`
- `usr/share/applications/Lexora Buddy.desktop`
- `usr/share/icons/hicolor/*/apps/lexora-buddy.png`

desktop entry：

```txt
Exec=lexora-buddy
Icon=lexora-buddy
```
