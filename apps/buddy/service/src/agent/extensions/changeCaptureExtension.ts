import type { ToolCallEvent, ToolResultEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import type { BuddyRunContext } from './toolPolicyExtension'

export interface ChangeCaptureGateway {
  beginFileTool: (input: {
    arguments: unknown
    canonicalRoot: string
    conversationId: string
    runId: string
    toolCallId: string
    toolName: 'edit' | 'write'
  }) => Promise<void>
  finalizeRun: (runId: string) => Promise<void>
  finishFileTool: (input: {
    canonicalRoot: string
    conversationId: string
    isError: boolean
    runId: string
    toolCallId: string
    toolName: 'edit' | 'write'
  }) => Promise<void>
  markPartial: (input: { conversationId: string, runId: string }) => Promise<void>
}

export interface CreateChangeCaptureExtensionOptions {
  canonicalRoot: string
  conversationId: string
  getRunContext: () => BuddyRunContext | null
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
  if (event.toolName === 'bash') {
    await ignoreCaptureError(() => options.service.markPartial({
      conversationId: options.conversationId,
      runId: run.runId,
    }))
    return
  }
  if (event.toolName !== 'edit' && event.toolName !== 'write')
    return
  const toolName = event.toolName === 'edit' ? 'edit' : 'write'
  await safelyCapture(
    () => options.service.beginFileTool({
      arguments: event.input,
      canonicalRoot: options.canonicalRoot,
      conversationId: options.conversationId,
      runId: run.runId,
      toolCallId: event.toolCallId,
      toolName,
    }),
    () => options.service.markPartial({
      conversationId: options.conversationId,
      runId: run.runId,
    }),
  )
}

async function captureAfterTool(
  options: CreateChangeCaptureExtensionOptions,
  event: ToolResultEvent,
): Promise<void> {
  const run = options.getRunContext()
  if (!run || (event.toolName !== 'edit' && event.toolName !== 'write'))
    return
  const toolName = event.toolName === 'edit' ? 'edit' : 'write'
  await safelyCapture(
    () => options.service.finishFileTool({
      canonicalRoot: options.canonicalRoot,
      conversationId: options.conversationId,
      isError: event.isError,
      runId: run.runId,
      toolCallId: event.toolCallId,
      toolName,
    }),
    () => options.service.markPartial({
      conversationId: options.conversationId,
      runId: run.runId,
    }),
  )
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
