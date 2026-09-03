import type {
  BrowserAction,
  BrowserErrorCode,
  BrowserFailureReason,
  BrowserObservation,
  BrowserObservationTruncation,
  BrowserObservedElement,
  BrowserScreenshotRef,
} from '../../../shared/browserProtocol'
import { randomUUID } from 'node:crypto'
import { platform } from 'node:process'
import { z } from 'zod'
import {
  BROWSER_DEFAULT_OBSERVATION_ELEMENT_LIMIT,
  BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT,
  BROWSER_MAX_OBSERVATION_TEXT_BYTES,
  BROWSER_MAX_SCREENSHOT_BYTES,
  browserObservationSchema,
  getBrowserActionRef,
  getBrowserObservationTextByteLength,
} from '../../../shared/browserProtocol'
import {
  isBrowserValueRole,
  projectBrowserObservedValue,
  redactBrowserRuntimeUrl,
} from './browserPrivacy'

interface SemanticBrowserPage {
  capturePage: () => Promise<{
    getSize: () => { height: number, width: number }
    toPNG: () => Uint8Array
  }>
  debugger: {
    attach: (protocolVersion?: string) => void
    detach: () => void
    isAttached: () => boolean
    sendCommand: (
      method: string,
      commandParams?: Record<string, unknown>,
    ) => Promise<unknown>
  }
}

interface SemanticBrowserDriverOptions {
  createId?: () => string
  createScreenshotId?: () => string
  maxObservations?: number
  now?: () => number
  observationTtlMs?: number
  page: SemanticBrowserPage
}

export interface SemanticBrowserObservationInput {
  maxElements?: number
  pageId: string
  sessionId: string
  status: BrowserObservation['status']
  title: string
  url: string
}

export interface SemanticBrowserActionInput {
  action: BrowserAction
  documentRevision: number
  frameId?: string
  observationId: string
}

export interface SemanticBrowserTargetReference {
  documentRevision: number
  observationId: string
  ref: string
}

export interface SemanticBrowserScreenshotReference {
  documentRevision: number
  observationId: string
  screenshotId: string
}

export interface SemanticBrowserScreenshot {
  bytes: Uint8Array
  mimeType: 'image/png'
}

export interface SemanticBrowserTarget {
  readonly actions: readonly string[]
  readonly backendDOMNodeId: number
  readonly description?: string
  readonly frameId: string
  readonly inputMode?: 'human'
  readonly name: string
  readonly role: string
}

const cdpAxValueSchema = z.object({
  value: z.unknown().optional(),
}).passthrough()

const cdpAxPropertySchema = z.object({
  name: z.string(),
  value: cdpAxValueSchema,
}).passthrough()

const cdpAxNodeSchema = z.object({
  backendDOMNodeId: z.number().int().positive().optional(),
  description: cdpAxValueSchema.optional(),
  frameId: z.string().min(1).optional(),
  ignored: z.boolean(),
  name: cdpAxValueSchema.optional(),
  nodeId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  properties: z.array(cdpAxPropertySchema).optional(),
  role: cdpAxValueSchema.optional(),
  value: cdpAxValueSchema.optional(),
}).passthrough()

const cdpAxTreeSchema = z.object({
  nodes: z.array(cdpAxNodeSchema),
}).passthrough()

const cdpDocumentSchema = z.object({
  root: z.object({
    frameId: z.string().min(1).optional(),
  }).passthrough(),
}).passthrough()

const cdpFrameTreeNodeSchema = z.object({
  childFrames: z.array(z.unknown()).optional(),
  frame: z.object({
    id: z.string().min(1),
  }).passthrough(),
}).passthrough()

const cdpFrameTreeSchema = z.object({
  frameTree: z.unknown(),
}).passthrough()

const cdpRectangleSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
])

const cdpDomSnapshotSchema = z.object({
  documents: z.array(z.object({
    frameId: z.number().int().nonnegative(),
    layout: z.object({
      bounds: z.array(cdpRectangleSchema),
      nodeIndex: z.array(z.number().int().nonnegative()),
      text: z.array(z.number().int()).optional(),
    }),
    nodes: z.object({
      attributes: z.array(z.array(z.number().int().min(-1))).optional(),
      backendNodeId: z.array(z.number().int().nonnegative()),
      nodeName: z.array(z.number().int().nonnegative()).optional(),
    }),
  })),
  strings: z.array(z.string()),
})

const cdpLayoutMetricsSchema = z.object({
  cssVisualViewport: z.object({
    clientHeight: z.number().nonnegative(),
    clientWidth: z.number().nonnegative(),
    pageX: z.number(),
    pageY: z.number(),
  }),
})

const cdpResolveNodeSchema = z.object({
  object: z.object({
    objectId: z.string().min(1),
  }).passthrough(),
}).passthrough()

const cdpRuntimeResultSchema = z.object({
  exceptionDetails: z.unknown().optional(),
  result: z.object({
    value: z.unknown().optional(),
  }).passthrough(),
}).passthrough()

const cdpBoxModelSchema = z.object({
  model: z.object({
    border: z.array(z.number()).length(8),
    content: z.array(z.number()).length(8),
  }).passthrough(),
}).passthrough()

const browserTargetFieldMetadataSchema = z.object({
  ariaLabel: z.string().max(1_024),
  autocomplete: z.string().max(1_024),
  id: z.string().max(1_024),
  label: z.string().max(1_024),
  name: z.string().max(1_024),
  placeholder: z.string().max(1_024),
  type: z.string().max(1_024),
}).strict()

const browserTargetActionabilitySchema = z.object({
  connected: z.boolean(),
  covered: z.boolean(),
  disabled: z.boolean(),
  editable: z.boolean(),
  fieldMetadata: browserTargetFieldMetadataSchema,
  focusable: z.boolean(),
  readOnly: z.boolean(),
  selectable: z.boolean(),
  stable: z.boolean(),
  visible: z.boolean(),
}).strict()

type CdpAxNode = z.infer<typeof cdpAxNodeSchema>
type CdpAxProperty = z.infer<typeof cdpAxPropertySchema>
type BrowserObservationHeader = Omit<
  BrowserObservation,
  'elements' | 'screenshot' | 'truncated' | 'truncation'
>
type ProjectedElement = Omit<BrowserObservedElement, 'ref'>

interface ProjectedNode {
  backendDOMNodeId: number
  element: ProjectedElement
  focused: boolean
  inViewport: boolean
}

interface ViewportBounds {
  height: number
  width: number
  x: number
  y: number
}

interface StoredObservation {
  documentRevision: number
  expiresAt: number
  requiresHumanInput: boolean
  screenshot?: {
    bytes: Uint8Array
    ref: BrowserScreenshotRef
  }
  targets: Map<string, SemanticBrowserTarget>
}

type DomFieldMetadata = ReadonlyMap<string, string>

type SemanticBrowserDriverErrorCode = Extract<
  BrowserErrorCode,
  | 'BROWSER_HUMAN_INPUT_REQUIRED'
  | 'BROWSER_PAGE_FAILED'
  | 'BROWSER_TARGET_STALE'
