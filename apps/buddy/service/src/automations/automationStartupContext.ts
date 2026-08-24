import type { AutomationStartupContext } from '../../../shared/automation'
import { automationStartupContextSchema } from '../../../shared/automation'

export function readAutomationStartupContext(
  environment: NodeJS.ProcessEnv,
): AutomationStartupContext {
  const reason = environment.LEXORA_BUDDY_STARTUP_REASON ?? 'normal'
  return automationStartupContextSchema.parse({
    reason,
    restoreToken: reason === 'data_restore'
      ? environment.LEXORA_BUDDY_RESTORE_TOKEN ?? null
      : null,
  })
}
