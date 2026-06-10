import type {
  AgentMemoryLane,
  AgentMemoryOperationAction,
  AgentMemoryOperationMode,
  AgentMemoryScope,
  AgentMemorySensitivity,
} from '@haohaoxue/samepage-contracts'
import {
  AGENT_MEMORY_LANE,
  AGENT_MEMORY_OPERATION_ACTION,
  AGENT_MEMORY_OPERATION_MODE,
  AGENT_MEMORY_SCOPE,
  AGENT_MEMORY_SENSITIVITY,
} from '@haohaoxue/samepage-contracts'

export interface ExtractedMemoryOperation {
  action: AgentMemoryOperationAction
  mode: AgentMemoryOperationMode
  scope: AgentMemoryScope
  lane: AgentMemoryLane
  slotKey: string | null
  slotValue: string | null
  content: string | null
  summary: string | null
  query: string | null
  keywords: string[]
  confidence: number
  sensitivity: AgentMemorySensitivity
  reason: string | null
}

const MESSAGE_SPLIT_RE = /[。！？!?；;\n]+/u

export function extractExplicitMemoryOperations(content: string): ExtractedMemoryOperation[] {
  const text = normalizeText(content)
  if (!text) {
    return []
  }

  return splitSentences(text).flatMap(extractSentenceMemoryOperations)
}

function extractSentenceMemoryOperations(sentence: string): ExtractedMemoryOperation[] {
  const forgetOperation = extractForgetOperation(sentence)
  if (forgetOperation) {
    return [forgetOperation]
  }

  const renameOperation = extractAgentNameOperation(sentence)
  const preferenceOperation = extractPreferenceOperation(sentence)

  return [
    ...(renameOperation ? [renameOperation] : []),
    ...(preferenceOperation ? [preferenceOperation] : []),
  ]
}

function extractAgentNameOperation(text: string): ExtractedMemoryOperation | null {
  const name = extractAgentNameValue(text)
  if (!name) {
    return null
  }

  return {
    action: AGENT_MEMORY_OPERATION_ACTION.UPDATE,
    mode: AGENT_MEMORY_OPERATION_MODE.DIRECT,
    scope: AGENT_MEMORY_SCOPE.USER_AGENT,
    lane: AGENT_MEMORY_LANE.AGENT_PERSONALIZATION,
    slotKey: 'agent.name',
    slotValue: name,
    content: `用户希望当前 Agent 称呼为${name}。`,
    summary: `Agent 称呼：${name}`,
    query: null,
    keywords: [name],
    confidence: 0.98,
    sensitivity: AGENT_MEMORY_SENSITIVITY.NORMAL,
    reason: '用户明确要求修改当前 Agent 称呼。',
  }
}

function extractPreferenceOperation(sentence: string): ExtractedMemoryOperation | null {
  if (/不喜欢|讨厌|不要记住|别记住/u.test(sentence)) {
    return null
  }

  const preference = extractPreferenceValue(sentence)
  if (!preference) {
    return null
  }

  return {
    action: AGENT_MEMORY_OPERATION_ACTION.CREATE,
    mode: AGENT_MEMORY_OPERATION_MODE.DIRECT,
    scope: AGENT_MEMORY_SCOPE.USER,
    lane: AGENT_MEMORY_LANE.USER_PREFERENCE,
    slotKey: null,
    slotValue: null,
    content: `用户喜欢${preference}。`,
    summary: `喜欢${preference}`,
    query: null,
    keywords: createKeywords(preference),
    confidence: sentence.includes('记住') ? 0.96 : 0.88,
    sensitivity: AGENT_MEMORY_SENSITIVITY.NORMAL,
    reason: sentence.includes('记住') ? '用户明确要求记住偏好。' : '用户表达了稳定偏好。',
  }
}

function extractPreferenceValue(sentence: string): string | null {
  const value = stripAnyPrefix(sentence, [
    '记住一下我喜欢',
    '记住我喜欢',
    '记住喜欢',
    '我非常喜欢',
    '我比较喜欢',
    '我很喜欢',
    '我也喜欢',
    '我喜欢',
    '我偏好',
    '我习惯',
  ])

  return normalizeMemoryValue(value)
}

