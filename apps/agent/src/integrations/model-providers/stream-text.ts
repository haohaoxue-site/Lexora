import type { AgentToolCallKind } from '@haohaoxue/lexora-contracts/agent'
import type { ToolCall, ToolCallChunk } from '@langchain/core/messages'
import type { AgentChatModelResponse } from './chat-model'
import { AGENT_WEB_SEARCH_TOOL } from '@haohaoxue/lexora-contracts/agent'
import { AIMessageChunk } from '@langchain/core/messages'
import {
  readChatModelResponseReasoning,
  readChatModelResponseText,
} from './response-text'

export type AgentModelStreamPart
  = | { type: 'reasoning.delta', text: string, raw?: unknown }
    | { type: 'text.delta', text: string, raw?: unknown }
    | { type: 'tool.call.started', toolCallId: string, toolName?: string, raw?: unknown }
    | { type: 'tool.call.args.delta', toolCallId: string, text: string, raw?: unknown }
    | { type: 'tool.call.completed', toolCallId: string, toolName?: string, raw?: unknown }
    | {
      type: 'tool.execution.started'
      toolCallId: string
      toolName: string
      toolKind: AgentToolCallKind
      args?: unknown
      argsText?: string
      raw?: unknown
    }
    | {
      type: 'tool.execution.completed'
      toolCallId: string
      toolName: string
      toolKind: AgentToolCallKind
      status: 'success' | 'error'
      output?: unknown
      outputText?: string
      durationMs?: number
      raw?: unknown
    }
    | {
      type: 'tool.execution.failed'
      toolCallId: string
      toolName: string
      toolKind: AgentToolCallKind
      message: string
      durationMs?: number
      raw?: unknown
    }

export interface TextToolCallCandidate {
  name: string
  args: Record<string, unknown>
}

export interface TextToolCallPolicy {
  allowedToolNames: ReadonlySet<string>
  isToolCallAllowed?: (input: {
    toolCall: TextToolCallCandidate
    toolCalls: readonly TextToolCallCandidate[]
  }) => boolean
}

export interface ConsumeChatModelTextStreamOptions {
  onStreamPart?: (part: AgentModelStreamPart) => Promise<void> | void
  onTextDelta?: (text: string) => Promise<void> | void
  now?: () => number
  textToolCalls?: TextToolCallPolicy
}

export interface AgentModelTokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
}

export interface AgentModelTextStreamResult {
  text: string
  providerUsage: AgentModelTokenUsage | null
  toolCalls: ToolCall[]
  firstTokenLatencyMs?: number
  elapsedMs: number
}

