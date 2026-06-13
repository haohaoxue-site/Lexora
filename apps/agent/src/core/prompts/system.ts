import type {
  AgentProfileConfig,
  AgentRuntimeSkillContext,
  ResolvedLanguagePreference,
} from '@haohaoxue/lexora-contracts'
import { LANGUAGE_PREFERENCE, LANGUAGE_PREFERENCE_LABELS } from '@haohaoxue/lexora-contracts/user/constants'
import { createSkillCatalogPromptBlock } from '../skills/runtime'

export const BASE_AGENT_SYSTEM_PROMPT = '你是 Lexora 的智能助手。回答准确、简洁。'

const AGENT_HISTORY_DIGEST_PROMPT_PREFIX = '较早对话摘要：'

export interface CreateAgentSystemPromptOptions {
  olderMessagesExcerpt?: string
  historyDigestSummary?: string
  agentProfileConfig?: AgentProfileConfig | null
  skillContext?: AgentRuntimeSkillContext | null
  defaultResponseLanguage?: ResolvedLanguagePreference
}

export function createAgentSystemPrompt(input: string | CreateAgentSystemPromptOptions): string {
  const options = typeof input === 'string'
    ? { olderMessagesExcerpt: input }
    : input
  const lines = [BASE_AGENT_SYSTEM_PROMPT]
  const profileConfig = options.agentProfileConfig

  lines.push(createDefaultResponseLanguageInstruction(
    options.defaultResponseLanguage ?? LANGUAGE_PREFERENCE.ZH_CN,
  ))

  if (profileConfig) {
    lines.push('Agent 指令：', profileConfig.instructions.systemPrompt)

    if (profileConfig.instructions.constraints.length > 0) {
      lines.push(
        '约束：',
        ...profileConfig.instructions.constraints.map(item => `- ${item}`),
      )
    }

    if (profileConfig.instructions.outputPreferences.length > 0) {
      lines.push(
        '输出偏好：',
        ...profileConfig.instructions.outputPreferences.map(item => `- ${item}`),
      )
    }

    const skillCatalog = profileConfig.toolPolicy.enabled
      ? createSkillCatalogPromptBlock(options.skillContext)
      : ''
    if (skillCatalog) {
      lines.push('可用技能：', skillCatalog)
    }
  }

  const historySummary = options.historyDigestSummary ?? options.olderMessagesExcerpt
  if (historySummary) {
    lines.push(AGENT_HISTORY_DIGEST_PROMPT_PREFIX, historySummary)
  }

  return lines.join('\n')
}

function createDefaultResponseLanguageInstruction(language: ResolvedLanguagePreference): string {
  return `默认回复语言：${LANGUAGE_PREFERENCE_LABELS[language]}。`
}
