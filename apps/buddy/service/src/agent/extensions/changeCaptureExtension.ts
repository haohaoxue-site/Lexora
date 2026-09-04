import type { ToolCallEvent, ToolResultEvent } from '@earendil-works/pi-coding-agent'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import type { BuddyRunContext } from './toolPolicyExtension'
import { IMAGE_GENERATION_TOOL_NAME } from '../../images/imageGenerationToolContract'
import { IMAGE_TRANSFORM_TOOL_NAME } from '../../images/imageTransformToolContract'
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
  beginWorkspaceTool: (input: {
    conversationId: string
    cwd: string
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
  }) => Promise<void>
  finishWorkspaceTool: (input: {
    conversationId: string
    cwd: string
    grants: readonly DirectoryGrant[]
    isError: boolean
    runId: string
    toolCallId: string
    toolName: string
  }) => Promise<{ complete: boolean }>
  markPartial: (input: { conversationId: string, runId: string }) => Promise<void>
}

export interface CreateChangeCaptureExtensionOptions {
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
  if (capturesWorkspaceChanges(event.toolName)) {
    await safelyCapture(
      () => options.service.beginWorkspaceTool({
        conversationId: options.conversationId,
        cwd: options.cwd,
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
): Promise<void> {
  const run = options.getRunContext()
  if (!run)
    return
  if (capturesWorkspaceChanges(event.toolName)) {
    try {
      const capture = await options.service.finishWorkspaceTool({
        conversationId: options.conversationId,
        cwd: options.cwd,
        grants: options.grants,
        isError: event.isError,
        runId: run.runId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      })
      if (!capture.complete)
        await ignoreCaptureError(() => markPartial(options, run.runId))
    }
    catch {
      await ignoreCaptureError(() => markPartial(options, run.runId))
    }
    return
  }
  if (event.toolName !== 'edit' && event.toolName !== 'write')
    return
  const toolName = event.toolName === 'edit' ? 'edit' : 'write'
  await safelyCapture(
    () => options.service.finishFileTool({
      conversationId: options.conversationId,
      cwd: options.cwd,
      grants: options.grants,
      isError: event.isError,
      runId: run.runId,
      toolCallId: event.toolCallId,
      toolName,
    }),
    () => markPartial(options, run.runId),
  )
}

function capturesWorkspaceChanges(toolName: string): boolean {
  return isPiShellToolName(toolName)
    || toolName === IMAGE_GENERATION_TOOL_NAME
    || toolName === IMAGE_TRANSFORM_TOOL_NAME
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
