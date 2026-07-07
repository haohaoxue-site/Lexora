# Action Sequences

## Preset

“跑到屏幕中央，施法/跳舞 2 秒，然后回到原地躺下”使用：

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs perform center-cast-return-sleep --animation celebrate --duration-ms 2000
```

这个 preset 会：

1. 调用 `state` 保存原位。
2. `move center`。
3. 等待 `state.motion.active` 变为 `false`。
4. 播放指定动画并持续指定时间。
5. 移动回 snapshot 位置，并在到达后 `sleep`。

## Generic Sequence

复杂动作使用 `sequence --json` 或 `sequence --file`：

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs sequence --file /tmp/buddy-sequence.json
```

支持步骤：

- `{ "type": "snapshot", "name": "original" }`
- `{ "type": "move", "target": "center" }`
- `{ "type": "move", "target": { "kind": "edge", "edge": "left" }, "after": "celebrate" }`
- `{ "type": "move", "target": { "kind": "snapshot", "name": "original" }, "after": "sleep" }`
- `{ "type": "animation", "animation": "celebrate", "durationMs": 2000 }`
- `{ "type": "wait", "durationMs": 500 }`
- `{ "type": "wait", "motionIdle": true, "timeoutMs": 10000 }`

移动步骤默认会等待运动结束。只有明确需要异步连续触发时才设置 `"wait": false`。

## Prohibited Pattern

不要用多条裸命令加手写 `sleep` 猜测移动时间。动作持续时间可以等待，因为这是用户显式要求的时长；移动完成必须通过 runtime state 确认。
