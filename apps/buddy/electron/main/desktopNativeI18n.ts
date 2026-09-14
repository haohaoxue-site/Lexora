import type { LexoraConfig } from '../shared/desktopApi'

type DesktopLanguage = LexoraConfig['desktop']['language']

const messages = {
  'en-US': {
    backgroundCloseBody: 'Lexora Buddy is still running in the background.',
    backgroundCloseTitle: 'Lexora Buddy remains available',
    open: 'Open',
    powerShellUnavailable: 'No usable PowerShell installation was found. Install PowerShell 7 or restore Windows PowerShell, then restart Lexora Buddy.',
    startupFailed: 'Lexora Buddy could not start',
    startupFailureHelp: 'Open the logs folder to view the diagnostic information.',
    privateDirectoriesUnsafe: 'An application data directory does not meet the required access permissions or points to another location. Check its permissions and location, then try again.',
    privateDirectoriesFailed: 'Lexora Buddy could not prepare its application data directories. Check the diagnostic information for the failed operation.',
    openLogs: 'Open logs folder',
    diagnosticReference: 'Diagnostic reference',
    powerShellLegacyNotice: 'PowerShell 7 is recommended but was not found or could not start. Lexora Buddy will use Windows PowerShell 5.1. Some commands, modules and default encodings differ; you can continue without installing PowerShell 7.',
    continueWithLegacyPowerShell: 'Continue with Windows PowerShell 5.1',
    viewPowerShellInstallGuide: 'View PowerShell 7 installation guide',
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
    powerShellUnavailable: '未找到可用的 PowerShell。请安装 PowerShell 7 或修复系统自带的 Windows PowerShell，然后重新启动 Lexora Buddy。',
    startupFailed: 'Lexora Buddy 启动失败',
    startupFailureHelp: '可以打开日志目录查看诊断信息。',
    privateDirectoriesUnsafe: '应用数据目录的访问权限不符合要求，或目录指向了其他位置。请检查目录权限和位置后重试。',
    privateDirectoriesFailed: '无法准备应用数据目录，请查看诊断信息中的失败操作。',
    openLogs: '打开日志目录',
    diagnosticReference: '诊断编号',
    powerShellLegacyNotice: '未找到可用的 PowerShell 7，Buddy 将使用系统自带的 Windows PowerShell 5.1。两者的部分命令、模块和默认编码存在差异；推荐安装 PowerShell 7，您也可以不安装并继续使用。',
    continueWithLegacyPowerShell: '继续使用 Windows PowerShell 5.1',
    viewPowerShellInstallGuide: '查看 PowerShell 7 安装说明',
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
