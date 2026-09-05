import { z } from 'zod'

export const BROWSER_ERROR_CODES = [
  'BROWSER_CERTIFICATE_ERROR',
  'BROWSER_CONTROL_REQUIRED',
  'BROWSER_DIALOG_PENDING',
  'BROWSER_HUMAN_INPUT_REQUIRED',
  'BROWSER_NAVIGATION_BLOCKED',
  'BROWSER_PAGE_CRASHED',
  'BROWSER_PAGE_FAILED',
  'BROWSER_PAGE_UNRESPONSIVE',
  'BROWSER_PERMISSION_DENIED',
  'BROWSER_SESSION_EVICTED',
  'BROWSER_SESSION_LIMIT_REACHED',
  'BROWSER_SESSION_NOT_FOUND',
  'BROWSER_TARGET_STALE',
] as const

export const BROWSER_RECOVERY_ACTIONS = [
  'read_again',
  'open_again',
  'request_human_control',
] as const

export const BROWSER_FAILURE_REASONS = [
  'FILE_CHOOSER_GUARD_UNAVAILABLE',
  'INVALID_TARGET',
  'NETWORK_POLICY_BLOCKED',
  'TARGET_COVERED',
  'TARGET_DETACHED',
  'TARGET_DISABLED',
  'TARGET_NOT_EDITABLE',
  'TARGET_NOT_FOCUSABLE',
  'TARGET_NOT_SELECTABLE',
  'TARGET_NOT_VISIBLE',
  'TARGET_READ_ONLY',
  'TARGET_UNSTABLE',
  'UNSUPPORTED_PROTOCOL',
] as const

export const BROWSER_DEFAULT_OBSERVATION_ELEMENT_LIMIT = 160
export const BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT = 400
export const BROWSER_MAX_OBSERVATION_TEXT_BYTES = 32 * 1_024
export const BROWSER_MAX_SCREENSHOT_BYTES = 16 * 1_024 * 1_024
export const BROWSER_ACTION_TEXT_MAX_LENGTH = 16 * 1_024
export const BROWSER_MAX_WAIT_TIMEOUT_MS = 15_000
export const BROWSER_ACTION_KINDS = [
  'navigate',
  'back',
  'forward',
  'reload',
  'stop',
  'click',
  'fill',
  'type',
  'press',
  'select',
  'scroll',
  'wait',
] as const
export const BROWSER_PRESS_KEYS = [
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Space',
] as const
export const BROWSER_WAIT_CONDITIONS = [
  'page-ready',
  'url-changed',
  'url-matches',
  'text-visible',
  'ref-visible',
  'ref-hidden',
  'dom-stable',
] as const
export const BROWSER_WAIT_TEXT_MAX_LENGTH = 512
export const BROWSER_WAIT_DEFAULT_QUIET_MS = 300
export const BROWSER_WAIT_MAX_QUIET_MS = 5_000

export function getBrowserObservationTextByteLength(observation: object): number {
  return new TextEncoder().encode(JSON.stringify(observation)).byteLength
}

const browserConversationIdSchema = z.string().trim().min(1).max(128)
const browserIdSchema = z.uuid()
const browserPathSchema = z.string().trim().min(1).max(32_768)
const browserElementRefSchema = z.string().regex(/^e[1-9]\d*$/)
const browserFrameIdSchema = z.string().trim().min(1).max(256)
const browserUrlSchema = z.string().trim().min(1).max(4_096).refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
})
const browserRuntimeUrlSchema = z.union([
  z.literal('file:///[redacted]'),
  browserUrlSchema,
])
const browserOriginSchema = z.string().min(1).max(4_096).refine((value) => {
  if (value === 'file://')
    return true
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin === value
  }
  catch {
    return false
  }
})

export const browserErrorCodeSchema = z.enum(BROWSER_ERROR_CODES)
export const browserFailureReasonSchema = z.enum(BROWSER_FAILURE_REASONS)
export const browserRecoveryActionSchema = z.enum(BROWSER_RECOVERY_ACTIONS)
export const browserActionKindSchema = z.enum(BROWSER_ACTION_KINDS)

