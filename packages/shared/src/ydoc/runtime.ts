import type { CollabErrorCode } from '@haohaoxue/lexora-contracts'
import { COLLAB_ERROR_CODE } from '@haohaoxue/lexora-contracts/collab/constants'

export function isYdocRuntimeInitialized(input: {
  checkpointState: Uint8Array | null
  checkpointSeq: number
  checkpointUpdateSeq: number
  updateSeq: number
}): boolean {
  return input.checkpointState !== null
    || input.checkpointSeq > 0
    || input.checkpointUpdateSeq > 0
    || input.updateSeq > 0
}

export function resolveYdocRuntimeEpochError(input: {
  currentEpoch: number
  inputEpoch: number
}): CollabErrorCode | null {
  return input.currentEpoch === input.inputEpoch
    ? null
    : COLLAB_ERROR_CODE.RUNTIME_EPOCH_EXPIRED
}

export function resolveYdocUpdateSequenceError(input: {
  inputSeq: number
  checkpointUpdateSeq: number
  updateSeq: number
}): CollabErrorCode | null {
  if (input.inputSeq <= input.checkpointUpdateSeq) {
    return COLLAB_ERROR_CODE.UPDATE_CHECKPOINTED
  }

  if (input.inputSeq !== input.updateSeq + 1) {
    return COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP
  }

  return null
}
