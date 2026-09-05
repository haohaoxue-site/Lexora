import type { BrowserWindow, Event as ElectronEvent, Input, MouseInputEvent, WebPreferences } from 'electron'
import type {
  BrowserAcquireControlParams,
  BrowserAction,
  BrowserActParams,
  BrowserControlLease,
  BrowserErrorCode,
  BrowserFailureReason,
  BrowserObservation,
  BrowserObserveParams,
  BrowserReleaseControlParams,
  BrowserValidateActionParams,
  BrowserWaitOutcome,
  BrowserWaitSpec,
} from '../../../shared/browserProtocol'
import type {
  DesktopBrowserGuestDescriptor,
  DesktopBrowserProfileMode,
  DesktopBrowserSetSurfaceInput,
  DesktopBrowserState,
} from '../../shared/desktopApi'
import type {
  BrowserSecurityPage,
  BrowserSecuritySession,
} from './BrowserSecurityPolicy'
import type { BrowserSessionTeardownReason } from './BrowserSessionRegistry'
import type { SemanticBrowserScreenshot, SemanticBrowserScreenshotReference } from './SemanticBrowserDriver'
import { randomUUID } from 'node:crypto'
import { BROWSER_WAIT_DEFAULT_QUIET_MS } from '../../../shared/browserProtocol'
import {
  BrowserSecurityPolicy,
  BrowserSecurityPolicyError,
  isLoopbackBrowserUrl,
} from './BrowserSecurityPolicy'
import {
  BrowserSessionRegistry,
  BrowserSessionRegistryError,
} from './BrowserSessionRegistry'
import {
  SemanticBrowserDriver,
  SemanticBrowserDriverError,
} from './SemanticBrowserDriver'

export const BROWSER_DEFAULT_PARTITION = 'persist:buddy-browser-default-v1'
const BROWSER_GUEST_ATTACH_TIMEOUT_MS = 10_000
const BROWSER_FAILED_NAVIGATION_SETTLE_MS = 200
const BROWSER_NAVIGATION_SETTLE_TIMEOUT_MS = 15_000
const BROWSER_ACTION_NAVIGATION_DETECTION_MS = 50
const BROWSER_WAIT_STATE_INTERVAL_MS = 50
const BROWSER_WAIT_PROBE_INTERVAL_MS = 150

interface BrowserHostOptions {
  createId?: () => string
  createPage?: (descriptor: DesktopBrowserGuestDescriptor) => BrowserPage
  onGuestSetChanged?: () => void
  onSessionClosed?: (
    state: DesktopBrowserState,
    reason: BrowserSessionTeardownReason,
  ) => void
  onStateChanged?: (state: DesktopBrowserState) => void
  window: BrowserWindow
}

type BrowserWaitAction = Extract<BrowserAction, { kind: 'wait' }>
type BrowserWaitRequest = BrowserWaitAction | BrowserWaitSpec

export interface BrowserLocalFileGrant {
  entryPath: string
  rootPath: string
}

export interface BrowserScreenshotReadInput extends SemanticBrowserScreenshotReference {
  pageId: string
  sessionId: string
}

export interface BrowserHostActionResult {
  actionKind: BrowserAction['kind']
  observation: BrowserObservation
  state: DesktopBrowserState
}

export interface BrowserPageScreenshot {
  bytes: Uint8Array
  title: string
}

interface BrowserPage extends BrowserSecurityPage {
  capturePage: () => Promise<{
    getSize: () => { height: number, width: number }
    toPNG: () => Uint8Array
  }>
  close: () => void
  focus: () => void
  getTitle: () => string
  getURL: () => string
  isDestroyed: () => boolean
  loadURL: (url: string) => Promise<unknown>
  navigationHistory: {
    canGoBack: () => boolean
    canGoForward: () => boolean
    getActiveIndex: () => number
    getEntryAtIndex: (index: number) => { url: string } | null
    goBack: () => void
    goForward: () => void
    removeEntryAtIndex: (index: number) => boolean
  }
  off: (event: string, listener: (...args: never[]) => void) => unknown
  on: (event: string, listener: (...args: never[]) => void) => unknown
  reload: () => void
  session: BrowserSecuritySession
  stop: () => void
}

type BrowserSessionState = Omit<DesktopBrowserState, 'security'>

interface BrowserSession {
  actionTail: Promise<void>
  activeNavigationSequence: number | null
  agentActionDepth: number
  descriptor: DesktopBrowserGuestDescriptor
  listeners: Array<() => void>
  mainFrameCommitSequence: number | null
  navigationSequence: number
  page: BrowserPage | null
  pageReady: BrowserPageDeferred
  securityPolicy: BrowserSecurityPolicy | null
  semanticDriver: SemanticBrowserDriver | null
  shouldClearBootstrapHistory: boolean
  state: BrowserSessionState
  stoppedNavigationSequence: number | null
}

interface BrowserPageDeferred {
  promise: Promise<BrowserPage>
  reject: (error: Error) => void
  resolve: (page: BrowserPage) => void
}

export class BrowserHostError extends Error {
  readonly code: BrowserErrorCode
  readonly reason: BrowserFailureReason | null

  constructor(
    code: BrowserErrorCode,
    message: string,
    reason: BrowserFailureReason | null = null,
  ) {
    super(message)
    this.code = code
    this.name = 'BrowserHostError'
    this.reason = reason
  }
}