>

const DEFAULT_MAX_OBSERVATIONS = 8
const DEFAULT_OBSERVATION_TTL_MS = 30_000
const MAX_OBSERVED_FRAMES = 32
const BROWSER_ACTION_OBJECT_GROUP = 'lexora-browser-action'
const BROWSER_TARGET_ACTIONABILITY_FUNCTION = `async function (checkClickability) {
  const element = this
  const emptyFieldMetadata = { ariaLabel: '', autocomplete: '', id: '', label: '', name: '', placeholder: '', type: '' }
  if (!(element instanceof Element) || !element.isConnected) {
    return { connected: false, covered: false, disabled: true, editable: false, fieldMetadata: emptyFieldMetadata, focusable: false, readOnly: true, selectable: false, stable: false, visible: false }
  }
  const readFieldText = value => typeof value === 'string' ? value.slice(0, 1024) : ''
  const nativeLabels = 'labels' in element && element.labels
    ? Array.from(element.labels).slice(0, 16).map(label => label.textContent || '').join(' ')
    : ''
  const labelledBy = readFieldText(element.getAttribute('aria-labelledby')).split(/\\s+/).filter(Boolean).slice(0, 16)
    .map(id => element.ownerDocument.getElementById(id)?.textContent || '').join(' ')
  const fieldMetadata = {
    ariaLabel: readFieldText(element.getAttribute('aria-label')),
    autocomplete: readFieldText(element.getAttribute('autocomplete')),
    id: readFieldText(element.id),
    label: readFieldText(nativeLabels + ' ' + labelledBy),
    name: readFieldText(element.getAttribute('name')),
    placeholder: readFieldText(element.getAttribute('placeholder')),
    type: readFieldText(element instanceof HTMLInputElement ? element.type : element.getAttribute('type')),
  }
  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle(element)
  const before = element.getBoundingClientRect()
  let after = before
  if (checkClickability && view) {
    await new Promise(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)))
    after = element.getBoundingClientRect()
  }
  const centerX = after.left + after.width / 2
  const centerY = after.top + after.height / 2
  const hit = checkClickability ? element.ownerDocument.elementFromPoint(centerX, centerY) : element
  const covered = checkClickability && (!hit || (hit !== element && !element.contains(hit)))
  const stable = !checkClickability || (
    Math.abs(before.left - after.left) <= 0.5
    && Math.abs(before.top - after.top) <= 0.5
    && Math.abs(before.width - after.width) <= 0.5
    && Math.abs(before.height - after.height) <= 0.5
  )
  const disabled = ('disabled' in element && Boolean(element.disabled)) || element.getAttribute('aria-disabled') === 'true'
  const readOnly = ('readOnly' in element && Boolean(element.readOnly)) || element.getAttribute('aria-readonly') === 'true'
  const editable = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable
  const focusable = element.tabIndex >= 0 || editable || element instanceof HTMLButtonElement || element instanceof HTMLSelectElement || (element instanceof HTMLAnchorElement && Boolean(element.href))
  return {
    connected: true,
    covered,
    disabled,
    editable,
    fieldMetadata,
    focusable,
    readOnly,
    selectable: element instanceof HTMLSelectElement,
    stable,
    visible: Boolean(style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && after.width > 0 && after.height > 0),
  }
}`
const BROWSER_SELECT_FUNCTION = `function (values) {
  if (!(this instanceof HTMLSelectElement) || !this.isConnected || this.disabled)
    return false
  const requested = new Set(values)
  const available = new Set(Array.from(this.options, option => option.value))
  if (values.some(value => !available.has(value)) || (!this.multiple && values.length !== 1))
    return false
  for (const option of this.options)
    option.selected = requested.has(option.value)
  this.dispatchEvent(new Event('input', { bubbles: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}`
const BROWSER_SCROLL_TARGET_FUNCTION = `function (direction, amount) {
  if (!(this instanceof Element) || !this.isConnected)
    return false
  let container = this.parentElement
  while (container) {
    const style = container.ownerDocument.defaultView?.getComputedStyle(container)
    if (style && /(auto|scroll)/.test(style.overflowY) && container.scrollHeight > container.clientHeight)
      break
    container = container.parentElement
  }
  const target = container || this.ownerDocument.scrollingElement
  if (!target)
    return false
  const viewport = container ? container.clientHeight : this.ownerDocument.defaultView?.innerHeight || 0
  target.scrollBy({ behavior: 'instant', top: (direction === 'down' ? 1 : -1) * viewport * (amount === 'page' ? 1 : 0.5) })
  return true
}`

const SKIPPED_ROLES = new Set([
  'document',
  'inline-text-box',
  'none',
  'presentation',
])

const CLICK_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menu-item',
  'menu-item-checkbox',
  'menu-item-radio',
  'option',
  'radio',
  'switch',
  'tab',
  'tree-item',
])

const INTERACTIVE_ROLES = new Set([
  ...CLICK_ROLES,
  'combo-box',
  'list-box',
  'search-box',
  'slider',
  'spin-button',
  'textbox',
])

const STATUS_ROLES = new Set([
  'alert',
  'alert-dialog',
  'log',
  'meter',
  'progress-bar',
  'status',
  'timer',
])

const FIELD_METADATA_ATTRIBUTES = new Set([
  'aria-label',
  'autocomplete',
  'id',
  'name',
  'placeholder',
  'type',
])

const INTERNAL_VALUE_DESCENDANT_ROLES = new Set([
  'search-box',
  'spin-button',
  'textbox',
])

export class SemanticBrowserDriverError extends Error {
  readonly code: SemanticBrowserDriverErrorCode
  readonly reason: BrowserFailureReason | null

  constructor(
    code: SemanticBrowserDriverErrorCode = 'BROWSER_PAGE_FAILED',
    reason: BrowserFailureReason | null = null,
  ) {
    super(code === 'BROWSER_TARGET_STALE'
      ? 'Browser target reference is stale'
      : code === 'BROWSER_HUMAN_INPUT_REQUIRED'
        ? 'Browser input requires human control'
        : 'Browser semantic observation failed')
    this.code = code
    this.reason = reason
    this.name = 'SemanticBrowserDriverError'
  }
}

export class SemanticBrowserDriver {
  readonly #createId: () => string
  readonly #createScreenshotId: () => string
  readonly #maxObservations: number
  readonly #now: () => number
  readonly #observations = new Map<string, StoredObservation>()
  readonly #observationTtlMs: number
  readonly #page: SemanticBrowserPage
  #documentRevision = 0
  #disposed = false
  #ownsDebugger = false

  constructor(options: SemanticBrowserDriverOptions) {
    this.#createId = options.createId ?? randomUUID
    this.#createScreenshotId = options.createScreenshotId ?? randomUUID
    this.#maxObservations = options.maxObservations ?? DEFAULT_MAX_OBSERVATIONS
    this.#now = options.now ?? Date.now
    this.#observationTtlMs = options.observationTtlMs ?? DEFAULT_OBSERVATION_TTL_MS
    this.#page = options.page
  }

