export interface ChatStreamingProbe {
  coalesceMs?: number
  recordChatEvent?: (entry: Record<string, unknown>) => void
  recordCoalesce?: (entry: Record<string, unknown>) => void
  recordMarkdownBlocksRender?: (entry: Record<string, unknown>) => void
  recordMarkdownRenderer?: (entry: Record<string, unknown>) => void
  recordVirtualList?: (entry: Record<string, unknown>) => void
}

export function getChatStreamingProbe(): ChatStreamingProbe | null {
  if (typeof window === 'undefined') {
    return null
  }

  return (window as typeof window & { __samePageChatStreamingProbe?: ChatStreamingProbe }).__samePageChatStreamingProbe ?? null
}