export class BrowserHost {
  readonly #createId: () => string
  readonly #createPage: ((descriptor: DesktopBrowserGuestDescriptor) => BrowserPage) | null
  readonly #evictedConversationIds = new Set<string>()
  readonly #onSessionClosed: (
    state: DesktopBrowserState,
    reason: BrowserSessionTeardownReason,
  ) => void

  readonly #onStateChanged: (state: DesktopBrowserState) => void
  readonly #onGuestSetChanged: () => void
  readonly #sessions: BrowserSessionRegistry<BrowserSession>
  readonly #window: BrowserWindow
  readonly #windowClosedListener: () => void
  readonly #willAttachWebviewListener: (
    event: ElectronEvent,
    webPreferences: WebPreferences,
    params: Record<string, string>,
  ) => void

  #disposed = false
  constructor(options: BrowserHostOptions) {
    this.#createId = options.createId ?? randomUUID
    this.#createPage = options.createPage ?? null
    this.#onGuestSetChanged = options.onGuestSetChanged ?? (() => {})
    this.#onSessionClosed = options.onSessionClosed ?? (() => {})
    this.#onStateChanged = options.onStateChanged ?? (() => {})
    this.#sessions = new BrowserSessionRegistry({
      createId: this.#createId,
      maxSessions: 4,
    })
    this.#window = options.window
    this.#windowClosedListener = () => this.dispose()
    this.#willAttachWebviewListener = (event, webPreferences, params) => {
      this.#configureGuestAttachment(event, webPreferences, params)
    }
    this.#window.once('closed', this.#windowClosedListener)
    this.#window.webContents.on('will-attach-webview', this.#willAttachWebviewListener)
  }

  get isDisposed(): boolean {
    return this.#disposed
  }

  ensureSession(conversationId: string): DesktopBrowserState {
    return this.#ensureSession(conversationId, 'default')
  }

  async setProfileMode(
    sessionId: string,
    profileMode: DesktopBrowserProfileMode,
  ): Promise<DesktopBrowserState> {
    const current = this.#requireSession(sessionId)
    if (current.state.profileMode === profileMode)
      return snapshot(current.state)
    if (current.state.controller === 'agent')
      this.#returnHumanControl(current, true)
    return this.#replaceSessionProfile(current, profileMode)
  }

  #ensureSession(
    conversationId: string,
    profileMode: DesktopBrowserProfileMode,
  ): DesktopBrowserState {
    this.#assertActive()
    let wasCreated = false
    try {
      const session = this.#sessions.ensure(conversationId, ({ sessionId }) => {
        wasCreated = true
        const session = this.#createSession(conversationId, sessionId, profileMode)
        return {
          session,
          teardown: reason => this.#teardownSession(session, reason),
        }
      })
      if (wasCreated && this.#evictedConversationIds.delete(conversationId)) {
        session.state.error = {
          code: 'BROWSER_SESSION_EVICTED',
          message: 'Inactive browser session was released',
        }
        session.state.status = 'error'
      }
      if (wasCreated)
        this.#onGuestSetChanged()
      if (wasCreated)
        this.#publish(session)
      return snapshot(session.state)
    }
    catch (error) {
      if (error instanceof BrowserSessionRegistryError) {
        throw new BrowserHostError(
          error.code,
          'Every browser session is currently protected',
        )
      }
      throw error
    }
  }

  getState(sessionId: string): DesktopBrowserState {
    return snapshot(this.#requireSession(sessionId).state)
  }

  getStateForConversation(conversationId: string): DesktopBrowserState {
    const session = this.#sessions.getByConversation(conversationId)
    if (!session)
      throw this.#sessionNotFound(conversationId)
    return snapshot(session.state)
  }

  listGuests(): DesktopBrowserGuestDescriptor[] {
    this.#assertActive()
    return this.#sessions.values().map(session => ({ ...session.descriptor }))
  }

  attachGuest(sessionId: string, page: BrowserPage): void {
    const session = this.#requireSession(sessionId)
    if (page.isDestroyed()) {
      throw new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Browser guest was destroyed before attachment',
      )
    }
    if (session.page === page)
      return
    if (session.page && !session.page.isDestroyed()) {
      throw new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Browser session already has an attached guest',
      )
    }
    this.#attachPage(session, page)
  }

  getGuestDescriptor(sessionId: string): DesktopBrowserGuestDescriptor {
    return { ...this.#requireSession(sessionId).descriptor }
  }

  acquireControl(input: BrowserAcquireControlParams): BrowserControlLease {
    const session = this.#requireSession(input.sessionId)
    this.#assertCurrentPage(session, input.pageId, 'before acquiring control')
    this.#advanceControlEpoch(session)
    session.state.controller = 'agent'
    this.#sessions.setProtected(input.sessionId, 'runtime', true)
    this.#publish(session)
    return {
      controller: 'agent',
      controlEpoch: session.state.controlEpoch,
      pageId: session.state.pageId,
      sessionId: session.state.sessionId,
    }
  }

  releaseControl(input: BrowserReleaseControlParams): DesktopBrowserState {
    const session = this.#requireSession(input.sessionId)
    this.#assertCurrentPage(session, input.pageId, 'before releasing control')
    this.#assertAgentControl(session, input.controlEpoch)
    return this.#returnHumanControl(session)
  }

  takeControl(sessionId: string): DesktopBrowserState {
    return this.#returnHumanControl(this.#requireSession(sessionId), true)
  }

  async observe(input: BrowserObserveParams): Promise<BrowserObservation> {
    const session = this.#requireSession(input.sessionId)
    if (session.state.pageId !== input.pageId) {
      return Promise.reject(new BrowserHostError(
        'BROWSER_TARGET_STALE',
        'Browser page identity changed before observation',
      ))
    }
    const recoverablePageError = session.state.status === 'error'
      && session.state.error?.code === 'BROWSER_PAGE_FAILED'
    if (session.state.status === 'error' && session.state.error && !recoverablePageError) {
      return Promise.reject(new BrowserHostError(
        session.state.error.code,
        session.state.error.message,
        session.state.error.reason ?? null,
      ))
    }
    this.#sessions.touch(input.sessionId)
    await this.#waitForPage(session)
    if (recoverablePageError)
      this.#refreshPageState(session)
    const observation = await this.#requireSemanticDriver(session).observe({
      maxElements: input.maxElements,
      pageId: session.state.pageId,
      sessionId: session.state.sessionId,
      status: recoverablePageError || session.state.status === 'idle'
        ? 'ready'
        : session.state.status,
      title: session.state.title,
      url: session.state.url,
    })
    if (recoverablePageError) {
      session.state.error = null
      session.state.status = session.state.url === 'about:blank' ? 'idle' : 'ready'
      this.#publish(session)
    }
    return observation
  }

  validateAction(input: BrowserValidateActionParams): void {
    const session = this.#requireSession(input.sessionId)
    this.#assertCurrentPage(session, input.pageId, 'before approved action validation')
    if (session.state.status === 'error' && session.state.error) {
      throw new BrowserHostError(
        session.state.error.code,
        session.state.error.message,
        session.state.error.reason ?? null,
      )
    }
    this.#sessions.touch(input.sessionId)
    this.#requireSemanticDriver(session).validateAction({
      action: input.action,
      documentRevision: input.documentRevision,
      ...(input.frameId ? { frameId: input.frameId } : {}),
      observationId: input.observationId,
    })
  }

  async act(input: BrowserActParams): Promise<BrowserHostActionResult> {
    const queuedSession = this.#requireSession(input.sessionId)
    const predecessor = queuedSession.actionTail
    let releaseQueue!: () => void
    queuedSession.actionTail = new Promise((resolve) => {
      releaseQueue = resolve
    })
    await predecessor
    try {
      const session = this.#requireSession(input.sessionId)
      if (session !== queuedSession)
        throw this.#sessionNotFound(input.sessionId)
      this.#assertCurrentPage(session, input.pageId, 'before action')
      this.#assertAgentControl(session, input.controlEpoch)
      if (session.state.status === 'error' && session.state.error) {
        throw new BrowserHostError(
          session.state.error.code,
          session.state.error.message,
          session.state.error.reason ?? null,
        )
      }
      await this.#waitForPage(session)
      const semanticDriver = this.#requireSemanticDriver(session)
      this.#sessions.touch(input.sessionId)
      const reference = {
        documentRevision: input.documentRevision,
        observationId: input.observationId,
      }
      let mayStartNavigation = false
      switch (input.action.kind) {
        case 'navigate':
          semanticDriver.assertObservation(reference)
          await this.navigate(input.sessionId, input.action.url)
          break
        case 'back':
          semanticDriver.assertObservation(reference)
          this.goBack(input.sessionId)
          break
        case 'forward':
          semanticDriver.assertObservation(reference)
          this.goForward(input.sessionId)
          break
        case 'reload':
          semanticDriver.assertObservation(reference)
          this.reload(input.sessionId)
          break
        case 'stop':
          semanticDriver.assertObservation(reference)
          this.stop(input.sessionId)
          break
        case 'wait':
          semanticDriver.assertObservation(reference)
          await this.#waitForActionCondition(
            session,
            input.action,
            input.controlEpoch,
            reference,
          )
          break
        default:
          mayStartNavigation = input.action.kind === 'click'
            || input.action.kind === 'press'
            || input.action.kind === 'select'
          session.agentActionDepth += 1
          try {
            await semanticDriver.executeAction({
              action: input.action,
              documentRevision: input.documentRevision,
              ...(input.frameId ? { frameId: input.frameId } : {}),
              observationId: input.observationId,
            })
          }
          catch (error) {
            if (
              error instanceof SemanticBrowserDriverError
              && error.code === 'BROWSER_HUMAN_INPUT_REQUIRED'
            ) {
              this.#returnHumanControl(session, true)
            }
            throw error
          }
          finally {
            session.agentActionDepth -= 1
          }
          semanticDriver.invalidateDocument()
          this.#refreshPageState(session)
          this.#publish(session)
      }

      await this.#waitForPostActionSettlement(session, mayStartNavigation)
      const observation = await this.observe({
        pageId: session.state.pageId,
        sessionId: session.state.sessionId,
      })
      return {
        actionKind: input.action.kind,
        observation,
        state: snapshot(session.state),
      }
    }
    finally {
      releaseQueue()
    }
  }

  readScreenshot(input: BrowserScreenshotReadInput): SemanticBrowserScreenshot {
    const session = this.#requireSession(input.sessionId)
    if (session.state.pageId !== input.pageId) {
      throw new BrowserHostError(
        'BROWSER_TARGET_STALE',
        'Browser page identity changed before screenshot resolution',
      )
    }
    this.#sessions.touch(input.sessionId)
    return this.#requireSemanticDriver(session).resolveScreenshot(input)
  }

  async captureScreenshot(sessionId: string): Promise<BrowserPageScreenshot> {
    const session = this.#requireSession(sessionId)
    const page = await this.#waitForPage(session)
    this.#sessions.touch(sessionId)
    const screenshot = await page.capturePage()
    return {
      bytes: screenshot.toPNG(),
      title: page.getTitle().slice(0, 512),
    }
  }

  async navigate(sessionId: string, rawUrl: string): Promise<DesktopBrowserState> {
    const session = this.#requireSession(sessionId)
    await this.#waitForPage(session)
    const navigationSequence = this.#beginPageAction(session)
    let url: string
    try {
      url = await session.securityPolicy?.authorizeNavigation(rawUrl) ?? ''
    }
    catch (error) {
      if (!(error instanceof BrowserSecurityPolicyError))
        throw error
      if (!this.#shouldContinuePageAction(session, navigationSequence))
        return snapshot(session.state)
      session.state.error = {
        code: error.code,
        message: error.message,
        reason: error.reason,
      }
      session.state.status = 'error'
      this.#finishPageAction(session, navigationSequence)
      this.#publish(session)
      throw new BrowserHostError(error.code, error.message, error.reason)
    }
    if (!this.#shouldContinuePageAction(session, navigationSequence))
      return snapshot(session.state)

    return this.#loadPage(sessionId, session, navigationSequence, url)
  }

  async #loadPage(
    sessionId: string,
    session: BrowserSession,
    navigationSequence: number,
    url: string,
  ): Promise<DesktopBrowserState> {
    session.state.url = url
    this.#publish(session)
    try {
      const page = await this.#waitForPage(session)
      await page.loadURL(url)
      if (!this.#sessions.get(sessionId))
        throw this.#sessionNotFound(sessionId)
      if (!this.#isCurrentPageAction(session, navigationSequence))
        return snapshot(session.state)
      session.stoppedNavigationSequence = null
      this.#finishPageAction(session, navigationSequence)
      this.#removeBootstrapHistory(session)
      this.#refreshPageState(session)
      session.state.status = 'ready'
      this.#publish(session)
      return snapshot(session.state)
    }
    catch (error) {
      if (error instanceof BrowserHostError)
        throw error
      if (!this.#sessions.get(sessionId))
        throw this.#sessionNotFound(sessionId)
      if (!this.#isCurrentPageAction(session, navigationSequence))
        return snapshot(session.state)
      if (session.stoppedNavigationSequence === navigationSequence) {
        session.stoppedNavigationSequence = null
        this.#finishPageAction(session, navigationSequence)
        session.state.error = null
        session.state.status = session.state.url === 'about:blank' ? 'idle' : 'ready'
        this.#refreshPageState(session)
        this.#publish(session)
        return snapshot(session.state)
      }
      return this.#waitForNavigationSettlement(
        sessionId,
        session,
        navigationSequence,
        error,
      )
    }
  }

  async #waitForNavigationSettlement(
    sessionId: string,
    session: BrowserSession,
    navigationSequence: number,
    loadError: unknown,
  ): Promise<DesktopBrowserState> {
    const deadline = Date.now() + BROWSER_NAVIGATION_SETTLE_TIMEOUT_MS
    const isAbortedLoad = isNavigationAborted(loadError)
    const loadFailureDeadline = isAbortedLoad
      ? null
      : Math.min(deadline, Date.now() + BROWSER_FAILED_NAVIGATION_SETTLE_MS)
    let pageFailureDeadline: number | null = null
    while (true) {
      if (this.#sessions.get(sessionId) !== session)
        throw this.#sessionNotFound(sessionId)
      if (!this.#isCurrentPageAction(session, navigationSequence))
        return snapshot(session.state)
      if (session.stoppedNavigationSequence === navigationSequence) {
        session.stoppedNavigationSequence = null
        this.#finishPageAction(session, navigationSequence)
        session.state.error = null
        session.state.status = session.state.url === 'about:blank' ? 'idle' : 'ready'
        this.#refreshPageState(session)
        this.#publish(session)
        return snapshot(session.state)
      }
      const hasReplacementCommit = session.mainFrameCommitSequence === navigationSequence
      const pageFailure = session.state.error
      if (pageFailure) {
        pageFailureDeadline ??= Math.min(
          deadline,
          Date.now() + BROWSER_FAILED_NAVIGATION_SETTLE_MS,
        )
      }
      else {
        pageFailureDeadline = null
      }
      if (
        pageFailure
        && (
          session.activeNavigationSequence !== navigationSequence
          || Date.now() >= (pageFailureDeadline ?? deadline)
        )
      ) {
        this.#finishPageAction(session, navigationSequence)
        throw new BrowserHostError(
          pageFailure.code,
          pageFailure.message,
          pageFailure.reason ?? null,
        )
      }
      if (
        session.state.status === 'ready'
        && (isAbortedLoad || hasReplacementCommit)
      ) {
        return snapshot(session.state)
      }
      if (loadFailureDeadline !== null && Date.now() >= loadFailureDeadline) {
        const message = browserLoadErrorMessage(loadError)
        this.#finishPageAction(session, navigationSequence)
        session.state.error = { code: 'BROWSER_PAGE_FAILED', message }
        session.state.status = 'error'
        this.#publish(session)
        throw new BrowserHostError('BROWSER_PAGE_FAILED', message)
      }
      const remainingMs = Math.min(
        pageFailureDeadline ?? deadline,
        loadFailureDeadline ?? deadline,
      ) - Date.now()
      if (remainingMs <= 0) {
        const message = 'Browser navigation did not settle after the initial load was replaced'
        this.#finishPageAction(session, navigationSequence)
        session.state.error = { code: 'BROWSER_PAGE_FAILED', message }
        session.state.status = 'error'
        this.#publish(session)
        throw new BrowserHostError('BROWSER_PAGE_FAILED', message)
      }
      await wait(Math.min(remainingMs, 50))
    }
  }

  goBack(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    const history = this.#requirePage(session).navigationHistory
    if (!history.canGoBack())
      return
    this.#beginPageAction(session)
    history.goBack()
  }

  goForward(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    const history = this.#requirePage(session).navigationHistory
    if (!history.canGoForward())
      return
    this.#beginPageAction(session)
    history.goForward()
  }

  reload(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    if (session.state.url === 'about:blank')
      return
    this.#beginPageAction(session)
    this.#requirePage(session).reload()
  }

  stop(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    if (session.state.status !== 'loading')
      return
    session.stoppedNavigationSequence = session.navigationSequence
    this.#finishPageAction(session, session.navigationSequence)
    this.#requirePage(session).stop()
    this.#refreshPageState(session)
    session.state.error = null
    session.state.status = session.state.url === 'about:blank' ? 'idle' : 'ready'
    this.#publish(session)
  }

  async openLocalFile(
    sessionId: string,
    grant: BrowserLocalFileGrant,
  ): Promise<DesktopBrowserState> {
    const session = this.#requireSession(sessionId)
    await this.#waitForPage(session)
    const navigationSequence = this.#beginPageAction(session)
    let url: string
    try {
      url = await session.securityPolicy?.authorizeLocalFile(
        grant.entryPath,
        grant.rootPath,
      ) ?? ''
    }
    catch (error) {
      if (!(error instanceof BrowserSecurityPolicyError))
        throw error
      if (!this.#shouldContinuePageAction(session, navigationSequence))
        return snapshot(session.state)
      session.state.error = {
        code: error.code,
        message: error.message,
        reason: error.reason,
      }
      session.state.status = 'error'
      this.#finishPageAction(session, navigationSequence)
      this.#publish(session)
      throw new BrowserHostError(error.code, error.message, error.reason)
    }
    if (!this.#shouldContinuePageAction(session, navigationSequence))
      return snapshot(session.state)
    return this.#loadPage(sessionId, session, navigationSequence, url)
  }

  async #replaceSessionProfile(
    current: BrowserSession,
    profileMode: DesktopBrowserProfileMode,
  ): Promise<DesktopBrowserState> {
    const conversationId = current.state.conversationId
    const restoreVisibility = current.state.visible
    const restoreUrl = current.state.url.startsWith('file:') ? null : current.state.url
    this.#sessions.remove(current.state.sessionId)

    const state = this.#ensureSession(conversationId, profileMode)
    if (restoreVisibility) {
      this.setSurface({
        sessionId: state.sessionId,
        visible: true,
      })
    }
    if (restoreUrl && restoreUrl !== 'about:blank') {
      try {
        await this.navigate(state.sessionId, restoreUrl)
      }
      catch (error) {
        if (!(error instanceof BrowserHostError))
          throw error
      }
    }
    return this.getState(state.sessionId)
  }

  setSurface(input: DesktopBrowserSetSurfaceInput): void {
    const session = this.#requireSession(input.sessionId)
    if (!input.visible) {
      this.#hide(session)
      return
    }

    for (const other of this.#sessions.values()) {
      if (other !== session)
        this.#hide(other)
    }
    this.#sessions.setProtected(session.state.sessionId, 'surface', true)
    if (!session.state.visible) {
      session.state.visible = true
      this.#publish(session)
    }
  }

  async #waitForActionCondition(
    session: BrowserSession,
    action: BrowserWaitAction,
    controlEpoch: number,
    reference: { documentRevision: number, observationId: string },
  ): Promise<void> {
    const satisfied = await this.#pollWaitCondition(session, action, {
      controlEpoch,
      reference,
    })
    if (!satisfied) {
      throw new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Browser wait condition timed out',
      )
    }
  }

  async waitFor(sessionId: string, spec: BrowserWaitSpec): Promise<BrowserWaitOutcome> {
    const session = this.#requireSession(sessionId)
    await this.#waitForPage(session)
    const startedAt = Date.now()
    const satisfied = await this.#pollWaitCondition(session, spec, {})
    return {
      condition: spec.condition,
      elapsedMs: Date.now() - startedAt,
      satisfied,
    }
  }

  async #pollWaitCondition(
    session: BrowserSession,
    spec: BrowserWaitRequest,
    options: {
      controlEpoch?: number
      reference?: { documentRevision: number, observationId: string }
    },
  ): Promise<boolean> {
    const initialUrl = session.state.url
    const deadline = Date.now() + spec.timeoutMs
    const usesProbe = spec.condition === 'text-visible'
      || spec.condition === 'ref-visible'
      || spec.condition === 'ref-hidden'
      || spec.condition === 'dom-stable'
    const stability = { lastFingerprint: null as string | null, stableSince: null as number | null }
    while (true) {
      if (this.#sessions.get(session.state.sessionId) !== session)
        throw this.#sessionNotFound(session.state.sessionId)
      if (options.controlEpoch !== undefined)
        this.#assertAgentControl(session, options.controlEpoch)
      if (session.state.status === 'error' && session.state.error) {
        throw new BrowserHostError(
          session.state.error.code,
          session.state.error.message,
          session.state.error.reason ?? null,
        )
      }
      if (await this.#evaluateWaitCondition(session, spec, initialUrl, options.reference, stability))
        return true
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0)
        return false
      await wait(Math.min(
        remainingMs,
        usesProbe ? BROWSER_WAIT_PROBE_INTERVAL_MS : BROWSER_WAIT_STATE_INTERVAL_MS,
      ))
    }
  }

  async #evaluateWaitCondition(
    session: BrowserSession,
    spec: BrowserWaitRequest,
    initialUrl: string,
    reference: { documentRevision: number, observationId: string } | undefined,
    stability: { lastFingerprint: string | null, stableSince: number | null },
  ): Promise<boolean> {
    switch (spec.condition) {
      case 'page-ready':
        return session.state.status === 'ready'
      case 'url-changed':
        return session.state.url !== initialUrl
      case 'url-matches':
        return session.state.url.includes(spec.pattern)
      case 'text-visible': {
        if (session.state.status === 'loading')
          return false
        const driver = this.#requireSemanticDriver(session)
        return driver.isTextVisible(spec.text).catch(swallowDriverProbeFailure)
      }
      case 'ref-visible':
      case 'ref-hidden': {
        if (!reference)
          throw new BrowserHostError('BROWSER_TARGET_STALE', 'Browser wait target requires an observation')
        const driver = this.#requireSemanticDriver(session)
        const visible = await driver.isTargetVisible({ ...reference, ref: spec.ref })
        return spec.condition === 'ref-visible' ? visible : !visible
      }
      case 'dom-stable': {
        if (session.state.status === 'loading') {
          stability.lastFingerprint = null
          stability.stableSince = null
          return false
        }
        const driver = this.#requireSemanticDriver(session)
        const fingerprint = await driver.fingerprintDocument().catch(() => null)
        const now = Date.now()
        if (fingerprint === null || fingerprint !== stability.lastFingerprint) {
          stability.lastFingerprint = fingerprint
          stability.stableSince = fingerprint === null ? null : now
          return false
        }
        return stability.stableSince !== null
          && now - stability.stableSince >= (spec.quietMs ?? BROWSER_WAIT_DEFAULT_QUIET_MS)
      }
    }
  }

  async #waitForPostActionSettlement(
    session: BrowserSession,
    detectNavigation: boolean,
  ): Promise<void> {
    if (detectNavigation)
      await wait(BROWSER_ACTION_NAVIGATION_DETECTION_MS)
    const deadline = Date.now() + BROWSER_NAVIGATION_SETTLE_TIMEOUT_MS
    while (session.state.status === 'loading') {
      if (this.#sessions.get(session.state.sessionId) !== session)
        throw this.#sessionNotFound(session.state.sessionId)
      if (session.state.error) {
        throw new BrowserHostError(
          session.state.error.code,
          session.state.error.message,
          session.state.error.reason ?? null,
        )
      }
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        throw new BrowserHostError(
          'BROWSER_PAGE_FAILED',
          'Browser action navigation did not settle',
        )
      }
      await wait(Math.min(remainingMs, 50))
    }
  }

  close(sessionId: string): void {
    this.#requireSession(sessionId)
    this.#sessions.remove(sessionId)
  }

  releaseRuntimeControl(): void {
    if (this.#disposed)
      return
    for (const session of this.#sessions.values()) {
      if (session.state.controller === 'agent')
        this.#returnHumanControl(session, true)
    }
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#window.off('closed', this.#windowClosedListener)
    this.#window.webContents.off('will-attach-webview', this.#willAttachWebviewListener)
    this.#sessions.dispose()
    this.#evictedConversationIds.clear()
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new BrowserHostError('BROWSER_SESSION_NOT_FOUND', 'Browser host is disposed')
  }

  #createSession(
    conversationId: string,
    sessionId: string,
    profileMode: DesktopBrowserProfileMode,
  ): BrowserSession {
    const descriptor: DesktopBrowserGuestDescriptor = {
      partition: profileMode === 'default'
        ? BROWSER_DEFAULT_PARTITION
        : `buddy-browser-incognito:${sessionId}`,
      sessionId,
    }
    const session: BrowserSession = {
      actionTail: Promise.resolve(),
      activeNavigationSequence: null,
      agentActionDepth: 0,
      descriptor,
      listeners: [],
      mainFrameCommitSequence: null,
      navigationSequence: 0,
      page: null,
      pageReady: createBrowserPageDeferred(),
      securityPolicy: null,
      semanticDriver: null,
      shouldClearBootstrapHistory: true,
      state: {
        canGoBack: false,
        canGoForward: false,
        controller: 'human',
        controlEpoch: 0,
        conversationId,
        error: null,
        pageId: this.#createId(),
        profileMode,
        sessionId,
        status: 'idle',
        title: '',
        url: 'about:blank',
        visible: false,
      },
      stoppedNavigationSequence: null,
    }
    const page = this.#createPage?.(descriptor)
    if (page)
      this.#attachPage(session, page)
    return session
  }

  #attachPage(session: BrowserSession, page: BrowserPage): void {
    session.page = page
    session.semanticDriver = new SemanticBrowserDriver({
      createId: this.#createId,
      page,
    })
    session.securityPolicy = new BrowserSecurityPolicy({
      onCertificateError: ({ error, url }) => {
        session.state.error = {
          code: 'BROWSER_CERTIFICATE_ERROR',
          message: error,
        }
        session.state.status = 'error'
        session.state.url = normalizeBrowserUrl(url) ?? session.state.url
        this.#publish(session)
      },
      onPermissionDenied: () => {
        session.state.error = {
          code: 'BROWSER_PERMISSION_DENIED',
          message: 'Browser permission request was denied',
        }
        this.#publish(session)
      },
      onRequestBlocked: (details) => {
        if (details.resourceType !== 'mainFrame')
          return
        session.state.error = {
          code: 'BROWSER_NAVIGATION_BLOCKED',
          message: 'Browser navigation was blocked by network policy',
          reason: 'NETWORK_POLICY_BLOCKED',
        }
        session.state.status = 'error'
        this.#publish(session)
      },
      page,
      session: page.session,
    })
    this.#configureSession(session, page)
    session.pageReady.resolve(page)
    this.#refreshPageState(session)
    this.#publish(session)
  }

  #teardownSession(
    session: BrowserSession,
    reason: BrowserSessionTeardownReason,
  ): void {
    if (reason === 'evicted') {
      this.#evictedConversationIds.add(session.state.conversationId)
      session.state.error = {
        code: 'BROWSER_SESSION_EVICTED',
        message: 'Inactive browser session was released',
      }
      session.state.status = 'error'
      this.#publish(session)
    }
    session.state.visible = false
    this.#onSessionClosed(snapshot(session.state), reason)
    const page = session.page
    this.#releasePage(session)
    session.pageReady.reject(this.#sessionNotFound(session.state.sessionId))
    if (page && !page.isDestroyed())
      page.close()
    this.#onGuestSetChanged()
  }

  #configureSession(session: BrowserSession, page: BrowserPage): void {
    this.#listen(
      session,
      page,
      'before-input-event',
      (_event: { preventDefault: () => void }, input: Input) => {
        if (session.agentActionDepth > 0)
          return
        if (input.type === 'keyDown' || input.type === 'rawKeyDown')
          this.#acceptHumanPageInput(session)
      },
    )
    this.#listen(
      session,
      page,
      'before-mouse-event',
      (_event: unknown, input: MouseInputEvent) => {
        if (
          session.agentActionDepth === 0
          && ['contextMenu', 'mouseDown', 'mouseWheel'].includes(input.type)
        ) {
          this.#acceptHumanPageInput(session)
        }
      },
    )
    this.#listen(session, page, 'did-start-loading', () => {
      const isIndependentNavigation = session.activeNavigationSequence === null
      if (isIndependentNavigation) {
        session.navigationSequence += 1
        session.activeNavigationSequence = session.navigationSequence
        session.semanticDriver?.invalidateDocument()
        session.stoppedNavigationSequence = null
      }
      if (isIndependentNavigation)
        session.state.error = null
      if (!session.state.error)
        session.state.status = 'loading'
      this.#refreshPageState(session)
      this.#publish(session)
    })
    this.#listen(session, page, 'did-stop-loading', () => {
      this.#removeBootstrapHistory(session)
      const isPreparingInitialNavigation = session.state.status === 'loading'
        && session.state.url === 'about:blank'
      if (
        !isPreparingInitialNavigation
        && (!session.state.error || session.state.error.code === 'BROWSER_PERMISSION_DENIED')
      ) {
        session.state.status = session.state.url === 'about:blank' ? 'idle' : 'ready'
      }
      if (!isPreparingInitialNavigation)
        session.activeNavigationSequence = null
      this.#refreshPageState(session)
      this.#publish(session)
    })
    this.#listen(session, page, 'page-title-updated', (_event, title: string) => {
      session.state.title = title.slice(0, 512)
      this.#publish(session)
    })
    const updateNavigation = (_event: unknown, url: string) => {
      const normalizedUrl = normalizeBrowserUrl(url)
      if (!normalizedUrl)
        return
      session.mainFrameCommitSequence = session.navigationSequence
      this.#refreshPageState(session)
      session.state.url = normalizedUrl
      if (session.state.error?.code === 'BROWSER_PAGE_FAILED') {
        session.state.error = null
        session.state.status = 'loading'
      }
      this.#publish(session)
    }
    this.#listen(session, page, 'did-navigate', updateNavigation)
    this.#listen(
      session,
      page,
      'did-frame-navigate',
      (
        _event: unknown,
        _url: string,
        _httpResponseCode: number,
        _httpStatusText: string,
        isMainFrame: boolean,
      ) => {
        if (isMainFrame)
          return
        session.semanticDriver?.invalidateDocument()
        this.#publish(session)
      },
    )
    this.#listen(
      session,
      page,
      'did-navigate-in-page',
      (_event: unknown, url: string, isMainFrame: boolean) => {
        session.semanticDriver?.invalidateDocument()
        if (isMainFrame)
          updateNavigation(_event, url)
        else
          this.#publish(session)
      },
    )
    const blockUnsafeNavigation = (event: { preventDefault: () => void }, url: string) => {
      if (normalizeBrowserUrl(url))
        return
      event.preventDefault()
      session.state.error = {
        code: 'BROWSER_NAVIGATION_BLOCKED',
        message: 'Browser navigation only supports HTTP, HTTPS, and authorized local files',
        reason: 'UNSUPPORTED_PROTOCOL',
      }
      session.state.status = 'error'
      this.#publish(session)
    }
    this.#listen(session, page, 'will-navigate', blockUnsafeNavigation)
    this.#listen(session, page, 'will-redirect', blockUnsafeNavigation)
    this.#listen(
      session,
      page,
      'did-fail-load',
      (
        _event,
        errorCode: number,
        errorDescription: string,
        validatedUrl: string,
        isMainFrame: boolean,
      ) => {
        if (!isMainFrame || errorCode === -3)
          return
        const failedUrl = normalizeBrowserUrl(validatedUrl)
        if (
          failedUrl
          && session.state.url !== 'about:blank'
          && session.state.url !== failedUrl
        ) {
          return
        }
        session.state.error = {
          code: 'BROWSER_PAGE_FAILED',
          message: errorDescription.slice(0, 1_024),
        }
        session.state.status = 'error'
        session.state.url = failedUrl ?? session.state.url
        this.#publish(session)
      },
    )
    this.#listen(session, page, 'render-process-gone', () => {
      session.semanticDriver?.invalidateDocument()
      session.state.error = {
        code: 'BROWSER_PAGE_CRASHED',
        message: 'Browser page renderer exited',
      }
      session.state.status = 'error'
      this.#publish(session)
    })
    this.#listen(session, page, 'unresponsive', () => {
      session.state.error = {
        code: 'BROWSER_PAGE_UNRESPONSIVE',
        message: 'Browser page is not responding',
      }
      session.state.status = 'error'
      this.#publish(session)
    })
    this.#listen(session, page, 'responsive', () => {
      if (session.state.error?.code !== 'BROWSER_PAGE_UNRESPONSIVE')
        return
      session.state.error = null
      session.state.status = 'ready'
      this.#refreshPageState(session)
      this.#publish(session)
    })
    this.#listen(session, page, 'destroyed', () => {
      if (this.#sessions.get(session.state.sessionId) !== session || session.page !== page)
        return
      this.#releasePage(session)
      session.pageReady = createBrowserPageDeferred()
      session.shouldClearBootstrapHistory = true
      session.state.canGoBack = false
      session.state.canGoForward = false
      session.state.error = {
        code: 'BROWSER_PAGE_CRASHED',
        message: 'Browser guest was detached from the Desktop renderer',
      }
      session.state.pageId = this.#createId()
      session.state.status = 'error'
      session.state.title = ''
      session.state.url = 'about:blank'
      this.#publish(session)
      this.#onGuestSetChanged()
    })
  }

  #hide(session: BrowserSession): void {
    this.#sessions.setProtected(session.state.sessionId, 'surface', false)
    if (session.state.visible) {
      session.state.visible = false
      this.#publish(session)
    }
  }

  #listen(
    session: BrowserSession,
    page: BrowserPage,
    event: string,
    listener: (...args: never[]) => void,
  ): void {
    page.on(event, listener)
    session.listeners.push(() => page.off(event, listener))
  }

  #beginPageAction(session: BrowserSession): number {
    this.#sessions.touch(session.state.sessionId)
    session.navigationSequence += 1
    session.activeNavigationSequence = session.navigationSequence
    session.semanticDriver?.invalidateDocument()
    session.stoppedNavigationSequence = null
    session.state.error = null
    session.state.status = 'loading'
    this.#publish(session)
    return session.navigationSequence
  }

  #isCurrentPageAction(session: BrowserSession, navigationSequence: number): boolean {
    return session.navigationSequence === navigationSequence
  }

  #finishPageAction(session: BrowserSession, navigationSequence: number): void {
    if (session.activeNavigationSequence === navigationSequence)
      session.activeNavigationSequence = null
  }

  #shouldContinuePageAction(session: BrowserSession, navigationSequence: number): boolean {
    return this.#isCurrentPageAction(session, navigationSequence)
      && session.stoppedNavigationSequence !== navigationSequence
  }

  #publish(session: BrowserSession): void {
    this.#onStateChanged(snapshot(session.state))
  }

  #removeBootstrapHistory(session: BrowserSession): void {
    if (!session.shouldClearBootstrapHistory)
      return
    const page = session.page
    if (!page || page.isDestroyed())
      return
    const history = page.navigationHistory
    const firstEntry = history.getEntryAtIndex(0)
    if (!firstEntry)
      return
    if (firstEntry.url !== 'about:blank') {
      session.shouldClearBootstrapHistory = false
      return
    }
    if (history.getActiveIndex() > 0 && history.removeEntryAtIndex(0))
      session.shouldClearBootstrapHistory = false
  }

  #refreshPageState(session: BrowserSession): void {
    const page = session.page
    if (!page || page.isDestroyed())
      return
    session.state.canGoBack = page.navigationHistory.canGoBack()
    session.state.canGoForward = page.navigationHistory.canGoForward()
    session.state.title = page.getTitle().slice(0, 512)
    const pageUrl = page.getURL()
    const normalizedPageUrl = normalizeBrowserUrl(pageUrl)
    if (normalizedPageUrl)
      session.state.url = normalizedPageUrl
  }

  #assertCurrentPage(
    session: BrowserSession,
    pageId: string,
    operation: string,
  ): void {
    if (session.state.pageId === pageId)
      return
    throw new BrowserHostError(
      'BROWSER_TARGET_STALE',
      `Browser page identity changed ${operation}`,
    )
  }

  #assertAgentControl(session: BrowserSession, controlEpoch: number): void {
    if (
      session.state.controller === 'agent'
      && session.state.controlEpoch === controlEpoch
    ) {
      return
    }
    throw new BrowserHostError(
      'BROWSER_CONTROL_REQUIRED',
      'Browser agent control is required',
    )
  }

  #advanceControlEpoch(session: BrowserSession): void {
    if (session.state.controlEpoch >= Number.MAX_SAFE_INTEGER) {
      throw new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Browser control epoch is exhausted',
      )
    }
    session.state.controlEpoch += 1
  }

  #acceptHumanPageInput(session: BrowserSession): void {
    if (!session.state.visible)
      return
    this.#sessions.touch(session.state.sessionId)
    if (session.state.controller === 'agent') {
      this.#returnHumanControl(session, true)
      return
    }
    session.semanticDriver?.invalidateDocument()
  }

  #returnHumanControl(
    session: BrowserSession,
    invalidateObservation = false,
  ): DesktopBrowserState {
    this.#advanceControlEpoch(session)
    session.state.controller = 'human'
    if (invalidateObservation)
      session.semanticDriver?.invalidateDocument()
    this.#sessions.setProtected(session.state.sessionId, 'runtime', false)
    this.#publish(session)
    return snapshot(session.state)
  }

  #configureGuestAttachment(
    event: ElectronEvent,
    webPreferences: WebPreferences,
    params: Record<string, string>,
  ): void {
    const descriptor = this.#sessions.values().find(candidate => (
      candidate.descriptor.partition === params.partition
    ))?.descriptor
    if (!descriptor || params.src !== 'about:blank') {
      event.preventDefault()
      return
    }

    delete params.allowpopups
    delete params.preload
    delete webPreferences.preload
    Object.assign(webPreferences, {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      partition: descriptor.partition,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    } satisfies WebPreferences)
  }

  #releasePage(session: BrowserSession): void {
    try {
      session.securityPolicy?.dispose()
    }
    catch {}
    session.securityPolicy = null
    try {
      session.semanticDriver?.dispose()
    }
    catch {}
    session.semanticDriver = null
    for (const removeListener of session.listeners) {
      try {
        removeListener()
      }
      catch {}
    }
    session.listeners = []
    session.page = null
  }

  #requirePage(session: BrowserSession): BrowserPage {
    const page = session.page
    if (!page || page.isDestroyed()) {
      throw new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Browser guest is not attached',
      )
    }
    return page
  }

  #requireSemanticDriver(session: BrowserSession): SemanticBrowserDriver {
    const driver = session.semanticDriver
    if (!driver) {
      throw new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Browser guest is not attached',
      )
    }
    return driver
  }

  async #waitForPage(session: BrowserSession): Promise<BrowserPage> {
    const page = session.page
    if (page && !page.isDestroyed())
      return page
    this.#onGuestSetChanged()
    return waitForBrowserPage(session.pageReady.promise)
  }

  #requireSession(sessionId: string): BrowserSession {
    this.#assertActive()
    const session = this.#sessions.get(sessionId)
    if (!session)
      throw this.#sessionNotFound(sessionId)
    return session
  }

  #sessionNotFound(sessionId: string): BrowserHostError {
    return new BrowserHostError(
      'BROWSER_SESSION_NOT_FOUND',
      `Browser session is unavailable: ${sessionId}`,
    )
  }
}

function normalizeBrowserUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (!['file:', 'http:', 'https:'].includes(url.protocol))
      return null
    return url.toString()
  }
  catch {
    return null
  }
}

function isNavigationAborted(error: unknown): boolean {
  if (!error || typeof error !== 'object')
    return false
  const candidate = error as { code?: unknown, errno?: unknown }
  if (candidate.code === 'ERR_ABORTED' || candidate.errno === -3)
    return true
  return error instanceof Error
    && /^ERR_ABORTED(?: \(-3\))?(?: |$)/.test(error.message)
}

function browserLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim())
    return error.message.slice(0, 1_024)
  return 'Browser page failed to load'
}

function swallowDriverProbeFailure(error: unknown): false {
  if (error instanceof SemanticBrowserDriverError && error.code === 'BROWSER_PAGE_FAILED')
    return false
  throw error
}

function snapshot(state: BrowserSessionState): DesktopBrowserState {
  return {
    ...state,
    error: state.error ? { ...state.error } : null,
    security: projectSecurityState(state.url, state.error?.code),
  }
}

function projectSecurityState(
  rawUrl: string,
  errorCode: BrowserErrorCode | undefined,
): DesktopBrowserState['security'] {
  if (rawUrl === 'about:blank')
    return { kind: 'blank', origin: null }
  const url = new URL(rawUrl)
  const origin = url.origin
  if (errorCode === 'BROWSER_CERTIFICATE_ERROR')
    return { kind: 'certificate-error', origin }
  if (url.protocol === 'file:')
    return { kind: 'local', origin: 'file://' }
  if (isLoopbackBrowserUrl(rawUrl))
    return { kind: 'local', origin }
  return {
    kind: url.protocol === 'https:' ? 'secure' : 'insecure',
    origin,
  }
}

function createBrowserPageDeferred(): BrowserPageDeferred {
  let reject!: (error: Error) => void
  let resolve!: (page: BrowserPage) => void
  const promise = new Promise<BrowserPage>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  void promise.catch(() => {})
  return { promise, reject, resolve }
}

function waitForBrowserPage(promise: Promise<BrowserPage>): Promise<BrowserPage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Browser guest did not attach to the Desktop renderer',
      ))
    }, BROWSER_GUEST_ATTACH_TIMEOUT_MS)
    void promise.then((page) => {
      clearTimeout(timeout)
      resolve(page)
    }, (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

function wait(durationMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, durationMs))
}
