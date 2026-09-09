import type { BuddyCapability } from '../agent/extensions/BuddyCapability'
import type { BuddyInProcessExtension } from '../agent/extensions/BuddyInProcessExtension'
import type { CreateAutomationToolOptions } from './createAutomationTool'
import { AUTOMATION_TOOL_NAME } from './automationToolContract'
import { classifyAutomationToolCall, createAutomationTool } from './createAutomationTool'

export function createAutomationCapability(options: CreateAutomationToolOptions): BuddyCapability {
  return {
    extension: createAutomationExtension(options),
    classify: event => classifyAutomationToolCall(options.service, event),
    disclosure: {
      group: 'automation',
      keywords: 'automation schedule cron 自动化 定时 任务 提醒 周期 每天 每周',
      toolNames: [AUTOMATION_TOOL_NAME],
    },
  }
}

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
