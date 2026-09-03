import type { ToolCallEvent, ToolResultEvent } from '@earendil-works/pi-coding-agent'
import type {
  CapturedFileChange,
  CapturedWorkspaceChange,
} from '../../changes/ChangeCaptureService'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import type { BuddyRunContext } from './toolPolicyExtension'
import { isPiShellToolName } from '../piBuiltinTools'

export interface ChangeCaptureGateway {
  beginFileTool: (input: {
    arguments: unknown
    conversationId: string
    cwd: string
    grants: readonly DirectoryGrant[]
    runId: string
    toolCallId: string
    toolName: 'edit' | 'write'
  }) => Promise<void>
  beginShellTool: (input: {
    conversationId: string
    grants: readonly DirectoryGrant[]
    runId: string
    toolCallId: string
  }) => Promise<void>
  finalizeRun: (runId: string) => Promise<void>
  finishFileTool: (input: {
    conversationId: string
    cwd: string
    grants: readonly DirectoryGrant[]
    isError: boolean
    runId: string
    toolCallId: string
    toolName: 'edit' | 'write'
  }) => Promise<CapturedFileChange | null>
  finishShellTool: (input: {
    conversationId: string
    grants: readonly DirectoryGrant[]
    runId: string
    toolCallId: string
  }) => Promise<{ changes: CapturedWorkspaceChange[], complete: boolean }>
  markPartial: (input: { conversationId: string, runId: string }) => Promise<void>
}

export interface CreateChangeCaptureExtensionOptions {
  artifactService: {
    recordFileChange: (input: {
      changeType: 'created' | 'deleted' | 'updated'
      conversationId: string
      grants: readonly DirectoryGrant[]
      path: string
      runId: string
      sourceToolCallId: string
    }) => Promise<{ id: string }>
    recordFileMove: (input: {
      conversationId: string
      fromPath: string
      grants: readonly DirectoryGrant[]
      runId: string
      sourceToolCallId: string
      toPath: string
    }) => Promise<{ id: string }>
  }
  conversationId: string
  cwd: string
  getRunContext: () => BuddyRunContext | null
  grants: readonly DirectoryGrant[]
  service: ChangeCaptureGateway
}

export function createChangeCaptureExtension(
  options: CreateChangeCaptureExtensionOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-change-capture',
    factory(pi) {
      pi.on('tool_call', event => captureBeforeTool(options, event))
      pi.on('tool_result', event => captureAfterTool(options, event))
      pi.on('agent_end', async () => {
        const run = options.getRunContext()
        if (!run)
          return
        await safelyCapture(
          () => options.service.finalizeRun(run.runId),
          () => options.service.markPartial({
            conversationId: options.conversationId,
            runId: run.runId,
          }),
        )
      })
    },
  }
}

async function captureBeforeTool(
  options: CreateChangeCaptureExtensionOptions,
  event: ToolCallEvent,
): Promise<void> {
  const run = options.getRunContext()
  if (!run)
    return
  if (isPiShellToolName(event.toolName)) {
    await safelyCapture(
      () => options.service.beginShellTool({
        conversationId: options.conversationId,
        grants: options.grants,
        runId: run.runId,
        toolCallId: event.toolCallId,
      }),
      () => markPartial(options, run.runId),
    )
    return
  }
  if (event.toolName !== 'edit' && event.toolName !== 'write')
    return
  const toolName = event.toolName === 'edit' ? 'edit' : 'write'
  await safelyCapture(
    () => options.service.beginFileTool({
      arguments: event.input,
      conversationId: options.conversationId,
      cwd: options.cwd,
      grants: options.grants,
      runId: run.runId,
      toolCallId: event.toolCallId,
      toolName,
    }),
    () => markPartial(options, run.runId),
  )
}

