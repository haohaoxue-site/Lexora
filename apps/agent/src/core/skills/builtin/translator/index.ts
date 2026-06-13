import type {
  AgentChatContextMessage,
  AgentProfileConfig,
  AgentRuntimeSkillContext,
  AgentTranslatorSkillConfig,
  AgentTranslatorTargetLanguage,
} from '@haohaoxue/lexora-contracts'
import {
  AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG,
  AGENT_TRANSLATOR_FORMALITY,
  AGENT_TRANSLATOR_OUTPUT_MODE,
  AGENT_TRANSLATOR_SKILL_KEY,
  AgentTranslatorSkillConfigSchema,
} from '@haohaoxue/lexora-contracts'

export interface FocusedTranslatorInvocation {
  skillKey: typeof AGENT_TRANSLATOR_SKILL_KEY
  targetLanguage: AgentTranslatorTargetLanguage
  config: AgentTranslatorSkillConfig
}

export function resolveFocusedTranslatorInvocation(input: {
  messages: AgentChatContextMessage[]
  triggerUserMessageId: string | null | undefined
  agentProfileConfig?: AgentProfileConfig | null
  skillContext?: AgentRuntimeSkillContext | null
}): FocusedTranslatorInvocation | null {
  if (!input.triggerUserMessageId) {
    return null
  }

  const triggerMessage = input.messages.find(message =>
    message.id === input.triggerUserMessageId && message.role === 'user',
  )
  const skillInvocation = triggerMessage?.skillInvocation

  if (skillInvocation?.skillKey !== AGENT_TRANSLATOR_SKILL_KEY) {
    return null
  }

  if (!isTranslatorAvailable(input.skillContext)) {
    return null
  }

  return {
    skillKey: skillInvocation.skillKey,
    targetLanguage: skillInvocation.targetLanguage,
    config: resolveTranslatorSkillConfig(input.agentProfileConfig),
  }
}

export function createFocusedTranslatorThreadId(threadId: string, generationId: string): string {
  return `${threadId}:translator:${generationId}`
}

export function createFocusedTranslatorSystemPrompt(invocation: FocusedTranslatorInvocation): string {
  return [
    '你是 Lexora 的专用翻译助手。',
    '只翻译用户提供的正文，不回答正文问题，不补充对话历史，不使用外部上下文。',
    '自动识别源语言。',
    `targetLanguage: ${formatTranslatorTargetLanguage(invocation.targetLanguage)}`,
    'sameLanguageInput: 如果源文本已经接近目标语言，仍按目标语言自然表达，不询问、不解释。',
    `preserveFormatting: ${invocation.config.preserveFormatting ? 'true' : 'false'}`,
    `outputMode: ${formatTranslatorOutputMode(invocation.config.outputMode)}`,
    `formality: ${formatTranslatorFormality(invocation.config.formality)}`,
    '除非 outputMode 要求双语或注释，否则只输出译文。',
  ].join('\n')
}

export function createFocusedTranslatorHumanContent(message: AgentChatContextMessage): string {
  return [
    '[需要翻译的正文]',
    message.content,
  ].join('\n')
}

function resolveTranslatorSkillConfig(agentProfileConfig: AgentProfileConfig | null | undefined): AgentTranslatorSkillConfig {
  const binding = agentProfileConfig?.skillBindings.find(item => item.key === AGENT_TRANSLATOR_SKILL_KEY)
  const parsed = AgentTranslatorSkillConfigSchema.safeParse(binding?.config ?? AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG)
  return parsed.success ? parsed.data : AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG
}

function isTranslatorAvailable(skillContext: AgentRuntimeSkillContext | null | undefined): boolean {
  return Boolean(skillContext?.availableSkills.some(skill => skill.key === AGENT_TRANSLATOR_SKILL_KEY))
}

function formatTranslatorTargetLanguage(language: AgentTranslatorTargetLanguage): string {
  return language.tag ? `${language.name} [${language.tag}]` : language.name
}

function formatTranslatorOutputMode(mode: AgentTranslatorSkillConfig['outputMode']): string {
  if (mode === AGENT_TRANSLATOR_OUTPUT_MODE.BILINGUAL) {
    return 'bilingual'
  }

  if (mode === AGENT_TRANSLATOR_OUTPUT_MODE.WITH_NOTES) {
    return 'translation with brief notes'
  }

  return 'translation only'
}

function formatTranslatorFormality(formality: AgentTranslatorSkillConfig['formality']): string {
  if (formality === AGENT_TRANSLATOR_FORMALITY.FORMAL) {
    return 'formal'
  }

  if (formality === AGENT_TRANSLATOR_FORMALITY.CASUAL) {
    return 'casual'
  }

  if (formality === AGENT_TRANSLATOR_FORMALITY.NEUTRAL) {
    return 'neutral'
  }

  return 'auto'
}