function extractForgetOperation(text: string): ExtractedMemoryOperation | null {
  const value = stripAnyPrefix(text, [
    '请不要记住',
    '请别记住',
    '请忘记',
    '请删除',
    '请移除',
    '请清除',
    '不要记住',
    '别记住',
    '忘记',
    '删除',
    '移除',
    '清除',
  ])
  const query = normalizeMemoryValue(value?.replace(/^(一下|掉)/u, ''))
  if (!query) {
    return null
  }

  return {
    action: AGENT_MEMORY_OPERATION_ACTION.FORGET,
    mode: AGENT_MEMORY_OPERATION_MODE.DIRECT,
    scope: AGENT_MEMORY_SCOPE.USER,
    lane: AGENT_MEMORY_LANE.USER_PREFERENCE,
    slotKey: null,
    slotValue: null,
    content: null,
    summary: null,
    query,
    keywords: createForgetKeywords(query),
    confidence: 0.94,
    sensitivity: AGENT_MEMORY_SENSITIVITY.NORMAL,
    reason: '用户明确要求忘记相关记忆。',
  }
}

function splitSentences(text: string): string[] {
  return text.split(MESSAGE_SPLIT_RE).map(normalizeText).filter(Boolean)
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function extractAgentNameValue(text: string): string | null {
  if (text.startsWith('你不叫')) {
    const separatorIndex = findFirstSeparatorIndex(text)
    if (separatorIndex > 0) {
      const value = stripAnyPrefix(text.slice(separatorIndex + 1), [
        '以后就叫',
        '以后叫',
        '改名叫',
        '改名为',
        '改名成',
        '改名',
      ])
      return normalizeMemoryValue(value)
    }
  }

  return normalizeMemoryValue(stripAnyPrefix(text, [
    '你以后就叫',
    '你以后叫',
    '你之后就叫',
    '你之后叫',
    '以后就叫',
    '以后叫',
    '之后就叫',
    '之后叫',
    '你改名叫',
    '你改名为',
    '你改名成',
    '你改名',
    '改名叫',
    '改名为',
    '改名成',
    '改名',
  ]))
}

function findFirstSeparatorIndex(value: string): number {
  const indexes = ['，', ','].map(separator => value.indexOf(separator)).filter(index => index >= 0)
  return indexes.length > 0 ? Math.min(...indexes) : -1
}

function stripAnyPrefix(value: string, prefixes: string[]): string | null {
  const normalized = normalizeText(value)
  const prefix = prefixes.find(item => normalized.startsWith(item))
  return prefix ? normalized.slice(prefix.length).trim() : null
}

function normalizeMemoryValue(value: string | null | undefined): string | null {
  const normalized = normalizeText(value ?? '')
    .replace(/^[:：,，\s]+/u, '')
    .replace(/[。！？!?；;，,]+$/u, '')
    .replace(/(?:吧|了)$/u, '')
    .replace(/^([叫为成])\s*/u, '')
    .replace(/^(这个|这件事|这点|这些|一下)\s*/u, '')
    .replace(/(这件事|这点|这个|这些)$/u, '')
    .trim()

  return normalized || null
}

function createForgetKeywords(query: string): string[] {
  const normalized = normalizeMemoryValue(query.replace(/^我/u, '')) ?? query
  const withoutMatter = normalizeMemoryValue(normalized.replace(/这件事$/u, '')) ?? normalized
  const values = [
    query,
    normalized,
    withoutMatter,
    withoutMatter.replace(/^喜欢/u, ''),
  ].map(normalizeMemoryValue).filter((value): value is string => Boolean(value))

  return [...new Set(values)]
}

function createKeywords(value: string): string[] {
  const tokens = value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[a-z0-9][\w.:-]*/giu) ?? []
  return [...new Set(tokens.map(normalizeText).filter(token => token.length >= 2))].slice(0, 8)
}