async function captureAfterTool(
  options: CreateChangeCaptureExtensionOptions,
  event: ToolResultEvent,
): Promise<{ details: Record<string, unknown> } | void> {
  const run = options.getRunContext()
  if (!run)
    return
  if (isPiShellToolName(event.toolName))
    return captureAfterShellTool(options, event, run.runId)
  if (event.toolName !== 'edit' && event.toolName !== 'write')
    return
  const toolName = event.toolName === 'edit' ? 'edit' : 'write'
  let change: CapturedFileChange | null
  try {
    change = await options.service.finishFileTool({
      conversationId: options.conversationId,
      cwd: options.cwd,
      grants: options.grants,
      isError: event.isError,
      runId: run.runId,
      toolCallId: event.toolCallId,
      toolName,
    })
  }
  catch {
    await ignoreCaptureError(() => markPartial(options, run.runId))
    return
  }
  if (!change)
    return
  const artifactIds = await recordWorkspaceArtifacts(
    options,
    [change],
    run.runId,
    event.toolCallId,
  )
  return withArtifactDetails(event.details, artifactIds)
}

async function captureAfterShellTool(
  options: CreateChangeCaptureExtensionOptions,
  event: ToolResultEvent,
  runId: string,
): Promise<{ details: Record<string, unknown> } | void> {
  let capture: { changes: CapturedWorkspaceChange[], complete: boolean }
  try {
    capture = await options.service.finishShellTool({
      conversationId: options.conversationId,
      grants: options.grants,
      runId,
      toolCallId: event.toolCallId,
    })
  }
  catch {
    await ignoreCaptureError(() => markPartial(options, runId))
    return
  }
  if (!capture.complete)
    await ignoreCaptureError(() => markPartial(options, runId))
  const artifactIds = await recordWorkspaceArtifacts(
    options,
    capture.changes,
    runId,
    event.toolCallId,
  )
  return withArtifactDetails(event.details, artifactIds)
}

async function recordWorkspaceArtifacts(
  options: CreateChangeCaptureExtensionOptions,
  changes: readonly CapturedWorkspaceChange[],
  runId: string,
  sourceToolCallId: string,
): Promise<string[]> {
  const artifactIds: string[] = []
  for (const change of changes) {
    try {
      const artifact = change.changeType === 'renamed'
        ? await options.artifactService.recordFileMove({
            conversationId: options.conversationId,
            fromPath: change.fromPath,
            grants: options.grants,
            runId,
            sourceToolCallId,
            toPath: change.toPath,
          })
        : await options.artifactService.recordFileChange({
            changeType: change.changeType,
            conversationId: options.conversationId,
            grants: options.grants,
            path: change.canonicalPath,
            runId,
            sourceToolCallId,
          })
      artifactIds.push(artifact.id)
    }
    catch {
      await ignoreCaptureError(() => markPartial(options, runId))
    }
  }
  return [...new Set(artifactIds)]
}

function withArtifactDetails(
  details: unknown,
  artifactIds: readonly string[],
): { details: Record<string, unknown> } | void {
  if (artifactIds.length === 0)
    return
  return {
    details: {
      ...readDetails(details),
      artifactIds: mergeArtifactIds(details, artifactIds),
    },
  }
}

function readDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function mergeArtifactIds(value: unknown, artifactIds: readonly string[]): string[] {
  const currentArtifactIds = readDetails(value).artifactIds
  const existing = Array.isArray(currentArtifactIds)
    ? currentArtifactIds.filter((id): id is string => typeof id === 'string' && Boolean(id))
    : []
  return [...new Set([...existing, ...artifactIds])]
}

function markPartial(
  options: CreateChangeCaptureExtensionOptions,
  runId: string,
): Promise<void> {
  return options.service.markPartial({
    conversationId: options.conversationId,
    runId,
  })
}

async function safelyCapture(
  capture: () => Promise<void>,
  markPartial: () => Promise<void>,
): Promise<void> {
  try {
    await capture()
  }
  catch {
    await ignoreCaptureError(markPartial)
  }
}

async function ignoreCaptureError(operation: () => Promise<void>): Promise<void> {
  try {
    await operation()
  }
  catch {}
}
