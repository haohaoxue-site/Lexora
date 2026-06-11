import { z } from 'zod'
import {
  AGENT_MEMORY_SKILL_KEY,
  AGENT_MEMORY_SKILL_MANIFEST,
  AGENT_MEMORY_SLOT_KEY,
} from './memory'
import {
  AGENT_TRANSLATOR_SKILL_KEY,
} from './translator'

const NonEmptyStringSchema = z.string().trim().min(1)

export const AGENT_SKILL_CATEGORY = {
  MEMORY: 'memory',
  PRODUCTIVITY: 'productivity',
  KNOWLEDGE: 'knowledge',
  COLLABORATION: 'collaboration',
  SYSTEM: 'system',
} as const

export const AGENT_SKILL_CATEGORY_VALUES = [
  AGENT_SKILL_CATEGORY.MEMORY,
  AGENT_SKILL_CATEGORY.PRODUCTIVITY,
  AGENT_SKILL_CATEGORY.KNOWLEDGE,
  AGENT_SKILL_CATEGORY.COLLABORATION,
  AGENT_SKILL_CATEGORY.SYSTEM,
] as const

export const AGENT_SKILL_ACTIVATION_MODE = {
  ALWAYS_ON: 'always_on',
  MODEL_SELECTED: 'model_selected',
  MANUAL: 'manual',
} as const

export const AGENT_SKILL_ACTIVATION_MODE_VALUES = [
  AGENT_SKILL_ACTIVATION_MODE.ALWAYS_ON,
  AGENT_SKILL_ACTIVATION_MODE.MODEL_SELECTED,
  AGENT_SKILL_ACTIVATION_MODE.MANUAL,
] as const

export const AGENT_SKILL_RISK_LEVEL = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const

export const AGENT_SKILL_RISK_LEVEL_VALUES = [
  AGENT_SKILL_RISK_LEVEL.LOW,
  AGENT_SKILL_RISK_LEVEL.MEDIUM,
  AGENT_SKILL_RISK_LEVEL.HIGH,
] as const

export const AGENT_SKILL_SOURCE_SCOPE = {
  BUILTIN: 'builtin',
  EXTERNAL: 'external',
} as const

export const AGENT_SKILL_SOURCE_SCOPE_VALUES = [
  AGENT_SKILL_SOURCE_SCOPE.BUILTIN,
  AGENT_SKILL_SOURCE_SCOPE.EXTERNAL,
] as const

export const AGENT_SKILL_INSTALL_MODE = {
  CORE: 'core',
  OPTIONAL: 'optional',
} as const

export const AGENT_SKILL_INSTALL_MODE_VALUES = [
  AGENT_SKILL_INSTALL_MODE.CORE,
  AGENT_SKILL_INSTALL_MODE.OPTIONAL,
] as const

export const AgentSkillCategorySchema = z.enum(AGENT_SKILL_CATEGORY_VALUES)
export const AgentSkillActivationModeSchema = z.enum(AGENT_SKILL_ACTIVATION_MODE_VALUES)
export const AgentSkillRiskLevelSchema = z.enum(AGENT_SKILL_RISK_LEVEL_VALUES)
export const AgentSkillSourceScopeSchema = z.enum(AGENT_SKILL_SOURCE_SCOPE_VALUES)
export const AgentSkillInstallModeSchema = z.enum(AGENT_SKILL_INSTALL_MODE_VALUES)

export const AgentSkillToolCardSchema = z.object({
  name: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
}).strict()

export const AgentSkillBindingConfigSchema = z.record(z.string(), z.unknown())

export const AgentSkillBindingSchema = z.object({
  key: NonEmptyStringSchema,
  enabled: z.boolean().default(true),
  config: AgentSkillBindingConfigSchema.default({}),
  priority: z.number().int().nonnegative().default(0),
}).strict()

export const AgentSkillDefinitionSchema = z.object({
  key: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  category: AgentSkillCategorySchema,
  activationMode: AgentSkillActivationModeSchema,
  riskLevel: AgentSkillRiskLevelSchema,
  builtIn: z.boolean(),
  installMode: AgentSkillInstallModeSchema,
  defaultInstalled: z.boolean(),
  defaultEnabled: z.boolean(),
  canDisable: z.boolean(),
  canUninstall: z.boolean(),
  instructions: NonEmptyStringSchema,
  tools: z.array(AgentSkillToolCardSchema).default([]),
}).strict()

export const AgentSkillResourceFileSchema = z.object({
  path: NonEmptyStringSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: NonEmptyStringSchema,
  executable: z.boolean().default(false),
}).strict()