export async function consumeChatModelTextStream(
  stream: AsyncIterable<AgentChatModelResponse>,
  options: ConsumeChatModelTextStreamOptions = {},
): Promise<AgentModelTextStreamResult> {
  let responseText = ''
  let providerUsage: AgentModelTokenUsage | null = null
  let firstTokenAt: number | null = null
  const textToolCalls: ToolCall[] = []
  const now = options.now ?? (() => Date.now())
  const startedAt = now()
  const tagParser = createReasoningTagStreamParser()
  const textToolCallParser = createEnabledTextToolCallStreamParser(options.textToolCalls)
  const reasoningToolCallBlockStripper = createTextToolCallBlockStripper()
  const normalizeReasoningDelta = createLeadingBlankLineNormalizer()
  const normalizeTextDelta = createLeadingBlankLineNormalizer()
  let responseChunk: AIMessageChunk | null = null
  const toolCallStreamState = createToolCallStreamState()

  for await (const chunk of stream) {
    if (AIMessageChunk.isInstance(chunk)) {
      responseChunk = responseChunk ? responseChunk.concat(chunk) : chunk
      await emitToolCallChunkParts(chunk.tool_call_chunks ?? [], toolCallStreamState, options, chunk, () => {
        firstTokenAt ??= now()
      })
    }

    providerUsage = mergeTokenUsage(providerUsage, readProviderUsage(chunk))
    const reasoning = readChatModelResponseReasoning(chunk)
    const hasStructuredReasoning = Boolean(reasoning)
    if (reasoning) {
      const normalizedReasoning = normalizeReasoningDelta(reasoning)
      await emitReasoningTextDeltas({
        deltas: reasoningToolCallBlockStripper.write(normalizedReasoning),
        raw: chunk,
        options,
        markFirstToken: () => {
          firstTokenAt ??= now()
        },
      })
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
        await consumeTextDelta({
          text: normalizedText,
          raw: chunk,
          parser: textToolCallParser,
          textToolCalls,
          appendText(delta) {
            responseText += delta
          },
          emit: async delta => await emitPart({ ...part, text: delta, raw: chunk }, options, () => {
            firstTokenAt ??= now()
          }),
          markToolCall: () => {
            firstTokenAt ??= now()
          },
        })
        continue
      }

      if (part.type === 'reasoning.delta') {
        await emitPart({ ...part, text: normalizedText, raw: chunk }, options, () => {
          firstTokenAt ??= now()
        })
        continue
      }
    }
  }

  for (const part of tagParser.flush()) {
    const normalizedText = part.type === 'text.delta'
      ? normalizeTextDelta(part.text)
      : normalizeReasoningDelta(part.text)

    if (part.type === 'text.delta') {
      await consumeTextDelta({
        text: normalizedText,
        parser: textToolCallParser,
        textToolCalls,
        appendText(delta) {
          responseText += delta
        },
        emit: async delta => await emitPart({ ...part, text: delta }, options, () => {
          firstTokenAt ??= now()
        }),
        markToolCall: () => {
          firstTokenAt ??= now()
        },
      })
      continue
    }

    if (part.type === 'reasoning.delta') {
      await emitPart({ ...part, text: normalizedText }, options, () => {
        firstTokenAt ??= now()
      })
      continue
    }
  }

  if (textToolCallParser) {
    await emitTextToolCallParseResult({
      result: textToolCallParser.flush(),
      textToolCalls,
      appendText(delta) {
        responseText += delta
      },
      emit: async delta => await emitPart({ type: 'text.delta', text: delta }, options, () => {
        firstTokenAt ??= now()
      }),
      markToolCall: () => {
        firstTokenAt ??= now()
      },
    })
  }

  await emitReasoningTextDeltas({
    deltas: reasoningToolCallBlockStripper.flush(),
    options,
    markFirstToken: () => {
      firstTokenAt ??= now()
    },
  })

  await emitCompletedToolCallParts(toolCallStreamState, options)

  const completedAt = now()

  return {
    text: responseText,
    providerUsage,
    toolCalls: normalizeToolCalls([
      ...(responseChunk?.tool_calls ?? []),
      ...textToolCalls,
    ]),
    firstTokenLatencyMs: firstTokenAt === null ? undefined : Math.max(0, Math.trunc(firstTokenAt - startedAt)),
    elapsedMs: Math.max(0, Math.trunc(completedAt - startedAt)),
  }
}

async function emitReasoningTextDeltas(input: {
  deltas: string[]
  raw?: unknown
  options: ConsumeChatModelTextStreamOptions
  markFirstToken: () => void
}): Promise<void> {
  for (const text of input.deltas) {
    await emitPart({
      type: 'reasoning.delta',
      text,
      raw: input.raw,
    }, input.options, input.markFirstToken)
  }
}

interface ToolCallStreamItem {
  toolCallId?: string
  toolName?: string
  argsText: string
  pendingArgDeltas: string[]
  started: boolean
  completed: boolean
}

interface ToolCallStreamState {
  items: Map<string, ToolCallStreamItem>
}

function createToolCallStreamState(): ToolCallStreamState {
  return {
    items: new Map(),
  }
}

