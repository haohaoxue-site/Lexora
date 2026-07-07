# Screen And Visibility

## Default Policy

对话控制默认使用“完整可见”语义。用户说“最左侧 / 最右侧 / 最上方 / 最下方 / 到边缘”时，目标是当前屏幕 workarea 内贴边，而不是把桌宠移出屏幕。

拖动不同：用户手动拖动可以精细控制，运行时允许部分探出。对话控制不能默认复制拖动语义。

## Edge Targets

- `left`：桌宠窗口左边贴近当前 workarea 左边，整只仍可见。
- `right`：桌宠窗口右边贴近当前 workarea 右边，整只仍可见。
- `top`：桌宠窗口上边贴近当前 workarea 上边，整只仍可见。
- `bottom`：桌宠窗口下边贴近当前 workarea 下边，整只仍可见。

使用命令：

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs move edge left --after celebrate
node <skill_dir>/scripts/lexora-buddy-pet.mjs move edge right --after explain
node <skill_dir>/scripts/lexora-buddy-pet.mjs move edge top --after curious
node <skill_dir>/scripts/lexora-buddy-pet.mjs move edge bottom --after sleep
```

## Do Not Infer Geometry

不要通过 KWin、qdbus、xdotool、源码常量或截图手算桌宠目标坐标。runtime 的 `move` 命令会使用当前 monitor/workarea 和桌宠窗口尺寸计算可见位置。

如果用户要求视觉确认，可以执行动作后用 Computer Use 或截图确认；确认工具只用于观察，不用于替代 runtime 的位置计算。
