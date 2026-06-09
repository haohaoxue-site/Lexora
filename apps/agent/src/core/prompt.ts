import type { AgentProfileConfig } from '@haohaoxue/samepage-contracts'

export const BASE_AGENT_SYSTEM_PROMPT = '你是 SamePage 的智能助手。回答准确、简洁，默认使用中文。'

const AGENT_HISTORY_DIGEST_PROMPT_PREFIX = '较早对话摘要：'

export interface CreateAgentSystemPromptOptions {
  olderMessagesExcerpt?: string
  historyDigestSummary?: string
  agentProfileConfig?: AgentProfileConfig | null
}

export function createAgentSystemPrompt(input: string | CreateAgentSystemPromptOptions): string {
  const options = typeof input === 'string'
    ? { olderMessagesExcerpt: input }
    : input
  const lines = [BASE_AGENT_SYSTEM_PROMPT]
  const profileConfig = options.agentProfileConfig

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
  }

  const historySummary = options.historyDigestSummary ?? options.olderMessagesExcerpt
  if (historySummary) {
    lines.push(AGENT_HISTORY_DIGEST_PROMPT_PREFIX, historySummary)
  }

  return lines.join('\n')
}