async function emitToolCallChunkParts(
  chunks: ToolCallChunk[],
  state: ToolCallStreamState,
  options: ConsumeChatModelTextStreamOptions,
  raw: unknown,
  markFirstToken: () => void,
): Promise<void> {
  for (const [index, chunk] of chunks.entries()) {
    const key = getToolCallChunkKey(chunk, index)
    const fallbackKey = getToolCallChunkPositionKey(index)
    const item = state.items.get(key) ?? state.items.get(fallbackKey) ?? {
      toolCallId: undefined,
      toolName: undefined,
      argsText: '',
      pendingArgDeltas: [],
      started: false,
      completed: false,
    }

    item.toolCallId = mergeOptionalChunkString(item.toolCallId, chunk.id)
    item.toolName = mergeOptionalChunkString(item.toolName, chunk.name)

    if (chunk.args) {
      item.argsText += chunk.args
    }

    if (!item.toolCallId) {
      if (chunk.args) {
        item.pendingArgDeltas.push(chunk.args)
      }
      state.items.set(key, item)
      continue
    }

    if (!item.started) {
      item.started = true
      await emitPart({
        type: 'tool.call.started',
        toolCallId: item.toolCallId,
        toolName: item.toolName,
        raw,
      }, options, markFirstToken)

      for (const pendingArgDelta of item.pendingArgDeltas) {
        await emitPart({
          type: 'tool.call.args.delta',
          toolCallId: item.toolCallId,
          text: pendingArgDelta,
          raw,
        }, options, markFirstToken)
      }
      item.pendingArgDeltas = []
    }

    if (chunk.args) {
      await emitPart({
        type: 'tool.call.args.delta',
        toolCallId: item.toolCallId,
        text: chunk.args,
        raw,
      }, options, markFirstToken)
    }

    state.items.set(key, item)
    if (fallbackKey !== key) {
      state.items.delete(fallbackKey)
    }
  }
}

async function emitCompletedToolCallParts(
  state: ToolCallStreamState,
  options: ConsumeChatModelTextStreamOptions,
): Promise<void> {
  for (const item of state.items.values()) {
    if (!item.toolCallId || !item.started || item.completed) {
      continue
    }

    item.completed = true
    await emitPart({
      type: 'tool.call.completed',
      toolCallId: item.toolCallId,
      toolName: item.toolName,
    }, options, () => {})
  }
}

function getToolCallChunkKey(chunk: ToolCallChunk, index: number): string {
  if (typeof chunk.index === 'number') {
    return `index:${chunk.index}`
  }

  if (chunk.id) {
    return `id:${chunk.id}`
  }

  return `position:${index}`
}

function getToolCallChunkPositionKey(index: number): string {
  return `position:${index}`
}

function mergeOptionalChunkString(current: string | undefined, fragment: string | undefined): string | undefined {
  if (!fragment) {
    return current
  }

  return mergeChunkString(current ?? '', fragment)
}

function mergeChunkString(current: string, fragment: string | undefined): string {
  if (!fragment) {
    return current
  }

  if (!current) {
    return fragment
  }

  if (current.endsWith(fragment)) {
    return current
  }

  if (fragment.startsWith(current)) {
    return fragment
  }

  return `${current}${fragment}`
}

function normalizeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  return toolCalls.filter((toolCall): toolCall is ToolCall & { id: string } =>
    typeof toolCall.id === 'string'
    && toolCall.id.trim().length > 0
    && typeof toolCall.name === 'string'
    && toolCall.name.trim().length > 0,
  )
}

interface TextToolCallParseResult {
  textDeltas: string[]
  toolCalls: ToolCall[]
}

type TextToolCallStreamParser = ReturnType<typeof createTextToolCallStreamParser>

const TEXT_TOOL_CALL_LOOKBEHIND_LENGTH = 64
const TEXT_TOOL_CALL_OPEN_PATTERN = /<\s*(?:[|｜]\s*[|｜]\s*DSML\s*[|｜]\s*[|｜]\s*)?tool_calls\s*>/i
const TEXT_TOOL_CALL_CLOSE_PATTERN = /<\s*\/\s*(?:[|｜]\s*[|｜]\s*DSML\s*[|｜]\s*[|｜]\s*)?tool_calls\s*>/i
const MARKUP_TAG_PATTERN = /<([^<>]*)>/g
const TOOL_CALL_TAG_NAME_PATTERN = /^[a-z_][\w.-]*/i
const INVOKE_TAG_PATTERN = /<invoke\b([^>]*)>([\s\S]*?)<\/invoke>/gi
const PARAMETER_TAG_PATTERN = /<parameter\b([^>]*)>([\s\S]*?)(?:<\/parameter>|<parameter\s*>)/gi
const TEXT_TOOL_CALL_NAME_ALIASES: Record<string, string> = {
  search: AGENT_WEB_SEARCH_TOOL.SEARCH,
}

function createEnabledTextToolCallStreamParser(
  options: ConsumeChatModelTextStreamOptions['textToolCalls'],
): TextToolCallStreamParser | null {
  if (!options || options.allowedToolNames.size === 0) {
    return null
  }

  return createTextToolCallStreamParser(options)
}