  async observe(input: SemanticBrowserObservationInput): Promise<BrowserObservation> {
    try {
      this.#assertActive()
      this.#ensureDebugger()
      const [
        frameTreeResult,
        documentResult,
        domSnapshotResult,
        layoutMetricsResult,
      ] = await Promise.all([
        this.#page.debugger.sendCommand('Page.getFrameTree'),
        this.#page.debugger.sendCommand('DOM.getDocument', {
          depth: 0,
          pierce: true,
        }),
        this.#page.debugger.sendCommand('DOMSnapshot.captureSnapshot', {
          computedStyles: [],
        }),
        this.#page.debugger.sendCommand('Page.getLayoutMetrics'),
      ])
      const document = cdpDocumentSchema.parse(documentResult)
      const domSnapshot = cdpDomSnapshotSchema.parse(domSnapshotResult)
      const layoutMetrics = cdpLayoutMetricsSchema.parse(layoutMetricsResult)
      const frameTree = collectFrameIds(frameTreeResult)
      const mainFrameId = document.root.frameId ?? frameTree.frameIds[0]
      if (!mainFrameId)
        throw new SemanticBrowserDriverError()
      const observedFrameIds = [
        mainFrameId,
        ...frameTree.frameIds.filter(frameId => frameId !== mainFrameId),
      ].slice(0, MAX_OBSERVED_FRAMES)
      const accessibilityResults = await Promise.allSettled(observedFrameIds.map(async (frameId) => {
        const result = await this.#page.debugger.sendCommand(
          'Accessibility.getFullAXTree',
          { frameId },
        )
        return scopeAccessibilityNodes(
          cdpAxTreeSchema.parse(result).nodes,
          frameId,
        )
      }))
      const mainFrameAccessibility = accessibilityResults[0]
      if (!mainFrameAccessibility || mainFrameAccessibility.status === 'rejected')
        throw new SemanticBrowserDriverError()
      const unavailableFrameCount = accessibilityResults.filter(
        result => result.status === 'rejected',
      ).length
      const accessibilityNodes = deduplicateAccessibilityNodes(
        accessibilityResults.flatMap(result => (
          result.status === 'fulfilled' ? result.value : []
        )),
      )
      const { cssVisualViewport } = layoutMetrics
      const viewportNodeIds = collectViewportNodeIds(
        domSnapshot,
        mainFrameId,
        {
          height: cssVisualViewport.clientHeight,
          width: cssVisualViewport.clientWidth,
          x: cssVisualViewport.pageX,
          y: cssVisualViewport.pageY,
        },
      )
      const fieldMetadata = collectDomFieldMetadata(domSnapshot)

      const observationHeader: BrowserObservationHeader = {
        documentRevision: this.#documentRevision,
        observationId: this.#createId(),
        pageId: input.pageId,
        sessionId: input.sessionId,
        status: input.status,
        title: input.title.slice(0, 512),
        url: redactBrowserRuntimeUrl(input.url),
      }
      const maxElements = normalizeElementLimit(input.maxElements)
      const projected = projectElements(
        accessibilityNodes,
        mainFrameId,
        maxElements,
        observationHeader,
        viewportNodeIds,
        fieldMetadata,
      )
      const truncationReasons = new Set<BrowserObservationTruncation['reasons'][number]>()
      if (
        frameTree.truncated
        || frameTree.frameIds.some(frameId => !observedFrameIds.includes(frameId))
      ) {
        truncationReasons.add('frame-limit')
      }
      if (unavailableFrameCount > 0)
        truncationReasons.add('frame-unavailable')
      if (projected.truncationReason)
        truncationReasons.add(projected.truncationReason)

      const visualContent = hasVisualContent(domSnapshot, accessibilityNodes)
      const screenshotAllowed = !projected.containsSensitiveInputs
        && !containsSensitiveFieldMetadata(fieldMetadata)
      let screenshotReasons = screenshotAllowed
        ? getScreenshotFallbackReasons(
            truncationReasons.size > 0,
            projected.elements.length === 0,
            visualContent,
          )
        : []
      let screenshot = screenshotReasons.length > 0
        ? await this.#captureScreenshot()
        : undefined
      let observation: BrowserObservation

      while (true) {
        const truncation = createTruncation(
          truncationReasons,
          maxElements,
        )
        const screenshotRef = screenshot
          ? createScreenshotRef(screenshot, screenshotReasons)
          : undefined
        const candidate = {
          ...observationHeader,
          elements: projected.elements,
          ...(screenshotRef ? { screenshot: screenshotRef } : {}),
          truncated: Boolean(truncation),
          ...(truncation ? { truncation } : {}),
        }
        if (
          getBrowserObservationTextByteLength(candidate)
          <= BROWSER_MAX_OBSERVATION_TEXT_BYTES
        ) {
          observation = browserObservationSchema.parse(candidate)
          break
        }

        truncationReasons.add('text-limit')
        if (screenshotAllowed) {
          screenshotReasons = getScreenshotFallbackReasons(
            true,
            projected.elements.length === 0,
            visualContent,
          )
          screenshot ??= await this.#captureScreenshot()
        }
        const removed = projected.elements.pop()
        if (!removed)
          throw new SemanticBrowserDriverError()
        projected.targets.delete(removed.ref)
      }

      this.#storeObservation(
        observation.observationId,
        projected.targets,
        screenshot && observation.screenshot
          ? {
              bytes: screenshot.bytes,
              ref: observation.screenshot,
            }
          : undefined,
      )
      return observation
    }
    catch (error) {
      if (error instanceof SemanticBrowserDriverError)
        throw error
      throw new SemanticBrowserDriverError()
    }
  }

  async executeAction(input: SemanticBrowserActionInput): Promise<void> {
    try {
      const target = this.validateAction(input)
      this.#ensureDebugger()
      if (!target) {
        if (input.action.kind === 'press') {
          await this.#press(input.action.key)
          return
        }
        if (input.action.kind === 'scroll') {
          await this.#scrollPage(input.action.direction, input.action.amount)
          return
        }
        throw new SemanticBrowserDriverError()
      }

      await this.#withLiveTarget(target, input.action, async (objectId) => {
        switch (input.action.kind) {
          case 'click':
            await this.#click(target)
            return
          case 'fill':
            await this.#focus(target)
            await this.#selectAllAndDelete()
            if (input.action.text)
              await this.#insertText(input.action.text)
            return
          case 'type':
            await this.#focus(target)
            await this.#insertText(input.action.text)
            return
          case 'press':
            await this.#focus(target)
            await this.#press(input.action.key)
            return
          case 'select':
            await this.#select(objectId, input.action.values)
            return
          case 'scroll':
            await this.#scrollTarget(
              objectId,
              input.action.direction,
              input.action.amount,
            )
            return
          default:
            throw new SemanticBrowserDriverError()
        }
      })
    }
    catch (error) {
      if (error instanceof SemanticBrowserDriverError)
        throw error
      throw new SemanticBrowserDriverError()
    }
  }

  validateAction(input: SemanticBrowserActionInput): SemanticBrowserTarget | null {
    this.#assertActive()
    const reference = {
      documentRevision: input.documentRevision,
      observationId: input.observationId,
    }
    const ref = getBrowserActionRef(input.action)
    if (!ref) {
      this.assertObservation(reference)
      if (input.frameId)
        throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
      if (
        input.action.kind === 'press'
        && this.#observations.get(input.observationId)?.requiresHumanInput
      ) {
        throw new SemanticBrowserDriverError('BROWSER_HUMAN_INPUT_REQUIRED')
      }
      return null
    }

    const target = this.resolveTarget({ ...reference, ref })
    if (target.frameId !== input.frameId)
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
    if (
      target.inputMode === 'human'
      && input.action.kind !== 'scroll'
      && input.action.kind !== 'wait'
    ) {
      throw new SemanticBrowserDriverError('BROWSER_HUMAN_INPUT_REQUIRED')
    }
    if (!supportsTargetAction(target, input.action))
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
    return target
  }

  assertObservation(reference: {
    documentRevision: number
    observationId: string
  }): void {
    this.#assertActive()
    this.#pruneObservations(this.#now())
    const observation = this.#observations.get(reference.observationId)
    if (
      reference.documentRevision !== this.#documentRevision
      || observation?.documentRevision !== reference.documentRevision
    ) {
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
    }
  }

  resolveTarget(reference: SemanticBrowserTargetReference): SemanticBrowserTarget {
    this.assertObservation(reference)
    const observation = this.#observations.get(reference.observationId)
    const target = observation?.targets.get(reference.ref)
    if (
      !target
    ) {
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
    }
    return { ...target, actions: [...target.actions] }
  }

  resolveScreenshot(
    reference: SemanticBrowserScreenshotReference,
  ): SemanticBrowserScreenshot {
    this.#assertActive()
    this.#pruneObservations(this.#now())
    const observation = this.#observations.get(reference.observationId)
    const screenshot = observation?.screenshot
    if (
      reference.documentRevision !== this.#documentRevision
      || observation?.documentRevision !== reference.documentRevision
      || screenshot?.ref.screenshotId !== reference.screenshotId
    ) {
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
    }
    return {
      bytes: screenshot.bytes.slice(),
      mimeType: 'image/png',
    }
  }

  invalidateDocument(): void {
    this.#assertActive()
    if (this.#documentRevision >= Number.MAX_SAFE_INTEGER)
      throw new SemanticBrowserDriverError()
    this.#documentRevision += 1
    this.#observations.clear()
  }

  async isTextVisible(text: string): Promise<boolean> {
    const snapshot = await this.#captureDomSnapshot()
    const needle = normalizeWaitText(text)
    if (!needle)
      return false
    for (const document of snapshot.documents) {
      const layoutText = document.layout.text
      if (!layoutText)
        continue
      for (const index of layoutText) {
        const value = snapshot.strings[index]
        if (value && normalizeWaitText(value).includes(needle))
          return true
      }
    }
    return false
  }

  async isTargetVisible(reference: SemanticBrowserTargetReference): Promise<boolean> {
    const target = this.resolveTarget(reference)
    this.#ensureDebugger()
    let objectId: string
    try {
      const resolved = cdpResolveNodeSchema.parse(
        await this.#page.debugger.sendCommand('DOM.resolveNode', {
          backendNodeId: target.backendDOMNodeId,
          objectGroup: BROWSER_ACTION_OBJECT_GROUP,
        }),
      )
      objectId = resolved.object.objectId
    }
    catch {
      return false
    }
    try {
      const { model } = cdpBoxModelSchema.parse(
        await this.#page.debugger.sendCommand('DOM.getBoxModel', {
          backendNodeId: target.backendDOMNodeId,
        }),
      )
      const { height, width } = quadSize(model.border)
      return width > 0 && height > 0
    }
    catch {
      return false
    }
    finally {
      await this.#page.debugger.sendCommand(
        'Runtime.releaseObject',
        { objectId },
      ).catch(() => {})
    }
  }

  async fingerprintDocument(): Promise<string> {
    const snapshot = await this.#captureDomSnapshot()
    let nodeCount = 0
    let layoutCount = 0
    let textLength = 0
    for (const document of snapshot.documents) {
      nodeCount += document.nodes.backendNodeId.length
      layoutCount += document.layout.nodeIndex.length
      for (const index of document.layout.text ?? [])
        textLength += snapshot.strings[index]?.length ?? 0
    }
    return `${nodeCount}:${layoutCount}:${textLength}`
  }

  async #captureDomSnapshot(): Promise<z.infer<typeof cdpDomSnapshotSchema>> {
    this.#assertActive()
    this.#ensureDebugger()
    try {
      return cdpDomSnapshotSchema.parse(
        await this.#page.debugger.sendCommand('DOMSnapshot.captureSnapshot', {
          computedStyles: [],
        }),
      )
    }
    catch {
      throw new SemanticBrowserDriverError()
    }
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#observations.clear()
    if (this.#ownsDebugger && this.#page.debugger.isAttached())
      this.#page.debugger.detach()
    this.#ownsDebugger = false
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new SemanticBrowserDriverError()
  }

  async #withLiveTarget(
    target: SemanticBrowserTarget,
    action: BrowserAction,
    operation: (objectId: string) => Promise<void>,
  ): Promise<void> {
    let objectId: string
    try {
      const resolved = cdpResolveNodeSchema.parse(
        await this.#page.debugger.sendCommand('DOM.resolveNode', {
          backendNodeId: target.backendDOMNodeId,
          objectGroup: BROWSER_ACTION_OBJECT_GROUP,
        }),
      )
      objectId = resolved.object.objectId
    }
    catch (error) {
      if (error instanceof SemanticBrowserDriverError)
        throw error
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
    }

    try {
      if (action.kind === 'click') {
        await this.#page.debugger.sendCommand('DOM.scrollIntoViewIfNeeded', {
          backendNodeId: target.backendDOMNodeId,
        })
      }
      let actionability: z.infer<typeof browserTargetActionabilitySchema>
      try {
        actionability = await this.#readActionability(objectId, action.kind === 'click')
      }
      catch {
        throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
      }
      const actionabilityFailure = getLiveTargetFailureReason(action, actionability)
      if (actionabilityFailure) {
        throw new SemanticBrowserDriverError(
          'BROWSER_TARGET_STALE',
          actionabilityFailure,
        )
      }
      if (requiresHumanInputAtActionTime(target, action, actionability))
        throw new SemanticBrowserDriverError('BROWSER_HUMAN_INPUT_REQUIRED')
      await operation(objectId)
    }
    finally {
      await this.#page.debugger.sendCommand(
        'Runtime.releaseObject',
        { objectId },
      ).catch(() => {})
    }
  }

  async #readActionability(objectId: string, checkClickability: boolean) {
    const response = cdpRuntimeResultSchema.parse(
      await this.#page.debugger.sendCommand('Runtime.callFunctionOn', {
        arguments: [{ value: checkClickability }],
        awaitPromise: true,
        functionDeclaration: BROWSER_TARGET_ACTIONABILITY_FUNCTION,
        objectId,
        returnByValue: true,
        silent: true,
      }),
    )
    if (response.exceptionDetails)
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
    return browserTargetActionabilitySchema.parse(response.result.value)
  }

  async #click(target: SemanticBrowserTarget): Promise<void> {
    const { model } = cdpBoxModelSchema.parse(
      await this.#page.debugger.sendCommand('DOM.getBoxModel', {
        backendNodeId: target.backendDOMNodeId,
      }),
    )
    const { x, y } = quadCenter(model.content)
    await this.#page.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    })
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await this.#page.debugger.sendCommand('Input.dispatchMouseEvent', {
        button: 'left',
        clickCount: 1,
        type,
        x,
        y,
      })
    }
  }

  async #focus(target: SemanticBrowserTarget): Promise<void> {
    await this.#page.debugger.sendCommand('DOM.focus', {
      backendNodeId: target.backendDOMNodeId,
    })
  }

  async #insertText(text: string): Promise<void> {
    await this.#page.debugger.sendCommand('Input.insertText', { text })
  }

  async #selectAllAndDelete(): Promise<void> {
    const modifier = platform === 'darwin' ? 4 : 2
    await this.#dispatchKey({ code: 'KeyA', key: 'a', modifiers: modifier })
    await this.#dispatchKey({ code: 'Backspace', key: 'Backspace' })
  }

  async #press(key: Extract<BrowserAction, { kind: 'press' }>['key']): Promise<void> {
    const definition = browserKeyDefinition(key)
    await this.#dispatchKey(definition)
  }

  async #dispatchKey(input: {
    code: string
    key: string
    modifiers?: number
    text?: string
    windowsVirtualKeyCode?: number
  }): Promise<void> {
    await this.#page.debugger.sendCommand('Input.dispatchKeyEvent', {
      ...input,
      type: input.text ? 'keyDown' : 'rawKeyDown',
    })
    await this.#page.debugger.sendCommand('Input.dispatchKeyEvent', {
      code: input.code,
      key: input.key,
      modifiers: input.modifiers,
      type: 'keyUp',
      windowsVirtualKeyCode: input.windowsVirtualKeyCode,
    })
  }

  async #select(objectId: string, values: string[]): Promise<void> {
    const response = cdpRuntimeResultSchema.parse(
      await this.#page.debugger.sendCommand('Runtime.callFunctionOn', {
        arguments: [{ value: values }],
        functionDeclaration: BROWSER_SELECT_FUNCTION,
        objectId,
        returnByValue: true,
        silent: true,
      }),
    )
    if (response.exceptionDetails || response.result.value !== true)
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
  }

  async #scrollTarget(
    objectId: string,
    direction: Extract<BrowserAction, { kind: 'scroll' }>['direction'],
    amount: Extract<BrowserAction, { kind: 'scroll' }>['amount'],
  ): Promise<void> {
    const response = cdpRuntimeResultSchema.parse(
      await this.#page.debugger.sendCommand('Runtime.callFunctionOn', {
        arguments: [{ value: direction }, { value: amount }],
        functionDeclaration: BROWSER_SCROLL_TARGET_FUNCTION,
        objectId,
        returnByValue: true,
        silent: true,
      }),
    )
    if (response.exceptionDetails || response.result.value !== true)
      throw new SemanticBrowserDriverError('BROWSER_TARGET_STALE')
  }

  async #scrollPage(
    direction: Extract<BrowserAction, { kind: 'scroll' }>['direction'],
    amount: Extract<BrowserAction, { kind: 'scroll' }>['amount'],
  ): Promise<void> {
    const { cssVisualViewport } = cdpLayoutMetricsSchema.parse(
      await this.#page.debugger.sendCommand('Page.getLayoutMetrics'),
    )
    await this.#page.debugger.sendCommand('Input.dispatchMouseEvent', {
      deltaX: 0,
      deltaY: (direction === 'down' ? 1 : -1)
        * cssVisualViewport.clientHeight
        * (amount === 'page' ? 1 : 0.5),
      type: 'mouseWheel',
      x: cssVisualViewport.clientWidth / 2,
      y: cssVisualViewport.clientHeight / 2,
    })
  }

  #ensureDebugger(): void {
    if (this.#page.debugger.isAttached())
      return
    this.#page.debugger.attach('1.3')
    this.#ownsDebugger = true
  }

  async #captureScreenshot(): Promise<{
    bytes: Uint8Array
    height: number
    screenshotId: string
    width: number
  }> {
    const image = await this.#page.capturePage()
    const { height, width } = image.getSize()
    const bytes = Uint8Array.from(image.toPNG())
    if (
      !Number.isInteger(height)
      || !Number.isInteger(width)
      || height < 1
      || height > 32_768
      || width < 1
      || width > 32_768
      || bytes.byteLength < 8
      || bytes.byteLength > BROWSER_MAX_SCREENSHOT_BYTES
      || !hasPngSignature(bytes)
    ) {
      throw new SemanticBrowserDriverError()
    }
    return {
      bytes,
      height,
      screenshotId: this.#createScreenshotId(),
      width,
    }
  }

  #pruneObservations(now: number): void {
    for (const [observationId, observation] of this.#observations) {
      if (
        observation.expiresAt <= now
        || observation.documentRevision !== this.#documentRevision
      ) {
        this.#observations.delete(observationId)
      }
    }
  }

  #storeObservation(
    observationId: string,
    targets: Map<string, SemanticBrowserTarget>,
    screenshot?: StoredObservation['screenshot'],
  ): void {
    const now = this.#now()
    this.#pruneObservations(now)
    this.#observations.delete(observationId)
    this.#observations.set(observationId, {
      documentRevision: this.#documentRevision,
      expiresAt: now + this.#observationTtlMs,
      requiresHumanInput: [...targets.values()].some(
        target => target.inputMode === 'human',
      ),
      ...(screenshot ? { screenshot } : {}),
      targets,
    })
    while (this.#observations.size > this.#maxObservations) {
      const oldestObservationId = this.#observations.keys().next().value
      if (oldestObservationId === undefined)
        break
      this.#observations.delete(oldestObservationId)
    }
  }
}

