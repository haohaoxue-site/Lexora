import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import type { ChatGenerationEvent } from '../../runtime/typing'
import { ChatGenerationEventSchema } from '@haohaoxue/samepage-contracts'

export interface EmitAgentModelStreamPartOptions {
  generationId: string
  emit: (event: ChatGenerationEvent) => Promise<void> | void
}

export async function emitAgentModelStreamPart(
  part: AgentModelStreamPart,
  options: EmitAgentModelStreamPartOptions,
): Promise<void> {
  if (part.type === 'reasoning.delta') {
    await options.emit(ChatGenerationEventSchema.parse({
      type: 'model.reasoning.delta',
      generationId: options.generationId,
      payload: {
        text: part.text,
      },
    }))
    return
  }

  if (part.type === 'text.delta') {
    await options.emit(ChatGenerationEventSchema.parse({
      type: 'model.text.delta',
      generationId: options.generationId,
      payload: {
        text: part.text,
      },
    }))
  }
}

export function createAgentGenerationLifecycleEvent(input: {
  type: 'generation.started' | 'generation.completed' | 'generation.failed' | 'generation.cancelled'
  generationId: string
  payload?: unknown
}): ChatGenerationEvent {
  return ChatGenerationEventSchema.parse({
    type: input.type,
    generationId: input.generationId,
    payload: input.payload,
  })
}