async function consumeTextDelta(input: {
  text: string
  raw?: unknown
  parser: TextToolCallStreamParser | null
  textToolCalls: ToolCall[]
  appendText: (text: string) => void
  emit: (text: string) => Promise<void>
  markToolCall: () => void
}): Promise<void> {
  if (!input.parser) {
    input.appendText(input.text)
    await input.emit(input.text)
    return
  }

  await emitTextToolCallParseResult({
    result: input.parser.write(input.text),
    textToolCalls: input.textToolCalls,
    appendText: input.appendText,
    emit: input.emit,
    markToolCall: input.markToolCall,
  })
}

async function emitTextToolCallParseResult(input: {
  result: TextToolCallParseResult
  textToolCalls: ToolCall[]
  appendText: (text: string) => void
  emit: (text: string) => Promise<void>
  markToolCall: () => void
}): Promise<void> {
  input.textToolCalls.push(...input.result.toolCalls)
  if (input.result.toolCalls.length > 0) {
    input.markToolCall()
  }

  for (const textDelta of input.result.textDeltas) {
    input.appendText(textDelta)
    await input.emit(textDelta)
  }
}

function createTextToolCallStreamParser(input: {
  allowedToolNames: ReadonlySet<string>
}) {
  let buffer = ''
  let isInsideToolCallBlock = false
  let textToolCallCount = 0

  function nextToolCallId(): string {
    textToolCallCount += 1
    return `text_tool_call_${textToolCallCount}`
  }

  function drain(isFinal: boolean): TextToolCallParseResult {
    const result: TextToolCallParseResult = {
      textDeltas: [],
      toolCalls: [],
    }

    while (buffer.length > 0) {
      if (!isInsideToolCallBlock) {
        const openTag = findPattern(buffer, TEXT_TOOL_CALL_OPEN_PATTERN)

        if (!openTag) {
          const flushLength = isFinal
            ? buffer.length
            : getTextFlushLengthWithoutToolCallOpenTag(buffer)

          if (flushLength > 0) {
            result.textDeltas.push(buffer.slice(0, flushLength))
            buffer = buffer.slice(flushLength)
          }
          break
        }

        if (openTag.index > 0) {
          result.textDeltas.push(buffer.slice(0, openTag.index))
          buffer = buffer.slice(openTag.index)
        }

        isInsideToolCallBlock = true
      }

      const closeTag = findPattern(buffer, TEXT_TOOL_CALL_CLOSE_PATTERN)
      if (!closeTag) {
        if (isFinal) {
          result.textDeltas.push(buffer)
          buffer = ''
          isInsideToolCallBlock = false
        }
        break
      }

      const blockEndIndex = closeTag.index + closeTag.text.length
      const block = buffer.slice(0, blockEndIndex)
      const toolCalls = parseTextToolCallBlock(block, nextToolCallId, input)
      if (toolCalls.length > 0) {
        result.toolCalls.push(...toolCalls)
      }
      else {
        result.textDeltas.push(block)
      }
      buffer = buffer.slice(blockEndIndex)
      isInsideToolCallBlock = false
    }

    return result
  }

  return {
    write(text: string): TextToolCallParseResult {
      buffer += text
      return drain(false)
    },
    flush(): TextToolCallParseResult {
      return drain(true)
    },
  }
}

function createTextToolCallBlockStripper() {
  let buffer = ''
  let isInsideToolCallBlock = false

  function drain(isFinal: boolean): string[] {
    const textDeltas: string[] = []

    while (buffer.length > 0) {
      if (!isInsideToolCallBlock) {
        const openTag = findPattern(buffer, TEXT_TOOL_CALL_OPEN_PATTERN)

        if (!openTag) {
          const flushLength = isFinal
            ? buffer.length
            : getTextFlushLengthWithoutToolCallOpenTag(buffer)

          if (flushLength > 0) {
            textDeltas.push(buffer.slice(0, flushLength))
            buffer = buffer.slice(flushLength)
          }
          break
        }

        if (openTag.index > 0) {
          textDeltas.push(buffer.slice(0, openTag.index))
          buffer = buffer.slice(openTag.index)
        }

        isInsideToolCallBlock = true
      }

      const closeTag = findPattern(buffer, TEXT_TOOL_CALL_CLOSE_PATTERN)
      if (!closeTag) {
        if (isFinal) {
          buffer = ''
          isInsideToolCallBlock = false
        }
        break
      }

      buffer = buffer.slice(closeTag.index + closeTag.text.length)
      isInsideToolCallBlock = false
    }

    return textDeltas
  }

  return {
    write(text: string): string[] {
      buffer += text
      return drain(false)
    },
    flush(): string[] {
      return drain(true)
    },
  }
}

