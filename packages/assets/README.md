# Lexora Assets

`packages/assets` 存放 Lexora 跨应用复用的品牌与产品资产。这里的文件是应用可直接消费的最终资产或可追溯参考源。

## 当前结构

- `brand/app-icon.png`：公用应用图标，当前由 `buddy/pets/default/pet.png` 的透明角色图派生。它是派生物，不是原始母版。
- `sources/default-reference.png`：默认 Buddy 的初始参考原图，带粉色背景，不是运行时资源。
- `buddy/pets/default/pet.png`：透明静态角色图，用于预览和派生品牌图标；它是派生物，不是 native 桌宠运行时入口。
- `buddy/pets/default/manifest.json`：Buddy 默认形象的帧尺寸、sheet 布局和语义动画契约；`animations` 是数组，每个动作条目包含 `name`、`description`、`row` 和自己的 `frames`。
- `buddy/pets/default/spritesheet.webp`：Buddy 默认形象的运行时雪碧图，native 桌宠加载它并按帧裁切。

## 边界

- 原图、可编辑源和参考材料放在 `sources/` 下。
- 派生出的最终品牌图放在 `brand/`。
- 派生出的 Buddy 运行时资源放在 `buddy/pets/<id>/`。
- 本地候选图、私有源、临时 sheet 和生成脚本不是最终资产，不放在这个包的公开结构里。
