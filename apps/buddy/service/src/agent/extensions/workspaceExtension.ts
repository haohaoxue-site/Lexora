import type { BuddyExecutionProfile } from '../../../../shared/executionProfile'
import type { ShellSandboxAssets } from '../../approvals/ShellSandbox'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'

import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from '@earendil-works/pi-coding-agent'
import { createSandboxedFileTools } from '../../approvals/FileSandbox'
import { createSandboxedBashTool } from '../../approvals/ShellSandbox'

export interface CreateWorkspaceExtensionOptions {
  canonicalRoot: string
  executionProfile: BuddyExecutionProfile
  shellSandboxAssets: ShellSandboxAssets
}

export function createWorkspaceExtension(
  options: CreateWorkspaceExtensionOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-workspace',
    factory(pi) {
      if (options.executionProfile === 'full_access') {
        pi.registerTool(createBashToolDefinition(
          options.canonicalRoot,
          { exposeSessionEnvironment: false },
        ))
        pi.registerTool(createEditToolDefinition(options.canonicalRoot))
        pi.registerTool(createFindToolDefinition(options.canonicalRoot))
        pi.registerTool(createGrepToolDefinition(options.canonicalRoot))
        pi.registerTool(createLsToolDefinition(options.canonicalRoot))
        pi.registerTool(createReadToolDefinition(options.canonicalRoot))
        pi.registerTool(createWriteToolDefinition(options.canonicalRoot))
        return
      }
      pi.registerTool(createSandboxedBashTool(
        options.canonicalRoot,
        options.shellSandboxAssets,
      ))
      for (const tool of createSandboxedFileTools(options.canonicalRoot))
        pi.registerTool(tool)
    },
  }
}
