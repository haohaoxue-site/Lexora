# Position Targets

## Built-In Targets

- `center`：当前 monitor workarea 的中心，桌宠完整可见。
- `home`：当前 monitor workarea 的右下休息位，桌宠完整可见。
- `edge left/right/top/bottom`：当前 monitor workarea 的可见边缘。
- `position x/y`：用户明确给出的坐标；runtime 仍会按可见策略夹紧。
- `x`：只改变横向位置，纵向沿用当前桌宠位置；主要用于兼容窗口侧边命令。

## Original

`original` 不是 runtime 的固定位置。它表示“本次动作开始前的位置”，必须由脚本先调用 `state` 保存 snapshot。

需要“回到原地”时，用高层命令：

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs perform center-cast-return-sleep --animation celebrate --duration-ms 2000
```

或用 `sequence` 显式 snapshot：

```json
{
  "steps": [
    { "type": "snapshot", "name": "original" },
    { "type": "move", "target": "center" },
    { "type": "animation", "animation": "celebrate", "durationMs": 2000 },
    { "type": "move", "target": { "kind": "snapshot", "name": "original" }, "after": "sleep" }
  ]
}
```

不要把 `original` 解释为默认右下角，也不要在没有 snapshot 的情况下声称已经回到原位。