export const browserErrorSchema = z.object({
  code: browserErrorCodeSchema,
  reason: browserFailureReasonSchema.nullable(),
  recovery: browserRecoveryActionSchema.nullable(),
}).strict()

export const browserOpenTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('url'),
    url: browserUrlSchema,
  }).strict(),
  z.object({
    entryPath: browserPathSchema,
    kind: z.literal('local-file'),
    rootPath: browserPathSchema,
  }).strict(),
])

export const browserObserveParamsSchema = z.object({
  maxElements: z.number().int().min(1).max(BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT).optional(),
  pageId: browserIdSchema,
  sessionId: browserIdSchema,
}).strict()

const browserActionTextSchema = z.string().max(BROWSER_ACTION_TEXT_MAX_LENGTH)

export const browserWaitConditionSchema = z.enum(BROWSER_WAIT_CONDITIONS)

const browserWaitTimeoutMsSchema = z.number().int().min(1).max(BROWSER_MAX_WAIT_TIMEOUT_MS)
const browserWaitTextSchema = z.string().trim().min(1).max(BROWSER_WAIT_TEXT_MAX_LENGTH)
const browserPageReadyWaitSpecSchema = z.object({
  condition: z.literal('page-ready'),
  timeoutMs: browserWaitTimeoutMsSchema,
}).strict()
const browserUrlChangedWaitSpecSchema = z.object({
  condition: z.literal('url-changed'),
  timeoutMs: browserWaitTimeoutMsSchema,
}).strict()
const browserUrlMatchesWaitSpecSchema = z.object({
  condition: z.literal('url-matches'),
  pattern: browserWaitTextSchema,
  timeoutMs: browserWaitTimeoutMsSchema,
}).strict()
const browserTextVisibleWaitSpecSchema = z.object({
  condition: z.literal('text-visible'),
  text: browserWaitTextSchema,
  timeoutMs: browserWaitTimeoutMsSchema,
}).strict()
const browserDomStableWaitSpecSchema = z.object({
  condition: z.literal('dom-stable'),
  quietMs: z.number().int().min(50).max(BROWSER_WAIT_MAX_QUIET_MS).optional(),
  timeoutMs: browserWaitTimeoutMsSchema,
}).strict()

export const browserWaitSpecSchema = z.discriminatedUnion('condition', [
  browserPageReadyWaitSpecSchema,
  browserUrlChangedWaitSpecSchema,
  browserUrlMatchesWaitSpecSchema,
  browserTextVisibleWaitSpecSchema,
  browserDomStableWaitSpecSchema,
])

export const browserWaitOutcomeSchema = z.object({
  condition: browserWaitConditionSchema,
  elapsedMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  satisfied: z.boolean(),
}).strict()

export const browserOpenParamsSchema = z.object({
  conversationId: browserConversationIdSchema,
  target: browserOpenTargetSchema,
  until: browserWaitSpecSchema.optional(),
}).strict()

const browserNonWaitActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('navigate'),
    url: browserUrlSchema,
  }).strict(),
  z.object({ kind: z.literal('back') }).strict(),
  z.object({ kind: z.literal('forward') }).strict(),
  z.object({ kind: z.literal('reload') }).strict(),
  z.object({ kind: z.literal('stop') }).strict(),
  z.object({
    kind: z.literal('click'),
    ref: browserElementRefSchema,
  }).strict(),
  z.object({
    kind: z.literal('fill'),
    ref: browserElementRefSchema,
    text: browserActionTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('type'),
    ref: browserElementRefSchema,
    text: browserActionTextSchema.min(1),
  }).strict(),
  z.object({
    key: z.enum(BROWSER_PRESS_KEYS),
    kind: z.literal('press'),
    ref: browserElementRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal('select'),
    ref: browserElementRefSchema,
    values: z.array(z.string().max(4_096))
      .min(1)
      .max(32)
      .refine(values => new Set(values).size === values.length),
  }).strict(),
  z.object({
    amount: z.enum(['page', 'half-page']),
    direction: z.enum(['up', 'down']),
    kind: z.literal('scroll'),
    ref: browserElementRefSchema.optional(),
  }).strict(),
])

