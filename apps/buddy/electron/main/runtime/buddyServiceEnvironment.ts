import type { AutomationStartupContext } from '../../../shared/automation'
import { createHash } from 'node:crypto'
import { automationStartupContextSchema } from '../../../shared/automation'

interface BuddyServiceRecoveryReceipt {
  action: string
  backupId: string | null
  completedAt: string
  operationId: string | null
}

export function createBuddyServiceEnvironment(
  source: NodeJS.ProcessEnv,
  buddyHome: string,
  startupContext: AutomationStartupContext = { reason: 'normal', restoreToken: null },
): NodeJS.ProcessEnv {
  const startup = automationStartupContextSchema.parse(startupContext)
  const environment: NodeJS.ProcessEnv = {
    LANG: source.LANG,
    LC_ALL: source.LC_ALL,
    LEXORA_BUDDY_HOME: buddyHome,
    LEXORA_BUDDY_RESTORE_TOKEN: startup.restoreToken ?? undefined,
    LEXORA_BUDDY_STARTUP_REASON: startup.reason,
    NO_PROXY: source.NO_PROXY,
    PATH: source.PATH,
    TMPDIR: source.TMPDIR,
    TZ: source.TZ,
    http_proxy: source.http_proxy,
    https_proxy: source.https_proxy,
    no_proxy: source.no_proxy,
  }
  return Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string'
  )))
}

export function resolveBuddyServiceStartupContext(
  receipt: BuddyServiceRecoveryReceipt | null,
): AutomationStartupContext {
  if (
    !receipt
    || !['kept_restored_data', 'restored_previous_data'].includes(receipt.action)
  ) {
    return { reason: 'normal', restoreToken: null }
  }
  const restoreToken = createHash('sha256')
    .update(JSON.stringify({
      action: receipt.action,
      backupId: receipt.backupId,
      completedAt: receipt.completedAt,
      operationId: receipt.operationId,
    }))
    .digest('hex')
  return automationStartupContextSchema.parse({ reason: 'data_restore', restoreToken })
}
