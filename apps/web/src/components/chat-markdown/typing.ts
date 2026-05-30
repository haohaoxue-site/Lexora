export interface ChatMarkdownRenderOptions {
  isStreaming?: boolean
}

export interface ChatMarkdownBlock {
  key: string
  kind: 'markdown' | 'incomplete-code'
  source: string
  html: string
}

export interface ChatMarkdownBlocksResult {
  blocks: ChatMarkdownBlock[]
}

export interface ChatMarkdownContentProps {
  messageId: string
  partId: string
  source: string
  status?: string
  isStreaming?: boolean
}