const browserWaitActionSchema = z.discriminatedUnion('condition', [
  browserPageReadyWaitSpecSchema.extend({ kind: z.literal('wait') }),
  browserUrlChangedWaitSpecSchema.extend({ kind: z.literal('wait') }),
  browserUrlMatchesWaitSpecSchema.extend({ kind: z.literal('wait') }),
  browserTextVisibleWaitSpecSchema.extend({ kind: z.literal('wait') }),
  browserDomStableWaitSpecSchema.extend({ kind: z.literal('wait') }),
  z.object({
    condition: z.literal('ref-visible'),
    kind: z.literal('wait'),
    ref: browserElementRefSchema,
    timeoutMs: browserWaitTimeoutMsSchema,
  }).strict(),
  z.object({
    condition: z.literal('ref-hidden'),
    kind: z.literal('wait'),
    ref: browserElementRefSchema,
    timeoutMs: browserWaitTimeoutMsSchema,
  }).strict(),
])

export const browserActionSchema = z.union([
  browserNonWaitActionSchema,
  browserWaitActionSchema,
])

const browserCapabilityActParamsShape = {
  action: browserActionSchema,
  documentRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  frameId: browserFrameIdSchema.optional(),
  observationId: browserIdSchema,
  pageId: browserIdSchema,
}

export const browserCapabilityActParamsSchema = z.object(
  browserCapabilityActParamsShape,
).strict().superRefine(validateBrowserActionFrame)

export const browserActParamsSchema = z.object({
  ...browserCapabilityActParamsShape,
  controlEpoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sessionId: browserIdSchema,
}).strict().superRefine(validateBrowserActionFrame)

export const browserValidateActionParamsSchema = z.object({
  ...browserCapabilityActParamsShape,
  sessionId: browserIdSchema,
}).strict().superRefine(validateBrowserActionFrame)

function validateBrowserActionFrame(
  input: { action: z.infer<typeof browserActionSchema>, frameId?: string },
  context: z.RefinementCtx,
): void {
  const hasTarget = getBrowserActionRef(input.action) !== undefined
  if (hasTarget === Boolean(input.frameId))
    return
  context.addIssue({
    code: 'custom',
    message: hasTarget
      ? 'Targeted browser actions must include the observed frame id'
      : 'Targetless browser actions cannot include a frame id',
    path: ['frameId'],
  })
}

export const browserAcquireControlParamsSchema = z.object({
  pageId: browserIdSchema,
  sessionId: browserIdSchema,
}).strict()

export const browserReleaseControlParamsSchema = z.object({
  controlEpoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pageId: browserIdSchema,
  sessionId: browserIdSchema,
}).strict()

export const browserControlLeaseSchema = z.object({
  controller: z.literal('agent'),
  controlEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  pageId: browserIdSchema,
  sessionId: browserIdSchema,
}).strict()

export function getBrowserActionRef(
  action: z.infer<typeof browserActionSchema>,
): string | undefined {
  switch (action.kind) {
    case 'click':
    case 'fill':
    case 'type':
    case 'select':
      return action.ref
    case 'press':
    case 'scroll':
      return action.ref
    case 'wait':
      return 'ref' in action ? action.ref : undefined
    default:
      return undefined
  }
}

export const browserSessionParamsSchema = z.object({
  sessionId: browserIdSchema,
}).strict()

const browserSecurityStateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('blank'),
    origin: z.null(),
  }).strict(),
  z.object({
    kind: z.enum(['certificate-error', 'insecure', 'local', 'secure']),
    origin: browserOriginSchema,
  }).strict(),
])

export const browserStateSnapshotSchema = z.object({
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  controller: z.enum(['agent', 'human']),
  controlEpoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  conversationId: browserConversationIdSchema,
  error: browserErrorSchema.nullable(),
  pageId: browserIdSchema,
  profileMode: z.enum(['default', 'incognito']),
  security: browserSecurityStateSchema,
  sessionId: browserIdSchema,
  status: z.enum(['error', 'idle', 'loading', 'ready']),
  title: z.string().max(512),
  url: z.union([z.literal('about:blank'), browserRuntimeUrlSchema]),
  visible: z.boolean(),
}).strict()

