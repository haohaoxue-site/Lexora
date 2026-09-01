import type { InlineExtension, SettingsManager } from '@earendil-works/pi-coding-agent'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BoundedContextFile } from './loadBoundedContextFiles'

import {
  DefaultResourceLoader,
  SettingsManager as PiSettingsManager,
} from '@earendil-works/pi-coding-agent'
import { createBuddySystemPrompt } from './buddySystemPrompt'
import { PI_BUILTIN_TOOL_NAME_SET } from './piBuiltinTools'

export interface BuddyInProcessExtension {
  factory: Exclude<InlineExtension, (...arguments_: never[]) => unknown>['factory']
  hidden?: boolean
  name: `lexora-${string}`
}

export interface CreateBuddyResourceLoaderOptions {
  approvedSkillPaths: readonly string[]
  agentDir: string
  boundedContextFiles: readonly BoundedContextFile[]
  cwd: string
  directoryContext: string
  executionProfile: BuddyExecutionProfile
  inProcessExtensions: readonly BuddyInProcessExtension[]
  platform?: NodeJS.Platform
  settingsManager?: SettingsManager
}

export function createBuddySettingsManager(): SettingsManager {
  return PiSettingsManager.inMemory({
    enableAnalytics: false,
    enableInstallTelemetry: false,
    extensions: [],
    packages: [],
    prompts: [],
    skills: [],
    themes: [],
  }, { projectTrusted: false })
}

export async function createBuddyResourceLoader(
  options: CreateBuddyResourceLoaderOptions,
): Promise<DefaultResourceLoader> {
  validateInProcessExtensions(options.inProcessExtensions)
  const systemPrompt = createBuddySystemPrompt({
    directoryContext: options.directoryContext,
    executionProfile: options.executionProfile,
    platform: options.platform,
  })
  const loader = new DefaultResourceLoader({
    additionalExtensionPaths: [],
    additionalPromptTemplatePaths: [],
    additionalSkillPaths: [...options.approvedSkillPaths],
    additionalThemePaths: [],
    agentDir: options.agentDir,
    agentsFilesOverride: () => ({ agentsFiles: [...options.boundedContextFiles] }),
    appendSystemPromptOverride: () => [],
    cwd: options.cwd,
    extensionFactories: [...options.inProcessExtensions],
    noContextFiles: true,
    noExtensions: true,
    noPromptTemplates: true,
    noSkills: true,
    noThemes: true,
    settingsManager: options.settingsManager ?? createBuddySettingsManager(),
    systemPrompt,
    systemPromptOverride: () => systemPrompt,
  })
  await loader.reload()
  validateLoadedExtensions(loader)
  return loader
}

export class BuddyResourceLoadError extends Error {
  readonly code: 'BUDDY_EXTENSION_LOAD_FAILED' | 'UNTRUSTED_EXTENSION_LOADED'

  constructor(code: BuddyResourceLoadError['code']) {
    super('Lexora Buddy could not load its runtime resources')
    this.name = 'BuddyResourceLoadError'
    this.code = code
  }
}

function validateInProcessExtensions(extensions: readonly BuddyInProcessExtension[]): void {
  if (extensions.some(extension => !extension.name.startsWith('lexora-')))
    throw new BuddyResourceLoadError('UNTRUSTED_EXTENSION_LOADED')
}

function validateLoadedExtensions(loader: DefaultResourceLoader): void {
  const result = loader.getExtensions()
  const hasInvalidToolName = result.extensions.some(extension => (
    [...extension.tools.keys()].some(toolName => (
      PI_BUILTIN_TOOL_NAME_SET.has(toolName)
      || (!toolName.startsWith('lexora_') && !toolName.startsWith('mcp__'))
    ))
  ))
  if (result.errors.length || hasInvalidToolName)
    throw new BuddyResourceLoadError('BUDDY_EXTENSION_LOAD_FAILED')
  if (result.extensions.some(extension => !extension.path.startsWith('<inline:lexora-')))
    throw new BuddyResourceLoadError('UNTRUSTED_EXTENSION_LOADED')
}
