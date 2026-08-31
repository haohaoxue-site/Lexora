export interface LandingLink {
  label: string
  href: string
  external?: boolean
}

export interface LandingHeroContent {
  eyebrow: string
  title: string
  description: string
  primaryAction: LandingLink
  secondaryAction: LandingLink
  note: string
  preview: {
    windowTitle: string
    status: string
    taskLabel: string
    task: string
    steps: string[]
    scopeLabel: string
    scope: string
  }
}

export interface LandingSectionContent {
  kicker: string
  title: string
  description: string
}

export interface LandingWorkflowContent extends LandingSectionContent {
  steps: Array<{
    title: string
    description: string
    meta: string
  }>
}

export type LandingCapabilityVisual = 'context' | 'control' | 'automation' | 'extensible' | 'companion'

export interface LandingCapabilitiesContent extends LandingSectionContent {
  items: Array<{
    title: string
    description: string
    label: string
    visual: LandingCapabilityVisual
  }>
}

export interface LandingDocumentContent extends LandingSectionContent {
  points: Array<{
    title: string
    description: string
  }>
  primaryAction: LandingLink
  secondaryAction: LandingLink
  previewLabel: string
  previewAlt: string
}

export interface LandingPrinciplesContent extends LandingSectionContent {
  items: Array<{
    title: string
    description: string
  }>
}

export interface LandingFinalContent {
  eyebrow: string
  title: string
  description: string
  primaryAction: LandingLink
  primaryMeta: string
  platformLabel: string
  platforms: string[]
  secondaryAction: LandingLink
  footnote: string
}

export interface LandingContent {
  hero: LandingHeroContent
  ribbon: string[]
  workflow: LandingWorkflowContent
  capabilities: LandingCapabilitiesContent
  document: LandingDocumentContent
  principles: LandingPrinciplesContent
  final: LandingFinalContent
}