const observedStringSchema = browserFrameIdSchema
const observedStringListSchema = z.array(observedStringSchema).max(32)
const browserObservationTruncationReasonSchema = z.enum([
  'element-limit',
  'frame-limit',
  'frame-unavailable',
  'text-limit',
])
const browserScreenshotFallbackReasonSchema = z.enum([
  'semantic-content-empty',
  'semantic-content-truncated',
  'visual-content',
])

export const browserObservationTruncationSchema = z.object({
  reasons: z.array(browserObservationTruncationReasonSchema)
    .min(1)
    .max(4)
    .refine(reasons => new Set(reasons).size === reasons.length),
  suggestedMaxElements: z.number()
    .int()
    .min(1)
    .max(BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT)
    .optional(),
}).strict()

export const browserScreenshotRefSchema = z.object({
  byteLength: z.number().int().min(8).max(BROWSER_MAX_SCREENSHOT_BYTES),
  height: z.number().int().positive().max(32_768),
  mimeType: z.literal('image/png'),
  reasons: z.array(browserScreenshotFallbackReasonSchema)
    .min(1)
    .max(3)
    .refine(reasons => new Set(reasons).size === reasons.length),
  screenshotId: browserIdSchema,
  width: z.number().int().positive().max(32_768),
}).strict()

export const browserObservedElementSchema = z.object({
  actions: observedStringListSchema,
  description: z.string().max(1_024).optional(),
  frameId: observedStringSchema,
  inputMode: z.literal('human').optional(),
  level: z.number().int().positive().max(128).optional(),
  name: z.string().max(1_024),
  ref: browserElementRefSchema,
  role: observedStringSchema,
  states: observedStringListSchema,
  value: z.string().max(4_096).optional(),
  valueState: z.enum(['empty', 'present', 'redacted']).optional(),
}).strict().superRefine((element, context) => {
  if (element.inputMode === 'human') {
    if (element.actions.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Human-only browser inputs cannot expose agent actions',
        path: ['actions'],
      })
    }
    if (element.valueState !== 'empty' && element.valueState !== 'redacted') {
      context.addIssue({
        code: 'custom',
        message: 'Human-only browser inputs must expose only filled state',
        path: ['valueState'],
      })
    }
  }
  if (element.valueState === 'redacted' && element.inputMode !== 'human') {
    context.addIssue({
      code: 'custom',
      message: 'Redacted browser inputs must require human input',
      path: ['inputMode'],
    })
  }
  if (element.value !== undefined && element.valueState !== 'present') {
    context.addIssue({
      code: 'custom',
      message: 'Only present browser elements can include a value',
      path: ['value'],
    })
  }
  if (
    element.valueState === 'present'
    && (element.value === undefined || element.value.length === 0)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Present browser elements must include a non-empty value',
      path: ['value'],
    })
  }
})

export const browserObservationSchema = z.object({
  documentRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  elements: z.array(browserObservedElementSchema).max(BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT),
  observationId: browserIdSchema,
  pageId: browserIdSchema,
  screenshot: browserScreenshotRefSchema.optional(),
  sessionId: browserIdSchema,
  status: z.enum(['error', 'loading', 'ready']),
  title: z.string().max(512),
  truncated: z.boolean(),
  truncation: browserObservationTruncationSchema.optional(),
  url: z.union([z.literal('about:blank'), browserRuntimeUrlSchema]),
}).strict().superRefine((observation, context) => {
  if (observation.truncated !== Boolean(observation.truncation)) {
    context.addIssue({
      code: 'custom',
      message: 'Truncated browser observations must describe their truncation',
      path: ['truncation'],
    })
  }
  if (
    getBrowserObservationTextByteLength(observation)
    > BROWSER_MAX_OBSERVATION_TEXT_BYTES
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Browser observation exceeds the serialized text limit',
      path: ['elements'],
    })
  }
})

