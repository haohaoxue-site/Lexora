import { z } from 'zod'

const petDurationSchema = z.number().int().positive().max(60_000)
const petIdentifierSchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)

export const petAnimationSchema = z.enum([
  'approval',
  'celebrate',
  'curious',
  'explain',
  'idle',
  'sad',
  'thinking',
  'working',
])

const petPlaybackSchema = z.discriminatedUnion('kind', [
  z.object({
    durationMs: petDurationSchema,
    kind: z.literal('once'),
  }).strict(),
  z.object({
    clipDurationMs: petDurationSchema,
    durationMs: petDurationSchema,
    kind: z.literal('loopForDuration'),
  }).strict(),
])

export const petPrimitiveStepSchema = z.discriminatedUnion('kind', [
  z.object({
    animation: petAnimationSchema.exclude(['idle']),
    completionBehavior: z.literal('restoreIdle'),
    interruptPolicy: z.enum(['interruptible', 'finishStep']),
    kind: z.literal('playAction'),
    playback: petPlaybackSchema,
    timeoutMs: petDurationSchema,
  }).strict(),
  z.object({
    after: z.literal('idle'),
    interruptPolicy: z.literal('interruptible'),
    kind: z.literal('moveByPath'),
    path: z.array(z.object({ kind: z.literal('home') }).strict()).length(1),
    timeoutMs: petDurationSchema,
  }).strict(),
])

export const petExecuteSequenceParamsSchema = z.object({
  priority: z.number().int().min(0).max(100),
  requestId: petIdentifierSchema,
  steps: z.array(petPrimitiveStepSchema).min(1).max(16),
}).strict()

const petSequenceFailureCodeSchema = z.enum([
  'PET_BUSY',
  'PET_PROTOCOL_ERROR',
  'PET_STEP_FAILED',
  'PET_UNAVAILABLE',
  'VALIDATION_FAILED',
])

export const petExecuteSequenceResultSchema = z.discriminatedUnion('status', [
  z.object({
    completedSteps: z.number().int().nonnegative(),
    status: z.literal('completed'),
  }).strict(),
  z.object({
    completedSteps: z.number().int().nonnegative(),
    reasonCode: z.literal('admission.preemptedByHigherPriorityPlan'),
    status: z.literal('interrupted'),
  }).strict(),
  z.object({
    code: petSequenceFailureCodeSchema,
    completedSteps: z.number().int().nonnegative(),
    status: z.literal('failed'),
  }).strict(),
])

export type PetPrimitiveStep = z.infer<typeof petPrimitiveStepSchema>
export type PetExecuteSequenceParams = z.infer<typeof petExecuteSequenceParamsSchema>
export type PetExecuteSequenceResult = z.infer<typeof petExecuteSequenceResultSchema>