export const AgentSkillCardSchema = AgentSkillDefinitionSchema.omit({
  instructions: true,
}).extend({
  installed: z.boolean(),
  enabled: z.boolean(),
  canInstall: z.boolean(),
  canEnable: z.boolean(),
  canDisable: z.boolean(),
  canUninstall: z.boolean(),
  config: AgentSkillBindingConfigSchema.default({}),
  sourceScope: AgentSkillSourceScopeSchema,
  resourceCount: z.number().int().nonnegative().default(0),
  scriptExecutionEnabled: z.boolean().default(false),
}).strict()

export const AgentSkillSelectionSnapshotSchema = z.object({
  selectedSkillKeys: z.array(NonEmptyStringSchema),
  availableSkillKeys: z.array(NonEmptyStringSchema),
  createdAt: z.string().datetime(),
}).strict()

export const ListAgentSkillsResponseSchema = z.object({
  skills: z.array(AgentSkillCardSchema),
  mySkills: z.array(AgentSkillCardSchema),
}).strict()

export const MutateAgentSkillParamsSchema = z.object({
  skillKey: NonEmptyStringSchema,
}).strict()

export const MutateAgentSkillResponseSchema = z.object({
  skill: AgentSkillCardSchema,
}).strict()

export const UpdateAgentSkillConfigParamsSchema = z.object({
  skillKey: NonEmptyStringSchema,
}).strict()

export const UpdateAgentSkillConfigRequestSchema = z.object({
  config: AgentSkillBindingConfigSchema,
}).strict()

export const UpdateAgentSkillConfigResponseSchema = z.object({
  skill: AgentSkillCardSchema,
}).strict()

export const AgentRuntimeSkillCatalogItemSchema = z.object({
  key: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  activationMode: AgentSkillActivationModeSchema,
  sourceScope: AgentSkillSourceScopeSchema,
  builtIn: z.boolean(),
  tools: z.array(AgentSkillToolCardSchema).default([]),
}).strict()

export const AgentRuntimeSkillContextSchema = z.object({
  availableSkills: z.array(AgentRuntimeSkillCatalogItemSchema).default([]),
}).strict().default({
  availableSkills: [],
})

export const ActivateAgentSkillRequestSchema = z.object({
  actorUserId: NonEmptyStringSchema,
  generationId: NonEmptyStringSchema,
  skillKey: NonEmptyStringSchema,
}).strict()

export const ActivateAgentSkillResponseSchema = z.object({
  skill: AgentRuntimeSkillCatalogItemSchema.extend({
    instructions: NonEmptyStringSchema,
    resources: z.array(AgentSkillResourceFileSchema),
  }).strict(),
}).strict()

export const ReadAgentSkillResourceRequestSchema = z.object({
  actorUserId: NonEmptyStringSchema,
  generationId: NonEmptyStringSchema,
  skillKey: NonEmptyStringSchema,
  path: NonEmptyStringSchema,
}).strict()

export const ReadAgentSkillResourceResponseSchema = z.object({
  skillKey: NonEmptyStringSchema,
  path: NonEmptyStringSchema,
  content: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: NonEmptyStringSchema,
}).strict()

export const AGENT_MEMORY_SKILL_DEFINITION = AgentSkillDefinitionSchema.parse({
  key: AGENT_MEMORY_SKILL_KEY,
  name: AGENT_MEMORY_SKILL_MANIFEST.title,
  description: AGENT_MEMORY_SKILL_MANIFEST.description,
  category: AGENT_SKILL_CATEGORY.MEMORY,
  activationMode: AGENT_SKILL_ACTIVATION_MODE.ALWAYS_ON,
  riskLevel: AGENT_SKILL_RISK_LEVEL.MEDIUM,
  builtIn: true,
  installMode: AGENT_SKILL_INSTALL_MODE.CORE,
  defaultInstalled: true,
  defaultEnabled: true,
  canDisable: false,
  canUninstall: false,
  instructions: [
    'Use this skill when the conversation contains durable user preferences, profile facts, agent personalization, project references, task knowledge, memory corrections, or forget requests.',
    'Decide from semantic meaning, not from a specific language or keyword. The user may speak Chinese, English, Japanese, German, or another language.',
    'Only save information that is likely to be useful across future conversations. Do not save short-lived task state, secrets, credentials, or unsupported guesses.',
    `When the user gives the agent a name, nickname, or asks to call you by a name, use memory_update with scope=user_agent, lane=agent_personalization, slotKey=${AGENT_MEMORY_SLOT_KEY.AGENT_NAME}, and slotValue set to the requested name.`,
    'For low-risk high-confidence memories, call the appropriate memory tool. Sensitive, low-confidence, conflicting, or high-impact operations must be grounded by ids or slots and may be converted to confirmation by policy.',
  ].join('\n'),
  tools: AGENT_MEMORY_SKILL_MANIFEST.tools.map(tool => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
  })),
})