const browserFailureResultSchema = z.object({
  error: browserErrorSchema,
  ok: z.literal(false),
}).strict()

export const browserOpenResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    state: browserStateSnapshotSchema,
    until: browserWaitOutcomeSchema.optional(),
  }).strict(),
  browserFailureResultSchema,
])

export const browserObserveResultSchema = z.discriminatedUnion('ok', [
  z.object({
    observation: browserObservationSchema,
    ok: z.literal(true),
  }).strict(),
  browserFailureResultSchema,
])

export const browserActResultSchema = z.discriminatedUnion('ok', [
  z.object({
    actionKind: browserActionKindSchema,
    observation: browserObservationSchema,
    ok: z.literal(true),
    state: browserStateSnapshotSchema,
  }).strict(),
  browserFailureResultSchema,
])

export const browserValidateActionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  browserFailureResultSchema,
])

export const browserAcquireControlResultSchema = z.discriminatedUnion('ok', [
  z.object({
    lease: browserControlLeaseSchema,
    ok: z.literal(true),
  }).strict(),
  browserFailureResultSchema,
])

export const browserReleaseControlResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  browserFailureResultSchema,
])

export const browserStateResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    state: browserStateSnapshotSchema,
  }).strict(),
  browserFailureResultSchema,
])

export const browserCloseResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  browserFailureResultSchema,
])

export type BrowserErrorCode = z.infer<typeof browserErrorCodeSchema>
export type BrowserFailureReason = z.infer<typeof browserFailureReasonSchema>
export type BrowserRecoveryAction = z.infer<typeof browserRecoveryActionSchema>
export type BrowserError = z.infer<typeof browserErrorSchema>
export type BrowserOpenTarget = z.infer<typeof browserOpenTargetSchema>
export type BrowserOpenParams = z.infer<typeof browserOpenParamsSchema>
export type BrowserObserveParams = z.infer<typeof browserObserveParamsSchema>
export type BrowserWaitCondition = z.infer<typeof browserWaitConditionSchema>
export type BrowserWaitSpec = z.infer<typeof browserWaitSpecSchema>
export type BrowserWaitOutcome = z.infer<typeof browserWaitOutcomeSchema>
export type BrowserAction = z.infer<typeof browserActionSchema>
export type BrowserCapabilityActParams = z.infer<typeof browserCapabilityActParamsSchema>
export type BrowserActParams = z.infer<typeof browserActParamsSchema>
export type BrowserValidateActionParams = z.infer<typeof browserValidateActionParamsSchema>
export type BrowserAcquireControlParams = z.infer<typeof browserAcquireControlParamsSchema>
export type BrowserReleaseControlParams = z.infer<typeof browserReleaseControlParamsSchema>
export type BrowserControlLease = z.infer<typeof browserControlLeaseSchema>
export type BrowserSessionParams = z.infer<typeof browserSessionParamsSchema>
export type BrowserStateSnapshot = z.infer<typeof browserStateSnapshotSchema>
export type BrowserObservedElement = z.infer<typeof browserObservedElementSchema>
export type BrowserObservationTruncation = z.infer<typeof browserObservationTruncationSchema>
export type BrowserScreenshotRef = z.infer<typeof browserScreenshotRefSchema>
export type BrowserObservation = z.infer<typeof browserObservationSchema>
export type BrowserOpenResult = z.infer<typeof browserOpenResultSchema>
export type BrowserObserveResult = z.infer<typeof browserObserveResultSchema>
export type BrowserActResult = z.infer<typeof browserActResultSchema>
export type BrowserValidateActionResult = z.infer<typeof browserValidateActionResultSchema>
export type BrowserAcquireControlResult = z.infer<typeof browserAcquireControlResultSchema>
export type BrowserReleaseControlResult = z.infer<typeof browserReleaseControlResultSchema>
export type BrowserStateResult = z.infer<typeof browserStateResultSchema>
export type BrowserCloseResult = z.infer<typeof browserCloseResultSchema>
