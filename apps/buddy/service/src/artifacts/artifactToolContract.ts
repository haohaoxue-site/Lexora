import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyToolPresentation } from '../../../shared/runEventPresentation'
import type { BuddyRunOutputPayload } from '../../../shared/runOutput'
import type { BuddyToolClassificationResult } from '../approvals/toolClassification'
import type { CreateBuddyToolPresentationInput } from '../events/toolPresentationSupport'
import { Check } from 'typebox/value'
import { createToolClassificationFailure } from '../approvals/toolClassification'
import { readRecord } from '../events/toolPresentationSupport'
import { artifactPresentParameters } from './artifactToolParameters'

export const ARTIFACT_PRESENT_TOOL_NAME = 'lexora_artifact_present'

export function createArtifactPresentToolPresentation(
  input: CreateBuddyToolPresentationInput,
): Extract<BuddyToolPresentation, { card: 'artifact' }> | null {
  if (input.toolName !== ARTIFACT_PRESENT_TOOL_NAME)
    return null
  const details = readRecord(readRecord(input.result)?.details)
  const artifactIds = readArtifactIds(input.result)
  return {
    card: 'artifact',
    presentedCount: input.result === undefined ? null : artifactIds.length,
    status: input.result === undefined
      ? 'running'
      : input.isError || typeof details?.code === 'string'
        ? 'failed'
        : 'completed',
  }
}

export function classifyArtifactPresentTool(
  event: ToolCallEvent,
): BuddyToolClassificationResult | null {
  if (event.toolName !== ARTIFACT_PRESENT_TOOL_NAME)
    return null
  if (!Check(artifactPresentParameters, event.input))
    return createToolClassificationFailure('VALIDATION_FAILED')
  return {
    paths: event.input.files.map(file => ({ mode: 'existing' as const, path: file.path })),
    risk: 'read',
    source: 'lexora',
  }
}

export function createArtifactPresentRunOutput(
  input: Pick<CreateBuddyToolPresentationInput, 'isError' | 'result' | 'toolName'> & {
    toolCallId: string
  },
): BuddyRunOutputPayload | null {
  if (input.isError || input.toolName !== ARTIFACT_PRESENT_TOOL_NAME)
    return null
  const artifactIds = readArtifactIds(input.result)
  return artifactIds.length > 0
    ? {
        artifactIds,
        sourceToolCallId: input.toolCallId,
        sourceToolName: input.toolName,
      }
    : null
}

export function readArtifactIds(value: unknown): string[] {
  const details = readRecord(readRecord(value)?.details)
  return Array.isArray(details?.artifactIds)
    ? [...new Set(details.artifactIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256,
      ))].slice(0, 16)
    : []
}
