import type { LexoraConfig } from '../shared/desktopApi'

type DesktopLanguage = LexoraConfig['desktop']['language']

const messages = {
  'en-US': {
    backgroundCloseBody: 'Lexora Buddy is still running in the background.',
    backgroundCloseTitle: 'Lexora Buddy remains available',
    open: 'Open',
    quit: 'Quit',
    restart: 'Restart',
    selectAttachments: 'Select attachments',
    selectProjectDirectory: 'Select project directory',
  },
  'zh-CN': {
    backgroundCloseBody: 'Lexora Buddy 仍在后台运行。',
    backgroundCloseTitle: 'Lexora Buddy 仍可随时使用',
    open: '打开',
    quit: '退出',
    restart: '重启',
    selectAttachments: '选择附件',
    selectProjectDirectory: '选择项目目录',
  },
} as const

type NativeMessageKey = keyof typeof messages['zh-CN']

export function translateDesktopNative(language: DesktopLanguage, key: NativeMessageKey) {
  return messages[language][key]
}
