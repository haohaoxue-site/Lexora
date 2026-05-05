import { z } from 'zod'

export const YDOC_CHECKPOINT_POLICY_DEFAULTS = {
  maxPendingUpdates: 100,
  maxPendingBytes: 1024 * 1024,
  maxIntervalMs: 60_000,
  idleFlushMs: 10_000,
} as const

export const YdocFormatVersionSchema = z.number().int().positive()
export const YdocRuntimeEpochSchema = z.number().int().positive()
export const YdocUpdateSeqSchema = z.number().int().nonnegative()
export const YdocBinaryPayloadSchema = z.instanceof(Uint8Array)

export const YdocCheckpointPolicySchema = z.object({
  maxPendingUpdates: z.number().int().positive(),
  maxPendingBytes: z.number().int().positive(),
  maxIntervalMs: z.number().int().positive(),
  idleFlushMs: z.number().int().positive(),
}).strict()

export type YdocCheckpointPolicy = z.infer<typeof YdocCheckpointPolicySchema>
export type YdocFormatVersion = z.infer<typeof YdocFormatVersionSchema>
export type YdocRuntimeEpoch = z.infer<typeof YdocRuntimeEpochSchema>
export type YdocUpdateSeq = z.infer<typeof YdocUpdateSeqSchema>