function findPattern(input: string, pattern: RegExp): { index: number, text: string } | null {
  const match = pattern.exec(input)
  return match
    ? {
        index: match.index,
        text: match[0],
      }
    : null
}

function getTextFlushLengthWithoutToolCallOpenTag(input: string): number {
  const possibleOpenTagStart = input.lastIndexOf('<')
  if (possibleOpenTagStart < 0) {
    return input.length
  }

  const suffix = input.slice(possibleOpenTagStart)
  return suffix.length <= TEXT_TOOL_CALL_LOOKBEHIND_LENGTH
    ? possibleOpenTagStart
    : input.length
}

function parseTextToolCallBlock(
  block: string,
  createToolCallId: () => string,
  policy: TextToolCallPolicy,
): ToolCall[] {
  const normalizedBlock = normalizeTextToolCallMarkup(block)
  const candidates: TextToolCallCandidate[] = []
  let hasInvoke = false

  for (const invokeMatch of normalizedBlock.matchAll(INVOKE_TAG_PATTERN)) {
    hasInvoke = true
    const rawToolName = readMarkupAttribute(invokeMatch[1] ?? '', 'name')
    const toolName = normalizeTextToolCallName(rawToolName)
    if (!toolName) {
      return []
    }

    candidates.push({
      name: toolName,
      args: parseTextToolCallParameters(invokeMatch[2] ?? ''),
    })
  }

  if (!hasInvoke || candidates.some(toolCall => !isTextToolCallAllowed(toolCall, candidates, policy))) {
    return []
  }

  return candidates.map(toolCall => ({
    id: createToolCallId(),
    name: toolCall.name,
    args: toolCall.args,
  }))
}

function isTextToolCallAllowed(
  toolCall: TextToolCallCandidate,
  toolCalls: readonly TextToolCallCandidate[],
  policy: TextToolCallPolicy,
): boolean {
  return policy.allowedToolNames.has(toolCall.name)
    || Boolean(policy.isToolCallAllowed?.({ toolCall, toolCalls }))
}

function normalizeTextToolCallMarkup(input: string): string {
  return input.replace(MARKUP_TAG_PATTERN, (tag: string, body: string) => {
    const normalizedBody = normalizeDsmlTagBody(body)
    return normalizedBody ? `<${normalizedBody}>` : tag
  })
}

function normalizeDsmlTagBody(body: string): string | null {
  const trimmed = body.trim()
  const isClosing = trimmed.startsWith('/')
  const content = isClosing ? trimmed.slice(1).trimStart() : trimmed
  const prefixLength = readDsmlTagPrefixLength(content)
  if (prefixLength === null) {
    return null
  }

  const normalizedContent = content.slice(prefixLength).trimStart()
  const tagName = TOOL_CALL_TAG_NAME_PATTERN.exec(normalizedContent)?.[0]
  if (!tagName) {
    return null
  }

  return `${isClosing ? '/' : ''}${normalizedContent}`
}

function readDsmlTagPrefixLength(input: string): number | null {
  let index = 0
  index = skipHorizontalWhitespace(input, index)

  const firstBarIndex = readDsmlBar(input, index)
  if (firstBarIndex === null) {
    return null
  }

  const secondBarIndex = readDsmlBar(input, firstBarIndex)
  if (secondBarIndex === null) {
    return null
  }

  index = skipHorizontalWhitespace(input, secondBarIndex)
  if (input.slice(index, index + 4).toLowerCase() !== 'dsml') {
    return null
  }

  index = skipHorizontalWhitespace(input, index + 4)
  const thirdBarIndex = readDsmlBar(input, index)
  if (thirdBarIndex === null) {
    return null
  }

  return readDsmlBar(input, thirdBarIndex)
}

function readDsmlBar(input: string, startIndex: number): number | null {
  const index = skipHorizontalWhitespace(input, startIndex)
  const char = input[index]
  return char === '|' || char === '｜' ? index + 1 : null
}

