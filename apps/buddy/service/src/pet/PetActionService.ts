import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import type { AppendBuddyRunEventInput } from '../events/BuddyRunEvent'
import type { PetMacroId } from './petMacroCatalog'
import { randomUUID } from 'node:crypto'

import {
  petExecuteSequenceParamsSchema,
  petExecuteSequenceResultSchema,
} from '../../../shared/petProtocol'
import { compilePetMacro } from './petMacroCatalog'
import { createPetToolPresentation, PET_TOOL_NAME } from './petToolContract'

const PET_HOST_TIMEOUT_MS = 20_000

export interface PetActionEventSink {
  (event: AppendBuddyRunEventInput): Promise<unknown> | unknown
}

export interface PetActionServiceOptions {
  eventSink?: PetActionEventSink
  peer: Pick<RuntimeRpcPeerContract, 'request'>
}

export interface ExecutePetActionInput {
  macro: PetMacroId
  runId?: string
  toolCallId?: string
}

export class PetActionService {
  readonly #eventSink?: PetActionEventSink
  readonly #peer: Pick<RuntimeRpcPeerContract, 'request'>

  constructor(options: PetActionServiceOptions) {
    this.#eventSink = options.eventSink
    this.#peer = options.peer
  }

  async execute(input: ExecutePetActionInput) {
    const request = petExecuteSequenceParamsSchema.parse(compilePetMacro(
      input.macro,
      `pet_${randomUUID()}`,
    ))
    let result
    try {
      result = petExecuteSequenceResultSchema.parse(await this.#peer.request(
        'host.pet.executeSequence',
        request,
        PET_HOST_TIMEOUT_MS,
      ))
    }
    catch {
      result = petExecuteSequenceResultSchema.parse({
        code: 'PET_UNAVAILABLE',
        completedSteps: 0,
        status: 'failed',
      })
    }

    if (input.runId && input.toolCallId && this.#eventSink) {
      await this.#eventSink({
        payload: {
          macro: input.macro,
          presentation: createPetToolPresentation({
            arguments: { macro: input.macro },
            result: { details: { macro: input.macro, status: result.status } },
            toolName: PET_TOOL_NAME,
          }),
          status: result.status,
          toolCallId: input.toolCallId,
          toolName: PET_TOOL_NAME,
        },
        runId: input.runId,
        type: 'tool.updated',
      })
    }
    return result
  }
}
