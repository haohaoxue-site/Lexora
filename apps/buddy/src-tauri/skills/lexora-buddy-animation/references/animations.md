# Animations

## Semantic Mapping

- 跳舞 / 开心 / 庆祝：`celebrate`
- 施法 / 蓄力 / 酷炫动作：当前使用 `celebrate`
- 睡觉：`sleep`
- 醒来：`wake`
- 思考：`thinking`
- 工作 / 专注：`working`
- 解释：`explain`
- 安慰 / 放松：`reassure`
- 好奇 / 看看：`curious`
- 难过：`sad`
- 同意 / 认可：`approval`
- 跑动：runtime 自动使用 `run_left` / `run_right`

## Available Runtime Names

`idle`, `run_left`, `run_right`, `sleep`, `wake`, `hover`, `tap`, `approval`, `thinking`, `working`, `celebrate`, `sad`, `reassure`, `explain`, `curious`, `trip_fall_left`, `fallen_idle_left`, `fallen_get_up_left`, `trip_fall_right`, `fallen_idle_right`, `fallen_get_up_right`, `stumble_recover_left`, `stumble_recover_right`。

调用前可用：

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs capabilities
```

如果用户要求的动作没有映射，不要发明动画名；选择最接近的已有语义，或说明当前 runtime 没有该动作。
