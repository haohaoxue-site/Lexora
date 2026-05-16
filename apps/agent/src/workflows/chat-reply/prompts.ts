export const CHAT_REPLY_SYSTEM_PROMPT = '你是 SamePage 的聊天助手。回答准确、简洁，默认使用中文。'

const CHAT_REPLY_OLDER_MESSAGES_EXCERPT_PROMPT_PREFIX = '较早对话摘录：'

export function createChatReplySystemPrompt(olderMessagesExcerpt: string): string {
  if (!olderMessagesExcerpt) {
    return CHAT_REPLY_SYSTEM_PROMPT
  }

  return `${CHAT_REPLY_SYSTEM_PROMPT}\n\n${CHAT_REPLY_OLDER_MESSAGES_EXCERPT_PROMPT_PREFIX}\n${olderMessagesExcerpt}`
}
