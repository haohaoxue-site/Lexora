import type { BuddyToolPresentation } from '../../../shared/runEventPresentation'
import type { BuddyRunOutputPayload } from '../../../shared/runOutput'
import type { CreateBuddyToolPresentationInput } from '../events/toolPresentationSupport'
import { relative, sep } from 'node:path'

import { redactSensitiveText, redactShellCommand } from '../../../shared/approvalReviewPayload'
import {
  createArtifactPresentRunOutput,
  createArtifactPresentToolPresentation,
} from '../artifacts/artifactToolContract'
import { createAutomationToolPresentation } from '../automations/automationToolContract'
import { createMcpToolPresentation } from '../connectors/mcp/mcpToolContract'
import {
  argumentNames,
  boundedToolPreview,
  MAX_TOOL_PRESENTATION_OUTPUT_LENGTH,
  readOptionalString,
  readRecord,
  readToolDetails,
  readToolOutput,
} from '../events/toolPresentationSupport'
import {
  createImageGenerationRunOutput,
  createImageGenerationToolPresentation,
} from '../images/imageGenerationToolContract'
import {
  createImageTransformRunOutput,
  createImageTransformToolPresentation,
} from '../images/imageTransformToolContract'
import { createPetToolPresentation } from '../pet/petToolContract'
import { createSystemToolPresentation } from '../system/systemToolContract'
import { isPiShellToolName } from './piBuiltinTools'

export type { CreateBuddyToolPresentationInput } from '../events/toolPresentationSupport'

export function createBuddyRunOutputs(
  input: CreateBuddyToolPresentationInput & { toolCallId: string },
): BuddyRunOutputPayload[] {
  const output = createImageGenerationRunOutput(input)
    ?? createImageTransformRunOutput(input)
    ?? createArtifactPresentRunOutput(input)
  return output ? [output] : []
}

export function createBuddyToolPresentation(
  input: CreateBuddyToolPresentationInput,
): BuddyToolPresentation {
  return createPiToolPresentation(input)
    ?? createArtifactPresentToolPresentation(input)
    ?? createPetToolPresentation(input)
    ?? createImageGenerationToolPresentation(input)
    ?? createImageTransformToolPresentation(input)
    ?? createAutomationToolPresentation(input)
    ?? createSystemToolPresentation(input)
    ?? createMcpToolPresentation(input)
    ?? createGenericToolPresentation(input)
}

function createPiToolPresentation(
  input: CreateBuddyToolPresentationInput,
): BuddyToolPresentation | null {
  const arguments_ = readRecord(input.arguments)
  const output = readToolOutput(input.result)
  const preview = boundedToolPreview(output)
  const description = readOptionalString(arguments_, 'description')

  if (isPiShellToolName(input.toolName)) {
    return {
      card: 'terminal',
      command: redactShellCommand(readString(arguments_, 'command')),
      cwd: input.canonicalRoot
        ? '.'
        : displayOptionalPath(readOptionalString(arguments_, 'cwd'), input.canonicalRoot),
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
  return null
}

function createGenericToolPresentation(
  input: CreateBuddyToolPresentationInput,
): Extract<BuddyToolPresentation, { card: 'generic' }> {
  const arguments_ = readRecord(input.arguments)
  return {
    argumentNames: argumentNames(arguments_),
    card: 'generic',
    description: readOptionalString(arguments_, 'description'),
    ...boundedToolPreview(readToolOutput(input.result)),
  }
}

function readDiff(value: unknown): string | null {
  const diff = readOptionalString(readToolDetails(value), 'diff')
  return diff
    ? redactSensitiveText(diff).slice(0, MAX_TOOL_PRESENTATION_OUTPUT_LENGTH)
    : null
}

function readExitCode(value: unknown, isError: boolean | undefined): number | null {
  if (value === undefined)
    return null
  if (isError === false)
    return 0
  if (isError === undefined)
    return null
  const match = readToolOutput(value)?.match(/Command exited with code (\d+)/)
  return match ? Number.parseInt(match[1]!, 10) : null
}

function readSignal(value: unknown): string | null {
  const match = readToolOutput(value)
    ?.match(/Command (?:terminated by signal|killed by) ([A-Z][A-Z0-9]+)/i)
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
