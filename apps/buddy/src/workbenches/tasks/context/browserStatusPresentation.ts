import type {
  DesktopBrowserErrorCode,
  DesktopBrowserState,
} from '@buddy-electron/shared/desktopApi'
import type { BrowserSurfaceFailure } from './useBrowserContextSurface'
import type { BuddyI18nKey } from '@/i18n/buddyI18n'

export type BrowserStatusTone = 'danger' | 'muted' | 'warning'

export interface BrowserStatusPresentation {
  messageKey: BuddyI18nKey
  tone: BrowserStatusTone
}

const ERROR_PRESENTATIONS = {
  BROWSER_CERTIFICATE_ERROR: {
    messageKey: 'desktop.context.browserCertificateError',
    tone: 'danger',
  },
  BROWSER_LOCAL_SERVER_UNREACHABLE: {
    messageKey: 'desktop.context.browserLocalServerUnreachable',
    tone: 'warning',
  },
  BROWSER_NAVIGATION_BLOCKED: {
    messageKey: 'desktop.context.browserNavigationBlocked',
    tone: 'danger',
  },
  BROWSER_PAGE_CRASHED: {
    messageKey: 'desktop.context.browserPageCrashed',
    tone: 'danger',
  },
  BROWSER_PAGE_FAILED: {
    messageKey: 'desktop.context.browserPageFailed',
    tone: 'danger',
  },
  BROWSER_PAGE_UNRESPONSIVE: {
    messageKey: 'desktop.context.browserPageUnresponsive',
    tone: 'warning',
  },
  BROWSER_PERMISSION_DENIED: {
    messageKey: 'desktop.context.browserPermissionDenied',
    tone: 'warning',
  },
  BROWSER_SESSION_EVICTED: {
    messageKey: 'desktop.context.browserSessionEvicted',
    tone: 'warning',
  },
  BROWSER_SESSION_LIMIT_REACHED: {
    messageKey: 'desktop.context.browserSessionLimitReached',
    tone: 'warning',
  },
  BROWSER_SESSION_NOT_FOUND: {
    messageKey: 'desktop.context.browserSessionNotFound',
    tone: 'warning',
  },
} satisfies Record<DesktopBrowserErrorCode, BrowserStatusPresentation>

const FAILURE_PRESENTATIONS = {
  'control': {
    messageKey: 'desktop.context.browserTakeControlFailed',
    tone: 'danger',
  },
  'local-file': {
    messageKey: 'desktop.context.browserLocalFileFailed',
    tone: 'danger',
  },
  'navigation': {
    messageKey: 'desktop.context.browserNavigationFailed',
    tone: 'danger',
  },
  'navigation-input': {
    messageKey: 'desktop.context.browserNavigationBlocked',
    tone: 'danger',
  },
  'profile': {
    messageKey: 'desktop.context.browserProfileFailed',
    tone: 'warning',
  },
  'profile-reset': {
    messageKey: 'desktop.context.browserProfileResetFailed',
    tone: 'warning',
  },
  'session': {
    messageKey: 'desktop.context.browserSessionFailed',
    tone: 'warning',
  },
  'surface': {
    messageKey: 'desktop.context.browserSurfaceFailed',
    tone: 'danger',
  },
} satisfies Record<BrowserSurfaceFailure, BrowserStatusPresentation>

export function getBrowserStatusPresentation(
  state: DesktopBrowserState | null,
  failure: BrowserSurfaceFailure | null,
): BrowserStatusPresentation {
  if (failure === 'navigation-input')
    return FAILURE_PRESENTATIONS[failure]
  if (state?.error)
    return ERROR_PRESENTATIONS[state.error.code]
  if (failure)
    return FAILURE_PRESENTATIONS[failure]
  if (state?.status === 'error')
    return FAILURE_PRESENTATIONS.navigation
  if (state?.status === 'loading') {
    return {
      messageKey: 'desktop.context.browserLoading',
      tone: 'muted',
    }
  }
  if (state?.url && state.url !== 'about:blank') {
    return {
      messageKey: 'desktop.context.browserReady',
      tone: 'muted',
    }
  }
  return {
    messageKey: 'desktop.context.browserEmpty',
    tone: 'muted',
  }
}
