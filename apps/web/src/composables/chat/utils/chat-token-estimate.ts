import { estimateTextTokenCount, prettyTokenCount } from '@haohaoxue/samepage-shared/tokens'

export function estimateChatTextTokens(text: string): number {
  return estimateTextTokenCount(text)
}

export function formatChatTokenCount(value: number): string {
  return prettyTokenCount(value)
}