function skipHorizontalWhitespace(input: string, startIndex: number): number {
  let index = startIndex
  while (input[index] === ' ' || input[index] === '\t') {
    index += 1
  }

  return index
}

function parseTextToolCallParameters(input: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}

  for (const parameterMatch of input.matchAll(PARAMETER_TAG_PATTERN)) {
    const attributes = parameterMatch[1] ?? ''
    const name = readMarkupAttribute(attributes, 'name')
    if (!name) {
      continue
    }

    args[name] = parseTextToolCallParameterValue(
      parameterMatch[2] ?? '',
      readMarkupAttribute(attributes, 'string') !== 'false',
    )
  }

  return args
}

function parseTextToolCallParameterValue(value: string, isString: boolean): unknown {
  if (isString) {
    return value
  }

  const trimmed = value.trim()
  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  try {
    return JSON.parse(trimmed)
  }
  catch {
    return trimmed
  }
}

function normalizeTextToolCallName(name: string | null): string | null {
  const normalizedName = name?.trim()
  if (!normalizedName) {
    return null
  }

  return TEXT_TOOL_CALL_NAME_ALIASES[normalizedName] ?? normalizedName
}

function readMarkupAttribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attributes)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

async function emitPart(
  part: AgentModelStreamPart,
  options: ConsumeChatModelTextStreamOptions,
  markFirstToken: () => void,
): Promise<void> {
  if ('text' in part && part.text === '') {
    return
  }

  markFirstToken()
  await options.onStreamPart?.(part)

  if (part.type === 'text.delta') {
    await options.onTextDelta?.(part.text)
  }
}

function readProviderUsage(chunk: AgentChatModelResponse): AgentModelTokenUsage | null {
  return readLangChainUsageMetadata(chunk.usage_metadata)
    ?? readProviderResponseUsage(chunk.response_metadata)
}

function readLangChainUsageMetadata(value: unknown): AgentModelTokenUsage | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const usage = value as Record<string, unknown>
  return normalizeUsage({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    reasoningTokens: readNestedNumber(usage.output_token_details, 'reasoning'),
  })
}

function readProviderResponseUsage(value: unknown): AgentModelTokenUsage | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const metadata = value as Record<string, unknown>
  const usage = metadata.usage
  if (!usage || typeof usage !== 'object') {
    return null
  }

  const usageRecord = usage as Record<string, unknown>
  return normalizeUsage({
    inputTokens: usageRecord.input_tokens ?? usageRecord.prompt_tokens,
    outputTokens: usageRecord.output_tokens ?? usageRecord.completion_tokens,
    totalTokens: usageRecord.total_tokens,
    reasoningTokens: readNestedNumber(usageRecord.output_tokens_details, 'reasoning_tokens')
      ?? readNestedNumber(usageRecord.completion_tokens_details, 'reasoning_tokens'),
  })
}

function normalizeUsage(input: {
  inputTokens?: unknown
  outputTokens?: unknown
  totalTokens?: unknown
  reasoningTokens?: unknown
}): AgentModelTokenUsage | null {
  const usage = {
    inputTokens: readNonNegativeInteger(input.inputTokens),
    outputTokens: readNonNegativeInteger(input.outputTokens),
    totalTokens: readNonNegativeInteger(input.totalTokens),
    reasoningTokens: readNonNegativeInteger(input.reasoningTokens),
  }

  if (
    usage.inputTokens === undefined
    && usage.outputTokens === undefined
    && usage.totalTokens === undefined
    && usage.reasoningTokens === undefined
  ) {
    return null
  }

  return usage
}

function mergeTokenUsage(
  current: AgentModelTokenUsage | null,
  next: AgentModelTokenUsage | null,
): AgentModelTokenUsage | null {
  if (!next) {
    return current
  }

  if (!current) {
    return next
  }

  const currentTotal = current.totalTokens ?? (current.inputTokens ?? 0) + (current.outputTokens ?? 0)
  const nextTotal = next.totalTokens ?? (next.inputTokens ?? 0) + (next.outputTokens ?? 0)
  return nextTotal >= currentTotal ? { ...current, ...next } : current
}

function readNestedNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  return readNonNegativeInteger((value as Record<string, unknown>)[key])
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined
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
