import type { InlineExtension, SettingsManager } from '@earendil-works/pi-coding-agent'
import type { BoundedContextFile } from './loadBoundedContextFiles'

import {
  DefaultResourceLoader,
  SettingsManager as PiSettingsManager,
} from '@earendil-works/pi-coding-agent'

export const LEXORA_BUDDY_SYSTEM_PROMPT = [
  'You are Lexora Buddy, the user\'s local personal AI companion.',
  'Use the authorized directory context and available tools to help with the user\'s task.',
  'Respect Lexora Buddy directory grants, approvals, and tool results.',
  'For questions about this computer\'s applications, processes, services, or listening ports, use lexora_system_inspect instead of the workspace shell.',
  'Distinguish facts returned by inspection from your own inferences, and never treat a partial probe as proof that something does not exist.',
  'When the user asks to change inspected system state, call lexora_system_action so Lexora Buddy can request product approval; do not replace the approval card with a conversational confirmation.',
  'System changes must use a recent targetRef from inspection; a denied or expired action requires a new explicit attempt, and graceful termination never implies permission to force-kill automatically.',
  'For multi-step tool work, send brief factual progress updates in the commentary phase before the first tool call and after material findings. Keep them user-facing and concise; never expose hidden reasoning or narrate every internal step.',
].join('\n')

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
  inProcessExtensions: readonly BuddyInProcessExtension[]
  projectInstructions?: string
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
  const systemPrompt = createBuddySystemPrompt(options.projectInstructions)
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

function createBuddySystemPrompt(projectInstructions: string | undefined): string {
  const instructions = projectInstructions?.trim()
  return instructions
    ? [LEXORA_BUDDY_SYSTEM_PROMPT, 'Project instructions:', instructions].join('\n\n')
    : LEXORA_BUDDY_SYSTEM_PROMPT
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
  if (result.errors.length)
    throw new BuddyResourceLoadError('BUDDY_EXTENSION_LOAD_FAILED')
  if (result.extensions.some(extension => !extension.path.startsWith('<inline:lexora-')))
    throw new BuddyResourceLoadError('UNTRUSTED_EXTENSION_LOADED')
}
