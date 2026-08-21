# Lexora Buddy

Lexora Buddy 是 Lexora 品牌下独立的本地个人 AI 伙伴。它面向个人工作目录完成对话、文档与文件处理、编码和工具调用，并通过桌宠提供陪伴与任务反馈。

## 主要能力

- 连接多种模型服务商并保留本地对话历史；
- 在用户授权的目录中读取和编辑内容；
- 使用扩展能力与本机工具完成通用任务；
- 在关键操作前请求确认，并展示执行过程与结果。

Buddy 的产品数据与授权配置保存在本机，模型请求发送给用户选择的服务商。默认数据目录为 `~/.lexora/buddy/`。

关闭窗口只会隐藏 Desktop，退出由托盘控制；双击桌宠可重新打开 Desktop。

## 开发

```bash
pnpm dev:buddy
```

构建与发布见 [`packaging/buddy/README.md`](../../packaging/buddy/README.md)。