function supportsTargetAction(
  target: SemanticBrowserTarget,
  action: BrowserAction,
): boolean {
  switch (action.kind) {
    case 'click':
    case 'fill':
    case 'type':
    case 'select':
      return target.actions.includes(action.kind)
    case 'press':
      return target.actions.length > 0
    case 'scroll':
    case 'wait':
      return true
    default:
      return false
  }
}

function requiresHumanInputAtActionTime(
  target: SemanticBrowserTarget,
  action: BrowserAction,
  actionability: z.infer<typeof browserTargetActionabilitySchema>,
): boolean {
  if (action.kind === 'scroll')
    return false
  const { fieldMetadata } = actionability
  const attributes = new Map([
    ['aria-label', fieldMetadata.ariaLabel],
    ['autocomplete', fieldMetadata.autocomplete],
    ['id', fieldMetadata.id],
    ['label', fieldMetadata.label],
    ['name', fieldMetadata.name],
    ['placeholder', fieldMetadata.placeholder],
    ['type', fieldMetadata.type],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])))
  return projectBrowserObservedValue({
    attributes,
    description: target.description ?? '',
    hasValue: false,
    name: target.name,
    protectedField: false,
    role: target.role,
    value: undefined,
  }).inputMode === 'human'
}

function getLiveTargetFailureReason(
  action: BrowserAction,
  target: z.infer<typeof browserTargetActionabilitySchema>,
): BrowserFailureReason | null {
  if (!target.connected)
    return 'TARGET_DETACHED'
  if (action.kind !== 'scroll' && !target.visible)
    return 'TARGET_NOT_VISIBLE'
  if (action.kind !== 'scroll' && target.disabled)
    return 'TARGET_DISABLED'
  switch (action.kind) {
    case 'click':
      if (!target.stable)
        return 'TARGET_UNSTABLE'
      return target.covered ? 'TARGET_COVERED' : null
    case 'fill':
    case 'type':
      if (target.readOnly)
        return 'TARGET_READ_ONLY'
      return target.editable ? null : 'TARGET_NOT_EDITABLE'
    case 'press':
      return target.focusable ? null : 'TARGET_NOT_FOCUSABLE'
    case 'select':
      return target.selectable ? null : 'TARGET_NOT_SELECTABLE'
    case 'scroll':
      return null
    default:
      return 'INVALID_TARGET'
  }
}