const zh: LandingContent = {
  hero: {
    eyebrow: 'LOCAL-FIRST · PERSONAL AI WORKSPACE',
    title: '让文字成为工作、创作与生活的起点。',
    description: 'Lexora 是一个以 Desktop 为核心的个人 AI 工作台。它在你授权的范围内使用本地文件与工具，让想法不只停在对话里：整理资料、推进任务、交付成果，想你所想，行你所行。',
    primaryAction: {
      label: '下载 Desktop',
      href: 'https://github.com/haohaoxue-site/Lexora/releases/latest',
      external: true,
    },
    secondaryAction: {
      label: '看看它如何工作',
      href: '#workflow',
    },
    note: '开源 · 本地运行 · 由你授权',
    preview: {
      windowTitle: 'Lexora Desktop',
      status: '正在工作',
      taskLabel: '当前任务',
      task: '整理项目发布说明，并检查遗漏项',
      steps: [
        '读取变更记录与版本信息',
        '核对发布资产',
        '生成 release-note.md',
      ],
      scopeLabel: '本次授权范围',
      scope: '~/Projects/Lexora',
    },
  },
  ribbon: ['本地上下文', '工具执行', '多模型', '自动化', '过程可见', '产物交付'],
  workflow: {
    kicker: 'ONE CONTINUOUS WORKFLOW',
    title: '从一句话，到一个真正落地的结果。',
    description: '许多 AI 产品止于答案；Lexora 把上下文、行动与产物留在同一条任务时间线上。',
    steps: [
      {
        title: '说出要完成的事',
        description: '用自然语言发起任务，不必先把真实工作拆成一串提示词。',
        meta: 'INTENT',
      },
      {
        title: '带上正确的上下文',
        description: '按需授权本机目录，让文档、图片、代码和项目约定进入当前任务。',
        meta: 'CONTEXT',
      },
      {
        title: '让工具真正行动',
        description: '连接 Skills、MCP 与本机工具；关键操作会在执行前向你确认。',
        meta: 'ACTION',
      },
      {
        title: '把结果留下来',
        description: '文件、报告与运行过程都回到任务中，下一次可以接着做，而不是重新开始。',
        meta: 'ARTIFACT',
      },
    ],
  },
  capabilities: {
    kicker: 'BUILT AROUND YOUR REAL WORK',
    title: '不是更大的聊天框，\n而是一张可以工作的桌子。',
    description: '围绕个人真实工作设计的上下文、控制、扩展与反馈，而不是一组孤立的 AI 功能。',
    items: [
      {
        title: '本地上下文，按需进入',
        description: '只读取你明确授权的目录；文档、图片、代码与项目约定都能成为当前任务的上下文。',
        label: 'DIRECTORY GRANTS',
        visual: 'context',
      },
      {
        title: '关键动作，由你确认',
        description: '涉及进程、服务与敏感工具时，先呈现明确的操作目标，再等待你的决定。',
        label: 'HUMAN IN CONTROL',
        visual: 'control',
      },
      {
        title: '把重复工作交给时间',
        description: '为每日、每周或一次性任务设定计划，并保留每次运行的过程与结果。',
        label: 'AUTOMATIONS',
        visual: 'automation',
      },
      {
        title: '模型与工具，都不被锁死',
        description: '连接多个模型服务商，通过 Skills、MCP 与本机工具继续扩展能力。',
        label: 'MODELS · SKILLS · MCP',
        visual: 'extensible',
      },
      {
        title: '忙碌时看得见，完成时也看得见',
        description: '系统通知与原生桌宠让任务状态不再藏在后台，陪伴是反馈方式，而不是功能噱头。',
        label: 'VISIBLE FEEDBACK',
        visual: 'companion',
      },
    ],
  },
  document: {
    kicker: 'FROM ACTION TO KNOWLEDGE',
    title: '做完的事，\n也应该沉淀下来。',
    description: 'Web 工作台把 Desktop 的任务结果延伸到文档编辑、知识整理和公开发布。',
    points: [
      {
        title: '写作，而不是填表',
        description: '页面树、富文本块、表格、代码与数学公式，共同承载长期内容。',
      },
      {
        title: '历史不会消失',
        description: '自动保存当前内容，创建历史版本，并从快照恢复文档。',
      },
      {
        title: '从个人笔记到公开资料站',
        description: '把单篇文档或一组页面发布成独立、只读的公开内容。',
      },
    ],
    primaryAction: {
      label: '了解 Web 工作台',
      href: '/guide/what-is-lexora',
    },
    secondaryAction: {
      label: '自部署指南',
      href: '/self-host/docker-compose',
    },
    previewLabel: 'LEXORA WEB · DOCUMENT WORKSPACE',
    previewAlt: 'Lexora Web 文档工作台界面',
  },
  principles: {
    kicker: 'YOUR SPACE, YOUR RULES',
    title: '能力向外延伸，\n控制权始终向内收拢。',
    description: '你决定目录、模型与工具如何进入工作流；Lexora 负责让边界清晰可见。',
    items: [
      {
        title: '本地优先',
        description: 'Buddy 的产品数据与目录授权保存在本机，目录内容只在授权后进入任务上下文。',
      },
      {
        title: '选择自由',
        description: '模型请求发送给你选择的服务商，能力不与单一模型或平台绑定。',
      },
      {
        title: '开放可审视',
        description: '项目基于 AGPL-3.0-only 开源，可自行部署、检查并长期维护自己的工作空间。',
      },
    ],
  },
  final: {
    eyebrow: 'LEXORA DESKTOP',
    title: '从桌面开始，\n让想法真正发生。',
    description: '在自己的电脑上连接本地上下文、模型与工具，把一句话推进成看得见、带得走的结果。',
    primaryAction: {
      label: '下载 Lexora Desktop',
      href: 'https://github.com/haohaoxue-site/Lexora/releases/latest',
      external: true,
    },
    primaryMeta: '前往最新 GitHub Release',
    platformLabel: '当前提供 Linux 桌面安装包',
    platforms: ['Ubuntu / Debian', 'Arch Linux', 'x86_64'],
    secondaryAction: {
      label: '先了解 Desktop 如何工作',
      href: '#workflow',
    },
    footnote: '开源 · 本地运行 · AGPL-3.0-only',
  },
}