export const AGENT_TRANSLATOR_SKILL_DEFINITION = AgentSkillDefinitionSchema.parse({
  key: AGENT_TRANSLATOR_SKILL_KEY,
  name: '翻译',
  description: '自动识别源语言，并按本轮指令或默认配置翻译为目标语言。',
  category: AGENT_SKILL_CATEGORY.PRODUCTIVITY,
  activationMode: AGENT_SKILL_ACTIVATION_MODE.MODEL_SELECTED,
  riskLevel: AGENT_SKILL_RISK_LEVEL.LOW,
  builtIn: true,
  installMode: AGENT_SKILL_INSTALL_MODE.OPTIONAL,
  defaultInstalled: false,
  defaultEnabled: true,
  canDisable: true,
  canUninstall: true,
  instructions: [
    'Use this skill when the user asks to translate, localize, render text in another language, or compare multilingual wording.',
    'Always auto-detect the source language. Do not require the user to specify the source language unless the input is ambiguous.',
    'Resolve the target language by this priority: explicit user instruction in the current turn, activated skill configuration, then ask the user for the target language.',
    'Preserve markdown, lists, tables, code fences, links, mentions, and document structure unless the user explicitly asks to rewrite the format.',
    'If the source language already matches the target language, still render the text naturally in the target language without asking for a separate policy.',
    'Only translate or localize. Do not store memories, edit documents directly, or invent source text that was not provided.',
    'If the user asks for multiple target languages, provide clearly separated sections for each target.',
  ].join('\n'),
  tools: [],
})

export const AGENT_FIRST_PARTY_SKILL_DEFINITIONS = [
  AGENT_MEMORY_SKILL_DEFINITION,
  AGENT_TRANSLATOR_SKILL_DEFINITION,
] as const

export type AgentSkillCategory = z.infer<typeof AgentSkillCategorySchema>
export type AgentSkillActivationMode = z.infer<typeof AgentSkillActivationModeSchema>
export type AgentSkillRiskLevel = z.infer<typeof AgentSkillRiskLevelSchema>
export type AgentSkillSourceScope = z.infer<typeof AgentSkillSourceScopeSchema>
export type AgentSkillInstallMode = z.infer<typeof AgentSkillInstallModeSchema>
export type AgentSkillToolCard = z.infer<typeof AgentSkillToolCardSchema>
export type AgentSkillBindingConfig = z.infer<typeof AgentSkillBindingConfigSchema>
export type AgentSkillBinding = z.infer<typeof AgentSkillBindingSchema>
export type AgentSkillDefinition = z.infer<typeof AgentSkillDefinitionSchema>
export type AgentSkillResourceFile = z.infer<typeof AgentSkillResourceFileSchema>
export type AgentSkillCard = z.infer<typeof AgentSkillCardSchema>
export type AgentSkillSelectionSnapshot = z.infer<typeof AgentSkillSelectionSnapshotSchema>
export type ListAgentSkillsResponse = z.infer<typeof ListAgentSkillsResponseSchema>
export type MutateAgentSkillParams = z.infer<typeof MutateAgentSkillParamsSchema>
export type MutateAgentSkillResponse = z.infer<typeof MutateAgentSkillResponseSchema>
export type UpdateAgentSkillConfigParams = z.infer<typeof UpdateAgentSkillConfigParamsSchema>
export type UpdateAgentSkillConfigRequest = z.infer<typeof UpdateAgentSkillConfigRequestSchema>
export type UpdateAgentSkillConfigResponse = z.infer<typeof UpdateAgentSkillConfigResponseSchema>
export type AgentRuntimeSkillCatalogItem = z.infer<typeof AgentRuntimeSkillCatalogItemSchema>
export type AgentRuntimeSkillContext = z.infer<typeof AgentRuntimeSkillContextSchema>
export type ActivateAgentSkillRequest = z.infer<typeof ActivateAgentSkillRequestSchema>
export type ActivateAgentSkillResponse = z.infer<typeof ActivateAgentSkillResponseSchema>
export type ReadAgentSkillResourceRequest = z.infer<typeof ReadAgentSkillResourceRequestSchema>
export type ReadAgentSkillResourceResponse = z.infer<typeof ReadAgentSkillResourceResponseSchema>
