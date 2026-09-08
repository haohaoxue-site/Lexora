import type { SystemActionApprovalReview } from '@buddy-shared/permissions/approvalReviewPayload'
import type { BuddyLocale } from '@/i18n/buddyMessages'
import { translateBuddy } from '@/i18n/buddyMessages'

export function translateSystemAction(
  locale: BuddyLocale,
  action: SystemActionApprovalReview['action'],
): string {
  switch (action) {
    case 'kill-process': return translateBuddy(locale, 'desktop.approval.systemAction.killProcess')
    case 'restart-service': return translateBuddy(locale, 'desktop.approval.systemAction.restartService')
    case 'start-service': return translateBuddy(locale, 'desktop.approval.systemAction.startService')
    case 'stop-service': return translateBuddy(locale, 'desktop.approval.systemAction.stopService')
    case 'terminate-process': return translateBuddy(locale, 'desktop.approval.systemAction.terminateProcess')
  }
}

export function translateSystemInterruption(
  locale: BuddyLocale,
  interruption: SystemActionApprovalReview['interruption'],
): string {
  switch (interruption) {
    case 'application': return translateBuddy(locale, 'desktop.approval.systemInterruption.application')
    case 'network': return translateBuddy(locale, 'desktop.approval.systemInterruption.network')
    case 'none': return translateBuddy(locale, 'desktop.approval.systemInterruption.none')
    case 'service': return translateBuddy(locale, 'desktop.approval.systemInterruption.service')
  }
}

export function translateSystemToolStatus(
  locale: BuddyLocale,
  status: string | null,
): string {
  switch (status) {
    case 'action-expired': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.actionExpired')
    case 'awaiting-approval': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.awaitingApproval')
    case 'completed': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.completed')
    case 'failed': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.failed')
    case 'needs-escalation': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.needsEscalation')
    case 'running': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.running')
    case 'target-ambiguous': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.targetAmbiguous')
    case 'target-changed': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.targetChanged')
    case 'target-not-found': return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.targetNotFound')
    default: return translateBuddy(locale, 'desktop.chat.processToolSystemStatus.unknown')
  }
}
