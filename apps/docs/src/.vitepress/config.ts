import { defineConfig } from 'vitepress'

const zhGuideSidebar = [
  {
    text: '介绍',
    items: [
      { text: '什么是 SamePage AI', link: '/guide/what-is-samepage-ai' },
      { text: '快速开始', link: '/guide/quick-start' },
    ],
  },
  {
    text: '指南',
    items: [
      { text: 'AI 对话', link: '/guide/ai-chat' },
      { text: '文档页面', link: '/guide/documents' },
      { text: '文档协作', link: '/guide/collaboration' },
      { text: '公开发布', link: '/guide/publication' },
      { text: '个人设置与模型', link: '/guide/settings-and-models' },
    ],
  },
]

const zhSelfHostSidebar = [
  {
    text: '自部署',
    items: [
      { text: 'Docker Compose 部署', link: '/self-host/docker-compose' },
      { text: '环境变量', link: '/self-host/env-vars' },
      { text: '存储与服务依赖', link: '/self-host/storage-and-dependencies' },
      { text: '更新与维护', link: '/self-host/update-and-maintenance' },
      { text: '常见问题', link: '/self-host/faq' },
    ],
  },
  {
    text: '后台管理',
    items: [
      { text: '管理员初始化', link: '/self-host/admin/initial-admin' },
      { text: '用户管理', link: '/self-host/admin/users' },
      { text: '模型服务商', link: '/self-host/admin/model-providers' },
      { text: '邮件与登录', link: '/self-host/admin/email-and-login' },
      { text: '审计', link: '/self-host/admin/audit' },
    ],
  },
]

const enGuideSidebar = [
  {
    text: 'Introduction',
    items: [
      { text: 'What is SamePage AI', link: '/en/guide/what-is-samepage-ai' },
      { text: 'Quick Start', link: '/en/guide/quick-start' },
    ],
  },
  {
    text: 'Guide',
    items: [
      { text: 'AI Chat', link: '/en/guide/ai-chat' },
      { text: 'Document Pages', link: '/en/guide/documents' },
      { text: 'Document Collaboration', link: '/en/guide/collaboration' },
      { text: 'Public Publishing', link: '/en/guide/publication' },
      { text: 'Settings and Models', link: '/en/guide/settings-and-models' },
    ],
  },
]

const enSelfHostSidebar = [
  {
    text: 'Self-hosting',
    items: [
      { text: 'Docker Compose', link: '/en/self-host/docker-compose' },
      { text: 'Environment Variables', link: '/en/self-host/env-vars' },
      { text: 'Storage and Dependencies', link: '/en/self-host/storage-and-dependencies' },
      { text: 'Updates and Maintenance', link: '/en/self-host/update-and-maintenance' },
      { text: 'FAQ', link: '/en/self-host/faq' },
    ],
  },
  {
    text: 'Admin',
    items: [
      { text: 'Initial Admin', link: '/en/self-host/admin/initial-admin' },
      { text: 'User Management', link: '/en/self-host/admin/users' },
      { text: 'Model Providers', link: '/en/self-host/admin/model-providers' },
      { text: 'Email and Login', link: '/en/self-host/admin/email-and-login' },
      { text: 'Audit', link: '/en/self-host/admin/audit' },
    ],
  },
]

export default defineConfig({
  title: 'SamePage AI',
  description: 'AI 与协作同在一页',
  cleanUrls: true,
  outDir: '../dist',
  cacheDir: '../.vitepress/cache',
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['link', { rel: 'shortcut icon', type: 'image/png', href: '/logo.png' }],
  ],
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '指南', link: '/guide/what-is-samepage-ai' },
          { text: '自部署', link: '/self-host/docker-compose' },
        ],
        sidebar: {
          '/self-host/': zhSelfHostSidebar,
          '/': zhGuideSidebar,
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      description: 'AI and collaboration on the same page',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Guide', link: '/en/guide/what-is-samepage-ai' },
          { text: 'Self-hosting', link: '/en/self-host/docker-compose' },
        ],
        sidebar: {
          '/en/self-host/': enSelfHostSidebar,
          '/en/': enGuideSidebar,
        },
      },
    },
  },
  themeConfig: {
    logo: '/logo.png',
    search: {
      provider: 'local',
    },
  },
})
