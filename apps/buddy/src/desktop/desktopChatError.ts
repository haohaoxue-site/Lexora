import type { BuddyLocale } from '@/i18n/buddyI18n'
import { translateBuddy } from '@/i18n/buddyI18n'
import { parseLocalChatPublicError } from '../../electron/shared/localChatApi'

export function isProviderLoginCancelled(error: unknown): boolean {
  return error instanceof Error
    && parseLocalChatPublicError(error.message)?.code === 'PROVIDER_LOGIN_CANCELLED'
}

export function normalizeDesktopError(error: unknown, language: BuddyLocale): string {
  const parsed = error instanceof Error ? parseLocalChatPublicError(error.message) : null
  if (!parsed)
    return translateBuddy(language, 'desktop.chat.unknownError')

  const keys = {
    APPROVAL_REQUIRED: 'desktop.error.approvalRequired',
    AUTHENTICATION_REQUIRED: 'desktop.error.authenticationRequired',
    CONNECTOR_UNAVAILABLE: 'desktop.error.connectorUnavailable',
    CREDENTIAL_STORE_UNAVAILABLE: 'desktop.error.credentialStore',
    DIRECTORY_NOT_AUTHORIZED: 'desktop.error.directoryNotAuthorized',
    LOCAL_CHAT_OPERATION_FAILED: 'desktop.chat.unknownError',
    MODEL_SYNC_FAILED: 'desktop.error.modelSyncFailed',
    MODEL_SYNC_UNSUPPORTED: 'desktop.error.modelSyncUnsupported',
    PATH_OUTSIDE_GRANTED_DIRECTORY: 'desktop.error.pathOutsideDirectory',
    PROJECT_HAS_ACTIVE_RUNS: 'desktop.error.projectHasActiveRuns',
    PROVIDER_HAS_ACTIVE_RUNS: 'desktop.error.providerHasActiveRuns',
    PROVIDER_LOGIN_CANCELLED: 'desktop.error.providerLoginCancelled',
    PROVIDER_UNAVAILABLE: 'desktop.error.providerUnavailable',
    RUNTIME_PROTOCOL_ERROR: 'desktop.error.runtimeProtocol',
    RUNTIME_UNAVAILABLE: 'desktop.error.runtimeUnavailable',
    VALIDATION_FAILED: 'desktop.error.validation',
  } as const
  return translateBuddy(language, keys[parsed.code])
}
