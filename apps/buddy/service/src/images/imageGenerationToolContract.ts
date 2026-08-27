import type { ImageGenerationErrorDiagnostic } from './ImageGenerationGateway'
import { BUDDY_ATTACHMENT_COUNT_LIMIT } from '../../../shared/attachmentPolicy'

export const IMAGE_GENERATION_TOOL_NAME = 'lexora_image_generate'

export interface ImageGenerationToolDetails {
  artifactIds: string[]
  code?: string
  diagnostic?: ImageGenerationErrorDiagnostic
  responseId: string | null
}

export function readImageGenerationToolDetails(value: unknown): ImageGenerationToolDetails | null {
  const result = readRecord(value)
  const details = readRecord(result?.details)
  if (!details)
    return null
  const artifactIds = Array.isArray(details.artifactIds)
    ? [...new Set(details.artifactIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256,
      ))].slice(0, BUDDY_ATTACHMENT_COUNT_LIMIT)
    : []
  const diagnostic = readDiagnostic(details.diagnostic)
  return {
    artifactIds,
    ...(typeof details.code === 'string' && details.code ? { code: details.code } : {}),
    ...(diagnostic ? { diagnostic } : {}),
    responseId: typeof details.responseId === 'string' && details.responseId
      ? details.responseId
      : null,
  }
}

function readDiagnostic(value: unknown): ImageGenerationErrorDiagnostic | null {
  const diagnostic = readRecord(value)
  if (!diagnostic)
    return null
  const providerCode = readBoundedString(diagnostic.providerCode)
  const providerParameter = readBoundedString(diagnostic.providerParameter)
  const requestId = readBoundedString(diagnostic.requestId)
  if (!providerCode && !providerParameter && !requestId)
    return null
  return {
    ...(providerCode ? { providerCode } : {}),
    ...(providerParameter ? { providerParameter } : {}),
    ...(requestId ? { requestId } : {}),
  }
}

function readBoundedString(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const result = value.trim()
  return result && result.length <= 256 && isDiagnosticToken(result)
    ? result
    : null
}

function isDiagnosticToken(value: string): boolean {
  const allowedCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-[]:/'
  return [...value].every(character => allowedCharacters.includes(character))
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