const en: LandingContent = {
  hero: {
    eyebrow: 'LOCAL-FIRST · PERSONAL AI WORKSPACE',
    title: 'Let words be where work, creativity, and everyday life begin.',
    description: 'Lexora is a personal AI workspace built around Desktop. Within the access you grant, it uses local files and tools to move ideas beyond conversation—organizing context, advancing tasks, and delivering results while acting on your intent.',
    primaryAction: {
      label: 'Download Desktop',
      href: 'https://github.com/haohaoxue-site/Lexora/releases/latest',
      external: true,
    },
    secondaryAction: {
      label: 'See how it works',
      href: '#workflow',
    },
    note: 'Open source · Runs locally · Authorized by you',
    preview: {
      windowTitle: 'Lexora Desktop',
      status: 'Working',
      taskLabel: 'Current task',
      task: 'Prepare the project release notes and check for gaps',
      steps: [
        'Read changes and version metadata',
        'Verify release assets',
        'Create release-note.md',
      ],
      scopeLabel: 'Authorized for this task',
      scope: '~/Projects/Lexora',
    },
  },
  ribbon: ['Local context', 'Tool execution', 'Multiple models', 'Automations', 'Visible progress', 'Artifacts'],
  workflow: {
    kicker: 'ONE CONTINUOUS WORKFLOW',
    title: 'From one sentence to a result you can actually use.',
    description: 'Many AI products stop at an answer. Lexora keeps context, action, and artifacts on one continuous task timeline.',
    steps: [
      {
        title: 'Describe the outcome',
        description: 'Start in natural language without translating real work into a chain of elaborate prompts.',
        meta: 'INTENT',
      },
      {
        title: 'Bring the right context',
        description: 'Grant local folders when needed, so documents, images, code, and project conventions can inform the task.',
        meta: 'CONTEXT',
      },
      {
        title: 'Let tools take action',
        description: 'Connect Skills, MCP, and local tools. Critical operations ask for your approval before they run.',
        meta: 'ACTION',
      },
      {
        title: 'Keep the result',
        description: 'Files, reports, and the run history return to the task, so the next session can continue instead of restarting.',
        meta: 'ARTIFACT',
      },
    ],
  },
  capabilities: {
    kicker: 'BUILT AROUND YOUR REAL WORK',
    title: 'Not a bigger chat box.\nA desk where work can happen.',
    description: 'Context, control, extensibility, and feedback designed around personal work—not a collection of disconnected AI features.',
    items: [
      {
        title: 'Local context, only when needed',
        description: 'Lexora reads folders you explicitly authorize. Documents, images, code, and project conventions can all become task context.',
        label: 'DIRECTORY GRANTS',
        visual: 'context',
      },
      {
        title: 'You approve critical actions',
        description: 'For processes, services, and sensitive tools, Lexora shows the exact target and waits for your decision.',
        label: 'HUMAN IN CONTROL',
        visual: 'control',
      },
      {
        title: 'Give recurring work a schedule',
        description: 'Create daily, weekly, or one-time automations, with a trace of every run and result.',
        label: 'AUTOMATIONS',
        visual: 'automation',
      },
      {
        title: 'Models and tools stay open',
        description: 'Connect multiple model providers, then extend the workspace through Skills, MCP, and local tools.',
        label: 'MODELS · SKILLS · MCP',
        visual: 'extensible',
      },
      {
        title: 'Progress you can see',
        description: 'System notifications and the native desktop pet make task status visible without turning companionship into a gimmick.',
        label: 'VISIBLE FEEDBACK',
        visual: 'companion',
      },
    ],
  },
  document: {
    kicker: 'FROM ACTION TO KNOWLEDGE',
    title: 'Finished work should become\nknowledge you can keep.',
    description: 'The Web workspace carries Desktop results into document editing, knowledge organization, and public publishing.',
    points: [
      {
        title: 'Write, rather than fill forms',
        description: 'Page trees, rich-text blocks, tables, code, and math give long-lived content a proper home.',
      },
      {
        title: 'History stays available',
        description: 'Autosave current content, create historical versions, and restore documents from snapshots.',
      },
      {
        title: 'From private notes to a public site',
        description: 'Publish one document or a collection of pages as independent, read-only content.',
      },
    ],
    primaryAction: {
      label: 'Explore the Web workspace',
      href: '/en/guide/what-is-lexora',
    },
    secondaryAction: {
      label: 'Self-hosting guide',
      href: '/en/self-host/docker-compose',
    },
    previewLabel: 'LEXORA WEB · DOCUMENT WORKSPACE',
    previewAlt: 'Lexora Web document workspace interface',
  },
  principles: {
    kicker: 'YOUR SPACE, YOUR RULES',
    title: 'Capabilities reach outward.\nControl stays with you.',
    description: 'You decide how folders, models, and tools enter the workflow. Lexora keeps those boundaries visible.',
    items: [
      {
        title: 'Local first',
        description: 'Buddy product data and directory grants stay on your machine. Folder contents only enter a task after authorization.',
      },
      {
        title: 'Freedom to choose',
        description: 'Model requests go to the provider you select, so the workspace is not tied to one model or platform.',
      },
      {
        title: 'Open to inspection',
        description: 'Lexora is open source under AGPL-3.0-only, ready to self-host, inspect, and maintain for the long term.',
      },
    ],
  },
  final: {
    eyebrow: 'LEXORA DESKTOP',
    title: 'Start on your desktop.\nTurn ideas into action.',
    description: 'Bring local context, models, and tools together on your own computer, then move one sentence toward a result you can see and keep.',
    primaryAction: {
      label: 'Download Lexora Desktop',
      href: 'https://github.com/haohaoxue-site/Lexora/releases/latest',
      external: true,
    },
    primaryMeta: 'Open the latest GitHub Release',
    platformLabel: 'Linux desktop packages currently available',
    platforms: ['Ubuntu / Debian', 'Arch Linux', 'x86_64'],
    secondaryAction: {
      label: 'See how Desktop works',
      href: '#workflow',
    },
    footnote: 'Open source · Runs locally · AGPL-3.0-only',
  },
}

export const landingContent = { zh, en } satisfies Record<'zh' | 'en', LandingContent>
