import type { ToolCallEvent, ToolResultEvent } from '@earendil-works/pi-coding-agent'
import type { ChangeCaptureService } from '../../changes/ChangeCaptureService'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type { BuddyExtensionRunContext } from './BuddyExtensionRunContext'
import type { BuddyInProcessExtension } from './BuddyInProcessExtension'
import { isPiShellToolName } from './piBuiltinTools'

export interface CreateChangeCaptureExtensionOptions {
  conversationId: string
  cwd: string
  getRunContext: () => BuddyExtensionRunContext | null
  grants: readonly DirectoryGrant[]
  getWorkspaceGrants?: () => readonly DirectoryGrant[]
  service: Pick<ChangeCaptureService, 'beginFileTool' | 'beginWorkspaceTool' | 'finalizeRun' | 'finishFileTool' | 'finishWorkspaceTool' | 'markPartial'>
  workspaceMutationTools?: readonly string[]
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
  if (capturesWorkspaceChanges(options, event.toolName)) {
    await safelyCapture(
      () => options.service.beginWorkspaceTool({
        conversationId: options.conversationId,
        cwd: options.cwd,
        grants: options.getWorkspaceGrants?.() ?? options.grants,
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
  if (capturesWorkspaceChanges(options, event.toolName)) {
    try {
      const capture = await options.service.finishWorkspaceTool({
        conversationId: options.conversationId,
        cwd: options.cwd,
        grants: options.getWorkspaceGrants?.() ?? options.grants,
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

function capturesWorkspaceChanges(options: CreateChangeCaptureExtensionOptions, toolName: string): boolean {
  return isPiShellToolName(toolName)
    || options.workspaceMutationTools?.includes(toolName) === true
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
