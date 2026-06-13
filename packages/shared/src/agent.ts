import { AGENT_CHAT_THREAD_PREFIX } from '@haohaoxue/lexora-contracts/agent/chat'

export function buildAgentChatThreadId(sessionId: string): string {
  return `${AGENT_CHAT_THREAD_PREFIX}${sessionId}`
}
