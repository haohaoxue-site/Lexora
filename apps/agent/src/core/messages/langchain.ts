import type {
  AgentChatContextMessage,
  ChatSkillInvocation,
} from '@haohaoxue/samepage-contracts'
import type { BaseMessage } from '@langchain/core/messages'
import { AGENT_TRANSLATOR_SKILL_KEY } from '@haohaoxue/samepage-contracts'
import { AIMessage, HumanMessage } from '@langchain/core/messages'

export function toLangChainChatMessages(messages: AgentChatContextMessage[]): BaseMessage[] {
  return messages.map(toLangChainChatMessage)
}

export function toLangChainChatMessage(message: AgentChatContextMessage): BaseMessage {
  if (message.role === 'assistant') {
    return new AIMessage({
      id: message.id,
      content: message.content,
    })
  }

  return new HumanMessage({
    id: message.id,
    content: formatHumanMessageContent(message),
  })
}

function formatHumanMessageContent(message: AgentChatContextMessage): string {
  const skillInvocation = formatSkillInvocation(message.skillInvocation)
  if (!skillInvocation) {
    return message.content
  }

  return `${skillInvocation}\n\n${message.content}`
}

function formatSkillInvocation(skillInvocation: ChatSkillInvocation | null | undefined): string {
  if (!skillInvocation) {
    return ''
  }

  if (skillInvocation.skillKey === AGENT_TRANSLATOR_SKILL_KEY) {
    return [
      '[SamePage 技能选择]',
      `skillKey: ${skillInvocation.skillKey}`,
      'sourceLanguage: auto',
      `targetLanguage: ${skillInvocation.targetLanguage.name}`,
      skillInvocation.targetLanguage.tag ? `targetLanguageTag: ${skillInvocation.targetLanguage.tag}` : '',
      'instruction: 用户已在对话输入区选择翻译目标语言；本轮优先使用 translator skill，将用户正文翻译为目标语言。',
      '[SamePage 技能选择结束]',
    ].filter(Boolean).join('\n')
  }

  return ''
}
