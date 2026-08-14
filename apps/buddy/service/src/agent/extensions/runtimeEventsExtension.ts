import type { BundledLexoraExtension } from '../createBuddyResourceLoader'

export type BuddyAgentLifecycleEvent
  = { type: 'agent_end' | 'agent_settled' | 'agent_start' }
    | { type: 'message_end' | 'message_start', role: string }
    | { type: 'tool_execution_end', toolCallId: string, toolName: string, isError: boolean }
    | { type: 'tool_execution_start', toolCallId: string, toolName: string }
    | { type: 'turn_end' | 'turn_start', turnIndex: number }

export interface CreateRuntimeEventsExtensionOptions {
  sink: (event: BuddyAgentLifecycleEvent) => Promise<void> | void
}

export function createRuntimeEventsExtension(
  options: CreateRuntimeEventsExtensionOptions,
): BundledLexoraExtension {
  return {
    name: 'lexora-runtime-events',
    factory(pi) {
      pi.on('agent_start', () => options.sink({ type: 'agent_start' }))
      pi.on('agent_end', () => options.sink({ type: 'agent_end' }))
      pi.on('agent_settled', () => options.sink({ type: 'agent_settled' }))
      pi.on('turn_start', event => options.sink({
        type: 'turn_start',
        turnIndex: event.turnIndex,
      }))
      pi.on('turn_end', event => options.sink({
        type: 'turn_end',
        turnIndex: event.turnIndex,
      }))
      pi.on('message_start', event => options.sink({
        role: event.message.role,
        type: 'message_start',
      }))
      pi.on('message_end', event => options.sink({
        role: event.message.role,
        type: 'message_end',
      }))
      pi.on('tool_execution_start', event => options.sink({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        type: 'tool_execution_start',
      }))
      pi.on('tool_execution_end', event => options.sink({
        isError: event.isError,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        type: 'tool_execution_end',
      }))
    },
  }
}
