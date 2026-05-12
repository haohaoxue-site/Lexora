import type { AgentChatModelResponse } from './chat-model'
import {
  readChatModelResponseReasoning,
  readChatModelResponseText,
} from './response-text'

export type AgentModelStreamPart
  = | { type: 'reasoning.delta', text: string, raw?: unknown }
    | { type: 'text.delta', text: string, raw?: unknown }
    | { type: 'tool.call.started', toolCallId: string, toolName: string, raw?: unknown }
    | { type: 'tool.call.args.delta', toolCallId: string, text: string, raw?: unknown }
    | { type: 'tool.call.completed', toolCallId: string, raw?: unknown }

export interface ConsumeChatModelTextStreamOptions {
  onStreamPart?: (part: AgentModelStreamPart) => Promise<void> | void
  onTextDelta?: (text: string) => Promise<void> | void
}

export async function consumeChatModelTextStream(
  stream: AsyncIterable<AgentChatModelResponse>,
  options: ConsumeChatModelTextStreamOptions = {},
): Promise<string> {
  let responseText = ''
  const tagParser = createReasoningTagStreamParser()
  const normalizeReasoningDelta = createLeadingBlankLineNormalizer()
  const normalizeTextDelta = createLeadingBlankLineNormalizer()

  for await (const chunk of stream) {
    const reasoning = readChatModelResponseReasoning(chunk)
    const hasStructuredReasoning = Boolean(reasoning)
    if (reasoning) {
      const normalizedReasoning = normalizeReasoningDelta(reasoning)
      await emitPart({
        type: 'reasoning.delta',
        text: normalizedReasoning,
        raw: chunk,
      }, options)
    }

    const text = readChatModelResponseText(chunk)
    if (!text) {
      continue
    }

    for (const part of tagParser.write(text)) {
      if (part.type === 'reasoning.delta' && hasStructuredReasoning) {
        continue
      }

      const normalizedText = part.type === 'text.delta'
        ? normalizeTextDelta(part.text)
        : normalizeReasoningDelta(part.text)

      if (part.type === 'text.delta') {
        responseText += normalizedText
      }

      await emitPart({ ...part, text: normalizedText, raw: chunk }, options)
    }
  }

  for (const part of tagParser.flush()) {
    const normalizedText = part.type === 'text.delta'
      ? normalizeTextDelta(part.text)
      : normalizeReasoningDelta(part.text)

    if (part.type === 'text.delta') {
      responseText += normalizedText
    }

    await emitPart({ ...part, text: normalizedText }, options)
  }

  return responseText
}

async function emitPart(
  part: AgentModelStreamPart,
  options: ConsumeChatModelTextStreamOptions,
): Promise<void> {
  if ('text' in part && part.text === '') {
    return
  }

  await options.onStreamPart?.(part)

  if (part.type === 'text.delta') {
    await options.onTextDelta?.(part.text)
  }
}

type ReasoningTagPart = Extract<AgentModelStreamPart, { type: 'reasoning.delta' | 'text.delta' }>

const OPEN_REASONING_TAGS = ['<think>', '<thinking>', '<reasoning>'] as const
const CLOSE_REASONING_TAGS = ['</think>', '</thinking>', '</reasoning>'] as const

interface ReasoningTagMatch {
  index: number
  tag: string
}

interface ReasoningTagStreamParser {
  write: (text: string) => ReasoningTagPart[]
  flush: () => ReasoningTagPart[]
}

function createReasoningTagStreamParser(): ReasoningTagStreamParser {
  let mode: 'text' | 'reasoning' = 'text'
  let buffer = ''

  return {
    write(text) {
      buffer += text
      return drainBuffer(false)
    },

    flush() {
      return drainBuffer(true)
    },
  }

  function drainBuffer(flush: boolean): ReasoningTagPart[] {
    const parts: ReasoningTagPart[] = []

    while (buffer) {
      if (mode === 'text') {
        const openTag = findFirstTag(buffer, OPEN_REASONING_TAGS)
        if (openTag) {
          pushPart(parts, 'text.delta', buffer.slice(0, openTag.index))
          buffer = buffer.slice(openTag.index + openTag.tag.length)
          mode = 'reasoning'
          continue
        }

        const keepLength = flush ? 0 : getPartialTagSuffixLength(buffer, OPEN_REASONING_TAGS)
        pushPart(parts, 'text.delta', buffer.slice(0, buffer.length - keepLength))
        buffer = buffer.slice(buffer.length - keepLength)
        break
      }

      const closeTag = findFirstTag(buffer, CLOSE_REASONING_TAGS)
      if (closeTag) {
        pushPart(parts, 'reasoning.delta', buffer.slice(0, closeTag.index))
        buffer = buffer.slice(closeTag.index + closeTag.tag.length)
        mode = 'text'
        continue
      }

      const keepLength = flush ? 0 : getPartialTagSuffixLength(buffer, CLOSE_REASONING_TAGS)
      pushPart(parts, 'reasoning.delta', buffer.slice(0, buffer.length - keepLength))
      buffer = buffer.slice(buffer.length - keepLength)
      break
    }

    return parts
  }
}

function pushPart(
  parts: ReasoningTagPart[],
  type: ReasoningTagPart['type'],
  text: string,
): void {
  if (!text) {
    return
  }

  parts.push({ type, text })
}

const LEADING_BLANK_LINE_SEPARATOR_PATTERN = /^[\t ]*(?:\r?\n[\t ]*)+/
const HORIZONTAL_WHITESPACE_PATTERN = /^[\t ]*$/

function createLeadingBlankLineNormalizer(): (text: string) => string {
  let hasEmittedText = false
  let pendingLeadingWhitespace = ''

  return (text) => {
    if (hasEmittedText) {
      return text
    }

    const candidate = pendingLeadingWhitespace + text
    pendingLeadingWhitespace = ''

    const withoutLeadingBlankLines = candidate.replace(LEADING_BLANK_LINE_SEPARATOR_PATTERN, '')
    if (withoutLeadingBlankLines !== candidate) {
      hasEmittedText = withoutLeadingBlankLines !== ''
      return withoutLeadingBlankLines
    }

    if (HORIZONTAL_WHITESPACE_PATTERN.test(candidate)) {
      pendingLeadingWhitespace = candidate
      return ''
    }

    hasEmittedText = true
    return candidate
  }
}

function findFirstTag(text: string, tags: readonly string[]): ReasoningTagMatch | null {
  const normalizedText = text.toLowerCase()
  let bestMatch: ReasoningTagMatch | null = null

  for (const tag of tags) {
    const index = normalizedText.indexOf(tag)
    if (index < 0) {
      continue
    }

    if (!bestMatch || index < bestMatch.index) {
      bestMatch = { index, tag }
    }
  }

  return bestMatch
}

function getPartialTagSuffixLength(text: string, tags: readonly string[]): number {
  const normalizedText = text.toLowerCase()
  let suffixLength = 0

  for (const tag of tags) {
    const maxLength = Math.min(tag.length - 1, normalizedText.length)
    for (let length = 1; length <= maxLength; length += 1) {
      if (tag.startsWith(normalizedText.slice(-length))) {
        suffixLength = Math.max(suffixLength, length)
      }
    }
  }

  return suffixLength
}
