import type { BuddyToolPresentation } from '../../../shared/runEventPresentation'
import { relative, sep } from 'node:path'

import { redactSensitiveText, redactShellCommand } from '../../../shared/approvalReviewPayload'

const MAX_OUTPUT_LENGTH = 64 * 1024

export interface CreateBuddyToolPresentationInput {
  arguments: unknown
  canonicalRoot?: string
  isError?: boolean
  result?: unknown
  toolName: string
}

export function createBuddyToolPresentation(
  input: CreateBuddyToolPresentationInput,
): BuddyToolPresentation {
  const arguments_ = readRecord(input.arguments)
  const output = readToolOutput(input.result)
  const preview = boundedPreview(output)
  const description = readOptionalString(arguments_, 'description')

  if (input.toolName === 'bash') {
    return {
      card: 'terminal',
      command: redactShellCommand(readString(arguments_, 'command')),
      cwd: input.canonicalRoot ? '.' : displayOptionalPath(readOptionalString(arguments_, 'cwd'), input.canonicalRoot),
      description,
      exitCode: readExitCode(input.result, input.isError),
      signal: readSignal(input.result),
      ...preview,
    }
  }
  if (input.toolName === 'read') {
    return {
      card: 'read',
      description,
      language: languageFromPath(readString(arguments_, 'path')),
      lineStart: readPositiveInteger(arguments_, 'offset') ?? 1,
      path: displayPath(readString(arguments_, 'path'), input.canonicalRoot),
      ...preview,
    }
  }
  if (input.toolName === 'write' || input.toolName === 'edit') {
    return {
      card: 'diff',
      description,
      diff: readDiff(input.result),
      firstChangedLine: readPositiveInteger(readToolDetails(input.result), 'firstChangedLine'),
      operation: input.toolName === 'write' ? 'created' : 'edited',
      path: displayPath(readString(arguments_, 'path'), input.canonicalRoot),
      ...preview,
    }
  }
  if (input.toolName === 'grep' || input.toolName === 'find' || input.toolName === 'ls') {
    return {
      card: 'search',
      description,
      glob: readOptionalString(arguments_, 'glob'),
      path: displayOptionalPath(readOptionalString(arguments_, 'path'), input.canonicalRoot),
      query: readOptionalString(arguments_, 'pattern') ?? '',
      ...preview,
    }
  }
  if (input.toolName === 'lexora_buddy_pet') {
    const details = readToolDetails(input.result)
    return {
      card: 'pet',
      description,
      macro: readOptionalString(details, 'macro')
        ?? readOptionalString(arguments_, 'macro')
        ?? 'unknown',
      status: readOptionalString(details, 'status') ?? (input.result ? 'completed' : 'running'),
    }
  }
  if (input.toolName.startsWith('mcp__')) {
    const [, connector = 'connector', ...toolParts] = input.toolName.split('__')
    return {
      argumentNames: argumentNames(arguments_),
      card: 'connector',
      connector,
      description,
      tool: toolParts.join('__') || input.toolName,
      ...preview,
    }
  }
  return {
    argumentNames: argumentNames(arguments_),
    card: 'generic',
    description,
    ...preview,
  }
}

function boundedPreview(value: string | null): Pick<
  Extract<BuddyToolPresentation, { output: unknown }>,
  'output' | 'truncated'
> {
  if (value === null)
    return { output: null, truncated: false }
  return {
    output: value.slice(0, MAX_OUTPUT_LENGTH),
    truncated: value.length > MAX_OUTPUT_LENGTH,
  }
}

function readToolOutput(value: unknown): string | null {
  const result = readRecord(value)
  if (!result || !Array.isArray(result.content))
    return null
  const text = result.content.flatMap((part) => {
    const content = readRecord(part)
    return content?.type === 'text' && typeof content.text === 'string'
      ? [content.text]
      : []
  }).join('\n')
  return text ? redactSensitiveText(text) : null
}

function readDiff(value: unknown): string | null {
  const details = readToolDetails(value)
  const diff = readOptionalString(details, 'diff')
  return diff ? redactSensitiveText(diff).slice(0, MAX_OUTPUT_LENGTH) : null
}

function readToolDetails(value: unknown): Record<string, unknown> | null {
  return readRecord(readRecord(value)?.details)
}

function readExitCode(value: unknown, isError: boolean | undefined): number | null {
  if (value === undefined)
    return null
  if (isError === false)
    return 0
  if (isError === undefined)
    return null
  const output = readToolOutput(value)
  const match = output?.match(/Command exited with code (\d+)/)
  return match ? Number.parseInt(match[1]!, 10) : null
}

function readSignal(value: unknown): string | null {
  const output = readToolOutput(value)
  const match = output?.match(/Command (?:terminated by signal|killed by) ([A-Z][A-Z0-9]+)/i)
  return match?.[1]?.toUpperCase() ?? null
}

function displayPath(path: string, canonicalRoot: string | undefined): string {
  if (!canonicalRoot || !path.startsWith(sep))
    return path || '.'
  const child = relative(canonicalRoot, path)
  return child && child !== '..' && !child.startsWith(`..${sep}`) ? child : '.'
}

function displayOptionalPath(
  path: string | null,
  canonicalRoot: string | undefined,
): string | null {
  return path === null ? null : displayPath(path, canonicalRoot)
}

function argumentNames(value: Record<string, unknown> | null): string[] {
  return value ? Object.keys(value).sort().slice(0, 32) : []
}

const LANGUAGE_BY_EXTENSION = new Map([
  ['css', 'css'],
  ['html', 'html'],
  ['js', 'javascript'],
  ['json', 'json'],
  ['md', 'markdown'],
  ['py', 'python'],
  ['rs', 'rust'],
  ['scss', 'scss'],
  ['ts', 'typescript'],
  ['tsx', 'tsx'],
  ['vue', 'vue'],
])

function languageFromPath(path: string): string | null {
  const extension = path.split('.').at(-1)?.toLowerCase()
  return extension ? LANGUAGE_BY_EXTENSION.get(extension) ?? null : null
}

function readPositiveInteger(
  value: Record<string, unknown> | null,
  key: string,
): number | null {
  const candidate = value?.[key]
  return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : null
}

function readString(value: Record<string, unknown> | null, key: string): string {
  return readOptionalString(value, key) ?? ''
}

function readOptionalString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const candidate = value?.[key]
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
