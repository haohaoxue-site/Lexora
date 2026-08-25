import accountAvatarUrl from './account-avatar.svg'
import messageBranchNextUrl from './message-branch-next.svg'
import messageBranchPreviousUrl from './message-branch-previous.svg'
import messageCopiedUrl from './message-copied.svg'
import messageCopyUrl from './message-copy.svg'
import messageEditUrl from './message-edit.svg'
import messageRetryUrl from './message-retry.svg'
import navigationAutomationUrl from './navigation-automation.svg'
import notificationMarkAllReadUrl from './notification-mark-all-read.svg'
import windowCloseUrl from './window-close.svg'
import windowMaximizeUrl from './window-maximize.svg'
import windowMinimizeUrl from './window-minimize.svg'
import windowPinUrl from './window-pin.svg'
import windowRestoreUrl from './window-restore.svg'

export const DESKTOP_ICON_URLS = {
  accountAvatar: accountAvatarUrl,
  messageBranchNext: messageBranchNextUrl,
  messageBranchPrevious: messageBranchPreviousUrl,
  messageCopied: messageCopiedUrl,
  messageCopy: messageCopyUrl,
  messageEdit: messageEditUrl,
  messageRetry: messageRetryUrl,
  navigationAutomation: navigationAutomationUrl,
  notificationMarkAllRead: notificationMarkAllReadUrl,
  windowClose: windowCloseUrl,
  windowMaximize: windowMaximizeUrl,
  windowMinimize: windowMinimizeUrl,
  windowPin: windowPinUrl,
  windowRestore: windowRestoreUrl,
} as const

export type DesktopIconName = keyof typeof DESKTOP_ICON_URLS
