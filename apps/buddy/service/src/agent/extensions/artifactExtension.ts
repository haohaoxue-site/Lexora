import type { Static, TSchema } from 'typebox'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Check } from 'typebox/value'
import { ARTIFACT_PRESENT_TOOL_NAME } from '../../artifacts/artifactToolContract'
import { artifactPresentParameters } from '../../artifacts/artifactToolParameters'

type ArtifactPresentParameters = Static<typeof artifactPresentParameters>

export interface CreateArtifactExtensionOptions {
  artifactService: {
    registerFiles: (input: {
      canonicalRoot: string
      conversationId: string
      files: readonly { outputName: string, path: string }[]
      runId: string
      sourceToolCallId: string
    }) => Promise<Array<{ id: string }>>
  }
  canonicalRoot: string
  conversationId: string
  getRunId: () => string | undefined
}

export function createArtifactExtension(
  options: CreateArtifactExtensionOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-artifacts',
    factory(pi) {
      pi.registerTool(defineTool<TSchema, { artifactIds: string[] }>({
        description: [
          'Present completed files as immutable Lexora Buddy artifacts for the user.',
          'Use this only for explicit deliverables, not every file touched while working.',
        ].join(' '),
        execute: async (toolCallId, parameters) => {
          if (!Check(artifactPresentParameters, parameters))
            return artifactFailure('VALIDATION_FAILED')
          const runId = options.getRunId()
          if (!runId)
            return artifactFailure('VALIDATION_FAILED')
          try {
            const input = parameters as ArtifactPresentParameters
            const artifacts = await options.artifactService.registerFiles({
              canonicalRoot: options.canonicalRoot,
              conversationId: options.conversationId,
              files: input.files,
              runId,
              sourceToolCallId: toolCallId,
            })
            const artifactIds = artifacts.map(artifact => artifact.id)
            return {
              content: [{
                text: JSON.stringify({ artifactIds, presentedCount: artifactIds.length }),
                type: 'text' as const,
              }],
              details: { artifactIds },
            }
          }
          catch (error) {
            return artifactFailure(readArtifactErrorCode(error))
          }
        },
        label: 'Present artifacts',
        name: ARTIFACT_PRESENT_TOOL_NAME,
        parameters: artifactPresentParameters,
        promptGuidelines: [
          'After creating files that are explicit user deliverables, call this tool so they appear as clickable artifacts.',
          'Do not present ordinary intermediate edits, temporary files, credentials, or source files changed only as part of implementation work.',
          'Set outputName to a concise semantic file name in the user language and include the correct file extension.',
        ],
      }))
    },
  }
}

function artifactFailure(code: string) {
  return {
    content: [{
      text: `Lexora Buddy could not present the requested artifacts: ${code}`,
      type: 'text' as const,
    }],
    details: { artifactIds: [], code },
  }
}

function readArtifactErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code
  return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)
    ? code
    : 'ARTIFACT_IMPORT_FAILED'
}
