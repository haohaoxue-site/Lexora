---
layout: home

hero:
  name: SamePage AI
  text: AI 与协作同在一页
  tagline: 面向个人与小团队的在线协作文档平台，内置 AI 对话、文档协作、公开发布和自部署能力。
  image:
    src: /ui.png
    alt: SamePage
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quick-start
    - theme: alt
      text: 自部署
      link: /self-host/docker-compose

features:
  - title: AI 对话
    icon:
      src: /features/ai-chat.svg
      alt: AI 对话
      width: '28'
      height: '28'
      wrap: true
    details: 支持模型选择、流式回复、消息分支、重试，以及从文档场景带入上下文的对话体验。
    link: /guide/ai-chat
  - title: 文档编写
    icon:
      src: /features/doc-writing.svg
      alt: 文档编写
      width: '28'
      height: '28'
      wrap: true
    details: 基于富文本编辑器构建页面树，支持代码块、表格、数学公式、历史版本和回收站。
    link: /guide/documents
  - title: 协作
    icon:
      src: /features/collaboration.svg
      alt: 协作
      width: '28'
      height: '28'
      wrap: true
    details: 支持指定用户邀请、协作链接、读写权限和子页面范围，协作准入由服务端统一校验。
    link: /guide/collaboration
  - title: 自部署
    icon:
      src: /features/self-host.svg
      alt: 自部署
      width: '28'
      height: '28'
      wrap: true
    details: 通过 Docker Compose 运行完整服务，并管理用户、模型服务商、登录策略、邮件配置和审计记录。
    link: /self-host/docker-compose
---