function quadCenter(quad: number[]): { x: number, y: number } {
  return {
    x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
    y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
  }
}

function quadSize(quad: number[]): { height: number, width: number } {
  const xs = [quad[0], quad[2], quad[4], quad[6]]
  const ys = [quad[1], quad[3], quad[5], quad[7]]
  return {
    height: Math.max(...ys) - Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
  }
}

function normalizeWaitText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function browserKeyDefinition(
  key: Extract<BrowserAction, { kind: 'press' }>['key'],
): {
  code: string
  key: string
  text?: string
  windowsVirtualKeyCode: number
} {
  const definitions = {
    ArrowDown: { code: 'ArrowDown', key: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowLeft: { code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37 },
    ArrowRight: { code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39 },
    ArrowUp: { code: 'ArrowUp', key: 'ArrowUp', windowsVirtualKeyCode: 38 },
    Backspace: { code: 'Backspace', key: 'Backspace', windowsVirtualKeyCode: 8 },
    Delete: { code: 'Delete', key: 'Delete', windowsVirtualKeyCode: 46 },
    End: { code: 'End', key: 'End', windowsVirtualKeyCode: 35 },
    Enter: { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 },
    Escape: { code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 },
    Home: { code: 'Home', key: 'Home', windowsVirtualKeyCode: 36 },
    PageDown: { code: 'PageDown', key: 'PageDown', windowsVirtualKeyCode: 34 },
    PageUp: { code: 'PageUp', key: 'PageUp', windowsVirtualKeyCode: 33 },
    Space: { code: 'Space', key: ' ', text: ' ', windowsVirtualKeyCode: 32 },
    Tab: { code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9 },
  } satisfies Record<typeof key, {
    code: string
    key: string
    text?: string
    windowsVirtualKeyCode: number
  }>
  return definitions[key]
}

function collectFrameIds(input: unknown): {
  frameIds: string[]
  truncated: boolean
} {
  const response = cdpFrameTreeSchema.parse(input)
  const frameIds: string[] = []
  const seen = new Set<string>()
  const pending: unknown[] = [response.frameTree]

  while (pending.length > 0 && frameIds.length <= MAX_OBSERVED_FRAMES) {
    const frameTree = cdpFrameTreeNodeSchema.parse(pending.shift())
    if (!seen.has(frameTree.frame.id)) {
      seen.add(frameTree.frame.id)
      frameIds.push(frameTree.frame.id)
    }
    if (frameTree.childFrames)
      pending.unshift(...frameTree.childFrames)
  }

  return {
    frameIds: frameIds.slice(0, MAX_OBSERVED_FRAMES),
    truncated: frameIds.length > MAX_OBSERVED_FRAMES || pending.length > 0,
  }
}

function scopeAccessibilityNodes(
  nodes: CdpAxNode[],
  requestedFrameId: string,
): CdpAxNode[] {
  const nodesById = new Map(nodes.map(node => [node.nodeId, node] as const))
  const resolvedFrameIds = new Map<string, string>()
  const resolving = new Set<string>()
  const resolveFrameId = (node: CdpAxNode): string => {
    const cached = resolvedFrameIds.get(node.nodeId)
    if (cached)
      return cached
    if (node.frameId) {
      resolvedFrameIds.set(node.nodeId, node.frameId)
      return node.frameId
    }
    if (resolving.has(node.nodeId))
      return requestedFrameId

    resolving.add(node.nodeId)
    const parent = node.parentId ? nodesById.get(node.parentId) : undefined
    const frameId = parent ? resolveFrameId(parent) : requestedFrameId
    resolving.delete(node.nodeId)
    resolvedFrameIds.set(node.nodeId, frameId)
    return frameId
  }

  return nodes.map(node => ({
    ...node,
    frameId: resolveFrameId(node),
  }))
}

function deduplicateAccessibilityNodes(nodes: CdpAxNode[]): CdpAxNode[] {
  const seen = new Set<string>()
  return nodes.filter((node) => {
    const identity = node.backendDOMNodeId
      ? `backend:${node.frameId ?? ''}:${node.backendDOMNodeId}`
      : `ax:${node.frameId ?? ''}:${node.nodeId}`
    if (seen.has(identity))
      return false
    seen.add(identity)
    return true
  })
}

function createTruncation(
  reasons: ReadonlySet<BrowserObservationTruncation['reasons'][number]>,
  maxElements: number,
): BrowserObservationTruncation | undefined {
  const orderedReasons = [
    'element-limit',
    'frame-limit',
    'frame-unavailable',
    'text-limit',
  ].filter((reason): reason is BrowserObservationTruncation['reasons'][number] => (
    reasons.has(reason as BrowserObservationTruncation['reasons'][number])
  ))
  if (orderedReasons.length === 0)
    return undefined
  if (
    orderedReasons.length === 1
    && orderedReasons[0] === 'element-limit'
    && maxElements < BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT
  ) {
    return {
      reasons: orderedReasons,
      suggestedMaxElements: Math.min(
        BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT,
        Math.max(maxElements + 1, maxElements * 2),
      ),
    }
  }
  return { reasons: orderedReasons }
}

function getScreenshotFallbackReasons(
  truncated: boolean,
  empty: boolean,
  visualContent: boolean,
): BrowserScreenshotRef['reasons'] {
  const reasons: BrowserScreenshotRef['reasons'] = []
  if (empty)
    reasons.push('semantic-content-empty')
  if (truncated)
    reasons.push('semantic-content-truncated')
  if (visualContent)
    reasons.push('visual-content')
  return reasons
}

function createScreenshotRef(
  screenshot: {
    bytes: Uint8Array
    height: number
    screenshotId: string
    width: number
  },
  reasons: BrowserScreenshotRef['reasons'],
): BrowserScreenshotRef {
  return {
    byteLength: screenshot.bytes.byteLength,
    height: screenshot.height,
    mimeType: 'image/png',
    reasons: [...reasons],
    screenshotId: screenshot.screenshotId,
    width: screenshot.width,
  }
}

function hasVisualContent(
  snapshot: z.infer<typeof cdpDomSnapshotSchema>,
  nodes: CdpAxNode[],
): boolean {
  for (const document of snapshot.documents) {
    for (const nodeNameIndex of document.nodes.nodeName ?? []) {
      if (snapshot.strings[nodeNameIndex]?.toLowerCase() === 'canvas')
        return true
    }
  }

  const meaningfulNodes = nodes.filter(node => !node.ignored && node.backendDOMNodeId)
  const visualNodeCount = meaningfulNodes.filter((node) => {
    const role = normalizeRole(readAxString(node.role))
    return role === 'canvas'
      || role === 'figure'
      || role === 'graphics-document'
      || role === 'graphics-object'
      || role === 'image'
  }).length
  return visualNodeCount > 0 && visualNodeCount * 2 >= meaningfulNodes.length
}

function hasPngSignature(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  return signature.every((byte, index) => bytes[index] === byte)
}

function normalizeElementLimit(maxElements: number | undefined): number {
  if (maxElements === undefined)
    return BROWSER_DEFAULT_OBSERVATION_ELEMENT_LIMIT
  if (!Number.isInteger(maxElements) || maxElements < 1)
    throw new SemanticBrowserDriverError()
  return Math.min(maxElements, BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT)
}

function projectElements(
  nodes: CdpAxNode[],
  mainFrameId: string,
  maxElements: number,
  observationHeader: BrowserObservationHeader,
  viewportNodeIds: ReadonlySet<number>,
  fieldMetadata: ReadonlyMap<number, DomFieldMetadata>,
): {
  containsSensitiveInputs: boolean
  elements: BrowserObservedElement[]
  targets: Map<string, SemanticBrowserTarget>
  truncationReason: 'element-limit' | 'text-limit' | null
} {
  const elements: BrowserObservedElement[] = []
  const targets = new Map<string, SemanticBrowserTarget>()
  const valueControlDescendants = collectValueControlDescendants(
    nodes,
    fieldMetadata,
  )
  const projectedNodes = nodes
    .filter(node => !valueControlDescendants.has(getAxNodeKey(node)))
    .map(node => projectElement(
      node,
      mainFrameId,
      viewportNodeIds,
      fieldMetadata.get(node.backendDOMNodeId ?? 0),
    ))
    .filter((node): node is ProjectedNode => node !== null)
  const containsSensitiveInputs = projectedNodes.some(
    node => node.element.inputMode === 'human',
  )
  const focusedIndex = projectedNodes.findIndex(node => node.focused)
  const rankedNodes = projectedNodes
    .map((node, index) => ({
      index,
      node,
      priority: getRelevancePriority(node, index, focusedIndex),
    }))
    .sort((left, right) => (
      right.priority - left.priority
      || left.index - right.index
    ))

  for (const { node: projected } of rankedNodes) {
    if (elements.length === maxElements) {
      return {
        containsSensitiveInputs,
        elements,
        targets,
        truncationReason: 'element-limit',
      }
    }
    const ref = `e${elements.length + 1}`
    const element = { ...projected.element, ref }
    if (
      getBrowserObservationTextByteLength({
        ...observationHeader,
        elements: [...elements, element],
        truncated: false,
      }) > BROWSER_MAX_OBSERVATION_TEXT_BYTES
    ) {
      return {
        containsSensitiveInputs,
        elements,
        targets,
        truncationReason: 'text-limit',
      }
    }
    elements.push(element)
    targets.set(ref, {
      actions: [...projected.element.actions],
      backendDOMNodeId: projected.backendDOMNodeId,
      ...(projected.element.description ? { description: projected.element.description } : {}),
      frameId: projected.element.frameId,
      ...(projected.element.inputMode ? { inputMode: projected.element.inputMode } : {}),
      name: projected.element.name,
      role: projected.element.role,
    })
  }
  return {
    containsSensitiveInputs,
    elements,
    targets,
    truncationReason: null,
  }
}

function projectElement(
  node: CdpAxNode,
  mainFrameId: string,
  viewportNodeIds: ReadonlySet<number>,
  fieldMetadata: DomFieldMetadata | undefined,
): ProjectedNode | null {
  if (node.ignored || !node.backendDOMNodeId)
    return null
  const role = normalizeRole(readAxString(node.role))
  if (!role || SKIPPED_ROLES.has(role))
    return null

  const properties = new Map(
    (node.properties ?? []).map(property => [property.name, property] as const),
  )
  const name = normalizeText(readAxString(node.name), 1_024)
  const description = normalizeText(readAxString(node.description), 1_024)
  const states = projectStates(properties)
  const observedValue = projectBrowserObservedValue({
    attributes: fieldMetadata,
    description,
    hasValue: node.value !== undefined,
    name,
    protectedField: readAxBooleanish(properties.get('protected')),
    role,
    value: node.value?.value,
  })
  const actions = observedValue.inputMode === 'human'
    ? []
    : projectActions(role, properties)
  if (
    !name
    && !description
    && actions.length === 0
    && states.length === 0
    && observedValue.valueState === undefined
  ) {
    return null
  }

  const level = readPositiveInteger(properties.get('level'))
  return {
    backendDOMNodeId: node.backendDOMNodeId,
    element: {
      actions,
      ...(description ? { description } : {}),
      frameId: node.frameId ?? mainFrameId,
      ...(level ? { level } : {}),
      name,
      role,
      states,
      ...observedValue,
    },
    focused: readAxBoolean(properties.get('focused')),
    inViewport: viewportNodeIds.has(node.backendDOMNodeId),
  }
}

function collectValueControlDescendants(
  nodes: CdpAxNode[],
  fieldMetadata: ReadonlyMap<number, DomFieldMetadata>,
): Set<string> {
  const nodesById = new Map(nodes.map(node => [getAxNodeKey(node), node] as const))
  const valueControlIds = new Set(nodes.flatMap((node) => {
    const role = normalizeRole(readAxString(node.role))
    if (node.ignored || !isBrowserValueRole(role))
      return []
    if (INTERNAL_VALUE_DESCENDANT_ROLES.has(role))
      return [getAxNodeKey(node)]
    const properties = new Map(
      (node.properties ?? []).map(property => [property.name, property] as const),
    )
    const projection = projectBrowserObservedValue({
      attributes: fieldMetadata.get(node.backendDOMNodeId ?? 0),
      description: normalizeText(readAxString(node.description), 1_024),
      hasValue: node.value !== undefined,
      name: normalizeText(readAxString(node.name), 1_024),
      protectedField: readAxBooleanish(properties.get('protected')),
      role,
      value: node.value?.value,
    })
    return projection.inputMode === 'human' ? [getAxNodeKey(node)] : []
  }))
  const descendants = new Set<string>()

  for (const node of nodes) {
    const frameId = node.frameId ?? ''
    const visited = new Set([getAxNodeKey(node)])
    let parentId = node.parentId
    while (parentId) {
      const parentKey = `${frameId}\0${parentId}`
      if (visited.has(parentKey))
        break
      if (valueControlIds.has(parentKey)) {
        descendants.add(getAxNodeKey(node))
        break
      }
      visited.add(parentKey)
      parentId = nodesById.get(parentKey)?.parentId
    }
  }
  return descendants
}

function getAxNodeKey(node: CdpAxNode): string {
  return `${node.frameId ?? ''}\0${node.nodeId}`
}

function getRelevancePriority(
  node: ProjectedNode,
  index: number,
  focusedIndex: number,
): number {
  if (node.focused)
    return 5
  if (
    INTERACTIVE_ROLES.has(node.element.role)
    || node.element.actions.length > 0
  ) {
    return 4
  }
  if (
    STATUS_ROLES.has(node.element.role)
    || node.element.states.includes('busy')
    || node.element.states.includes('invalid')
  ) {
    return 3
  }
  if (node.element.role === 'heading')
    return 2
  if (focusedIndex >= 0 && Math.abs(index - focusedIndex) === 1)
    return 1
  if (node.inViewport)
    return 1
  return 0
}

function collectDomFieldMetadata(
  snapshot: z.infer<typeof cdpDomSnapshotSchema>,
): Map<number, DomFieldMetadata> {
  const metadata = new Map<number, DomFieldMetadata>()
  for (const document of snapshot.documents) {
    for (let nodeIndex = 0; nodeIndex < document.nodes.backendNodeId.length; nodeIndex += 1) {
      const backendNodeId = document.nodes.backendNodeId[nodeIndex]
      const attributeIndexes = document.nodes.attributes?.[nodeIndex]
      if (!backendNodeId || !attributeIndexes)
        continue
      const attributes = new Map<string, string>()
      for (let index = 0; index + 1 < attributeIndexes.length; index += 2) {
        const name = snapshot.strings[attributeIndexes[index]]?.toLowerCase()
        const value = snapshot.strings[attributeIndexes[index + 1]]
        if (name && value !== undefined && FIELD_METADATA_ATTRIBUTES.has(name))
          attributes.set(name, value)
      }
      if (attributes.size > 0)
        metadata.set(backendNodeId, attributes)
    }
  }
  return metadata
}

function containsSensitiveFieldMetadata(
  metadata: ReadonlyMap<number, DomFieldMetadata>,
): boolean {
  return [...metadata.values()].some(attributes => (
    projectBrowserObservedValue({
      attributes,
      description: '',
      hasValue: false,
      name: '',
      protectedField: false,
      role: 'textbox',
      value: undefined,
    }).inputMode === 'human'
  ))
}

function collectViewportNodeIds(
  snapshot: z.infer<typeof cdpDomSnapshotSchema>,
  mainFrameId: string,
  viewport: ViewportBounds,
): Set<number> {
  const document = snapshot.documents.find(candidate => (
    snapshot.strings[candidate.frameId] === mainFrameId
  ))
  const nodeIds = new Set<number>()
  if (!document)
    return nodeIds

  const layoutLength = Math.min(
    document.layout.bounds.length,
    document.layout.nodeIndex.length,
  )
  for (let index = 0; index < layoutLength; index += 1) {
    const nodeIndex = document.layout.nodeIndex[index]
    const backendNodeId = document.nodes.backendNodeId[nodeIndex]
    const bounds = document.layout.bounds[index]
    if (
      backendNodeId
      && bounds
      && intersectsViewport(bounds, viewport)
    ) {
      nodeIds.add(backendNodeId)
    }
  }
  return nodeIds
}

function intersectsViewport(
  [x, y, width, height]: [number, number, number, number],
  viewport: ViewportBounds,
): boolean {
  return width > 0
    && height > 0
    && x < viewport.x + viewport.width
    && x + width > viewport.x
    && y < viewport.y + viewport.height
    && y + height > viewport.y
}

function projectActions(
  role: string,
  properties: Map<string, CdpAxProperty>,
): string[] {
  if (readAxBoolean(properties.get('disabled')))
    return []
  if (role === 'textbox' || role === 'search-box')
    return ['fill', 'type']
  if (role === 'combo-box' || role === 'list-box')
    return ['select']
  return CLICK_ROLES.has(role) ? ['click'] : []
}

function projectStates(properties: Map<string, CdpAxProperty>): string[] {
  const states: string[] = []
  for (const name of [
    'disabled',
    'focused',
    'focusable',
    'required',
    'readonly',
    'editable',
    'busy',
    'selected',
  ]) {
    if (readAxBooleanish(properties.get(name)))
      states.push(name)
  }

  const checked = readAxValue(properties.get('checked'))
  if (checked === true)
    states.push('checked')
  else if (checked === false)
    states.push('unchecked')
  else if (checked === 'mixed')
    states.push('mixed')

  const expanded = readAxValue(properties.get('expanded'))
  if (expanded === true)
    states.push('expanded')
  else if (expanded === false)
    states.push('collapsed')

  if (readAxBooleanish(properties.get('invalid')))
    states.push('invalid')
  return states
}

function normalizeRole(rawRole: string): string {
  const role = rawRole
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
  if (role === 'root-web-area' || role === 'web-area')
    return 'document'
  if (role === 'static-text')
    return 'text'
  if (role === 'searchbox')
    return 'search-box'
  return role.slice(0, 256)
}

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function readAxString(value: { value?: unknown } | undefined): string {
  return typeof value?.value === 'string' ? value.value : ''
}

function readAxValue(property: CdpAxProperty | undefined): unknown {
  return property?.value.value
}

function readAxBoolean(property: CdpAxProperty | undefined): boolean {
  return readAxValue(property) === true
}

function readAxBooleanish(property: CdpAxProperty | undefined): boolean {
  const value = readAxValue(property)
  return value === true
    || (typeof value === 'string' && value !== '' && value !== 'false' && value !== 'none')
}

function readPositiveInteger(property: CdpAxProperty | undefined): number | undefined {
  const value = readAxValue(property)
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 128
    ? Number(value)
    : undefined
}
