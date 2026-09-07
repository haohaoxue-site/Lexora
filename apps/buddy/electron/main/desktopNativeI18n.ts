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
    selectSpaceDirectory: 'Select space directory',
    saveBeforeQuitBody: 'Some changes could not be saved before quitting.',
    saveBeforeQuitTitle: 'Save changes before quitting?',
    retrySave: 'Retry',
    quitWithoutSaving: 'Quit without saving',
    cancel: 'Cancel',
  },
  'zh-CN': {
    backgroundCloseBody: 'Lexora Buddy 仍在后台运行。',
    backgroundCloseTitle: 'Lexora Buddy 仍可随时使用',
    open: '打开',
    quit: '退出',
    restart: '重启',
    selectAttachments: '选择附件',
    selectSpaceDirectory: '选择空间目录',
    saveBeforeQuitBody: '退出前有些更改未能保存。',
    saveBeforeQuitTitle: '退出前保存更改？',
    retrySave: '重试',
    quitWithoutSaving: '放弃保存并退出',
    cancel: '取消',
  },
} as const

type NativeMessageKey = keyof typeof messages['zh-CN']

export function translateDesktopNative(language: DesktopLanguage, key: NativeMessageKey) {
  return messages[language][key]
}
