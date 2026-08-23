import type { ShellSandboxAssets } from '../../approvals/ShellSandbox'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'

import { createSandboxedFileTools } from '../../approvals/FileSandbox'
import { createSandboxedBashTool } from '../../approvals/ShellSandbox'

export interface CreateWorkspaceExtensionOptions {
  canonicalRoot: string
  shellSandboxAssets: ShellSandboxAssets
}

export function createWorkspaceExtension(
  options: CreateWorkspaceExtensionOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-workspace',
    factory(pi) {
      pi.registerTool(createSandboxedBashTool(
        options.canonicalRoot,
        options.shellSandboxAssets,
      ))
      for (const tool of createSandboxedFileTools(options.canonicalRoot))
        pi.registerTool(tool)
    },
  }
}
