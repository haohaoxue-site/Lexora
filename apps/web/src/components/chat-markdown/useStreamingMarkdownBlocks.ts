import type { MaybeRefOrGetter } from 'vue'
import type { ChatMarkdownBlock, ChatMarkdownBlocksResult } from './typing'
import { computed, toValue } from 'vue'
import { renderChatMarkdown, renderStreamingCodeBlock } from './markdownRenderer'

export interface StreamingMarkdownRenderInput {
  messageId: string
  partId: string
  source: string
  isStreaming: boolean
}

export interface UseStreamingMarkdownBlocksOptions {
  messageId: MaybeRefOrGetter<string>
  partId: MaybeRefOrGetter<string>
  source: MaybeRefOrGetter<string>
  isStreaming: MaybeRefOrGetter<boolean>
}

export function useStreamingMarkdownBlocks(options: UseStreamingMarkdownBlocksOptions) {
  const cache = createStreamingMarkdownBlockCache()
  const blocks = computed(() => cache.render({
    messageId: toValue(options.messageId),
    partId: toValue(options.partId),
    source: toValue(options.source),
    isStreaming: toValue(options.isStreaming),
  }).blocks)

  return {
    blocks,
  }
}

export function createStreamingMarkdownBlockCache() {
  const blocksByScope = new Map<string, Map<string, ChatMarkdownBlock>>()

  return {
    render(input: StreamingMarkdownRenderInput): ChatMarkdownBlocksResult {
      const scopeKey = `${input.messageId}:${input.partId}`
      const previousBlocks = blocksByScope.get(scopeKey) ?? new Map<string, ChatMarkdownBlock>()
      const nextBlocks = new Map<string, ChatMarkdownBlock>()
      const blocks = splitMarkdownBlocks(input.source).map((block, index) => {
        const blockKey = `${index}:${block.kind}:${block.source}`
        const previousBlock = previousBlocks.get(blockKey)

        if (previousBlock) {
          nextBlocks.set(blockKey, previousBlock)
          return previousBlock
        }

        const nextBlock: ChatMarkdownBlock = {
          key: blockKey,
          kind: block.kind,
          source: block.source,
          html: block.kind === 'incomplete-code'
            ? renderStreamingCodeBlock(block.source)
            : renderChatMarkdown(block.source, { isStreaming: input.isStreaming }),
        }
        nextBlocks.set(blockKey, nextBlock)
        return nextBlock
      })

      blocksByScope.set(scopeKey, nextBlocks)

      return {
        blocks,
      }
    },
  }
}

function splitMarkdownBlocks(source: string): Array<Pick<ChatMarkdownBlock, 'kind' | 'source'>> {
  if (!source.trim()) {
    return []
  }

  const lines = source.split('\n')
  const blocks: Array<Pick<ChatMarkdownBlock, 'kind' | 'source'>> = []
  let start = 0
  let index = 0
  let inFence = false

  while (index < lines.length) {
    if ((lines[index] ?? '').startsWith('```')) {
      inFence = !inFence
    }

    if (!inFence && lines[index] === '') {
      pushMarkdownBlock(blocks, lines.slice(start, index).join('\n'))
      while (lines[index] === '') {
        index += 1
      }
      start = index
      continue
    }

    index += 1
  }

  const tail = lines.slice(start).join('\n')
  if (inFence) {
    blocks.push({
      kind: 'incomplete-code',
      source: tail,
    })
  }
  else {
    pushMarkdownBlock(blocks, tail)
  }

  return blocks
}

function pushMarkdownBlock(blocks: Array<Pick<ChatMarkdownBlock, 'kind' | 'source'>>, source: string): void {
  if (!source.trim()) {
    return
  }

  blocks.push({
    kind: 'markdown',
    source,
  })
}
