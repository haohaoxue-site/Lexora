import type { LexoraConfig } from '../shared/desktopApi'
import type { BuddyServiceSupervisorStatus } from './runtime/BuddyServiceSupervisor'

type DesktopLanguage = LexoraConfig['desktop']['language']

const messages = {
  'en-US': {
    backgroundCloseBody: 'Lexora Buddy is still running in the background.',
    backgroundCloseTitle: 'Lexora Buddy remains available',
    open: 'Open Lexora Buddy',
    quit: 'Quit Lexora Buddy',
    restartRuntime: 'Restart local runtime',
    runtime: 'Local runtime: {status}',
    selectAttachments: 'Select attachments',
    selectProjectDirectory: 'Select project directory',
    statusOffline: 'offline',
    statusReady: 'ready',
    statusRestarting: 'restarting',
    statusStarting: 'starting',
    statusStopped: 'stopped',
    statusStopping: 'stopping',
  },
  'zh-CN': {
    backgroundCloseBody: 'Lexora Buddy 仍在后台运行。',
    backgroundCloseTitle: 'Lexora Buddy 仍可随时使用',
    open: '打开 Lexora Buddy',
    quit: '退出 Lexora Buddy',
    restartRuntime: '重新启动本地运行时',
    runtime: '本地运行时：{status}',
    selectAttachments: '选择附件',
    selectProjectDirectory: '选择项目目录',
    statusOffline: '离线',
    statusReady: '已就绪',
    statusRestarting: '正在重启',
    statusStarting: '正在启动',
    statusStopped: '已停止',
    statusStopping: '正在停止',
  },
} as const

type NativeMessageKey = keyof typeof messages['zh-CN']

export function translateDesktopNative(language: DesktopLanguage, key: NativeMessageKey) {
  return messages[language][key]
}

export function translateDesktopRuntimeStatus(
  language: DesktopLanguage,
  status: BuddyServiceSupervisorStatus,
) {
  const statusKey = `status${status[0]!.toUpperCase()}${status.slice(1)}` as NativeMessageKey
  return translateDesktopNative(language, 'runtime').replace(
    '{status}',
    translateDesktopNative(language, statusKey),
  )
}
