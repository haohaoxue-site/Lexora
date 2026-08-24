import type { CreateAutomationToolOptions } from '../../automations/createAutomationTool'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import { createAutomationTool } from '../../automations/createAutomationTool'

export function createAutomationExtension(
  options: CreateAutomationToolOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-automation',
    factory(pi) {
      pi.registerTool(createAutomationTool(options))
    },
  }
}
