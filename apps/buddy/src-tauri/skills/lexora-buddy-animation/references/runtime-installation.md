# Runtime Installation

## Installed Environment

正式环境以 `packaging/buddy` 为准：

- deb/apt 包名：`lexora-buddy`
- Arch/AUR 包名：`lexora-buddy-bin`
- 主二进制：`lexora-buddy`
- 轻量桌宠控制入口预留名：`lexora-buddy-pet`

当前脚本连接 Buddy runtime 暴露的 native pet control socket。它是临时 IPC 端点，不是安装路径，也不是持久数据目录。

Linux 主路径：

```txt
$XDG_RUNTIME_DIR/lexora-buddy/native-pet.sock
```

没有 `XDG_RUNTIME_DIR` 时才降级到 uid 隔离的临时目录：

```txt
/tmp/lexora-buddy-uid-<uid>/native-pet.sock
```

也支持通过环境变量覆盖：

```bash
LEXORA_BUDDY_PET_SOCKET=/path/to/native-pet.sock node <skill_dir>/scripts/lexora-buddy-pet.mjs state
```

## Diagnostics

首次使用或失败时运行：

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs diagnose
```

如果 socket 不存在但已安装 Buddy，可以尝试：

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs launch
```

如果没有安装二进制，提示用户通过 apt/deb 或 pacman/AUR 安装 Lexora Buddy。不要假设源码目录存在，也不要要求用户从仓库路径启动。
