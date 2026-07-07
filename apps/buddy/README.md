# Lexora Buddy

Lexora Buddy 是 Lexora 的本地桌面伙伴，用桌宠入口连接对话窗口、项目授权、本地记忆和本机 agent runtime。

它不是完整桌面版 Lexora，也不是 Web 端直接执行本机任务的通道。涉及项目文件、外部 runtime 或系统能力的操作，都以本地授权和审批为边界。

## 能力

- 桌宠常驻入口、状态反馈和快捷操作。
- 控制面板用于登录、项目授权、设置和诊断。
- 对话窗口展示 Buddy 会话、运行事件和本机 agent 执行过程。
- Buddy 维护自己的本地记忆，不写入 Codex 或 Claude Code 的原生记忆。
- Codex app-server 是当前主要执行路径；Claude Code 当前仅检测，不启用执行。

## 本地边界

Buddy 的本地数据保存在用户设备上。Linux 默认数据目录为 `~/.lexora/buddy`，用户配置文件为 `~/.config/lexora/config.yaml`。

## 开发

启动 Buddy 桌面运行时：

```bash
pnpm dev:buddy
```

`pnpm dev:agent` 只启动服务端 agent，不会启动桌宠。

发布材料、AUR、远端 asset、CI evidence 与外部验收见 `packaging/buddy/README.md`。
