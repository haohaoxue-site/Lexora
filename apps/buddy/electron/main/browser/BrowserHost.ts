import type { BrowserWindow, Input, MouseInputEvent, Rectangle, WebPreferences } from 'electron'
import type {
  BrowserAcquireControlParams,
  BrowserAction,
  BrowserActParams,
  BrowserControlLease,
  BrowserErrorCode,
  BrowserObservation,
  BrowserObserveParams,
  BrowserReleaseControlParams,
  BrowserValidateActionParams,
} from '../../../shared/browserProtocol'
import type {
  DesktopBrowserProfileMode,
  DesktopBrowserSetSurfaceInput,
  DesktopBrowserState,
  DesktopBrowserToolbarFocusRequest,
} from '../../shared/desktopApi'
import type {
  BrowserSecurityPage,
  BrowserSecuritySession,
} from './BrowserSecurityPolicy'
import type { BrowserSessionTeardownReason } from './BrowserSessionRegistry'
import type { SemanticBrowserScreenshot, SemanticBrowserScreenshotReference } from './SemanticBrowserDriver'
import { randomUUID } from 'node:crypto'
import { WebContentsView } from 'electron'
import { probeBrowserLocalServer } from './BrowserLocalServerProbe'
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

export const BROWSER_PERSONAL_PARTITION = 'persist:buddy-browser-personal-v1'

interface BrowserHostOptions {
  createId?: () => string
  createView?: (options: BrowserViewOptions) => BrowserView
  onSessionClosed?: (
    state: DesktopBrowserState,
    reason: BrowserSessionTeardownReason,
  ) => void
  onStateChanged?: (state: DesktopBrowserState) => void
  onToolbarFocusRequested?: (request: DesktopBrowserToolbarFocusRequest) => void
  previewServer: BrowserPreviewServerPort
  probeLocalUrl?: (url: string) => Promise<boolean>
  window: BrowserWindow
}

interface BrowserPreviewServerPort {
  mount: (input: {
    entryPath: string
    ownerSessionId: string
    rootPath: string
  }) => Promise<{ entryUrl: string, token: string }>
  revoke: (token: string) => boolean
  revokeSession: (ownerSessionId: string) => void
}

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
  requiresObservation: true
  state: DesktopBrowserState
}

interface BrowserViewOptions {
  webPreferences: WebPreferences
}

interface BrowserView {
  setBounds: (bounds: Rectangle) => void
  webContents: BrowserPage
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
  agentActionDepth: number
  attached: boolean
  listeners: Array<() => void>
  navigationSequence: number
  previewToken: string | null
  securityPolicy: BrowserSecurityPolicy | null
  semanticDriver: SemanticBrowserDriver
  shouldClearBootstrapHistory: boolean
  state: BrowserSessionState
  stoppedNavigationSequence: number | null
  surfaceBounds: Rectangle | null
  view: BrowserView
}

export class BrowserHostError extends Error {
  readonly code: BrowserErrorCode

  constructor(
    code: BrowserErrorCode,
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'BrowserHostError'
  }
}

export class BrowserHost {
  readonly #createId: () => string
  readonly #createView: (options: BrowserViewOptions) => BrowserView
  readonly #evictedConversationIds = new Set<string>()
  readonly #onSessionClosed: (
    state: DesktopBrowserState,
    reason: BrowserSessionTeardownReason,
  ) => void

  readonly #onStateChanged: (state: DesktopBrowserState) => void
  readonly #onToolbarFocusRequested: (request: DesktopBrowserToolbarFocusRequest) => void
  readonly #previewServer: BrowserPreviewServerPort
  readonly #probeLocalUrl: (url: string) => Promise<boolean>
  readonly #sessions: BrowserSessionRegistry<BrowserSession>
  readonly #window: BrowserWindow
  readonly #windowAvailableListener: () => void
  readonly #windowClosedListener: () => void
  readonly #windowUnavailableListener: () => void
  #disposed = false
  #personalSessionId: string | null = null
  #windowUnavailable = false

  constructor(options: BrowserHostOptions) {
    this.#createId = options.createId ?? randomUUID
    this.#createView = options.createView ?? (viewOptions => (
      new WebContentsView(viewOptions) as unknown as BrowserView
    ))
    this.#onSessionClosed = options.onSessionClosed ?? (() => {})
    this.#onStateChanged = options.onStateChanged ?? (() => {})
    this.#onToolbarFocusRequested = options.onToolbarFocusRequested ?? (() => {})
    this.#previewServer = options.previewServer
    this.#probeLocalUrl = options.probeLocalUrl ?? probeBrowserLocalServer
    this.#sessions = new BrowserSessionRegistry({
      createId: this.#createId,
      maxSessions: 4,
    })
    this.#window = options.window
    this.#windowClosedListener = () => this.dispose()
    this.#windowUnavailableListener = () => {
      this.#windowUnavailable = true
      for (const session of this.#sessions.values())
        this.#detach(session)
    }
    this.#windowAvailableListener = () => {
      this.#windowUnavailable = false
      for (const session of this.#sessions.values()) {
        if (session.surfaceBounds)
          this.#attach(session, session.surfaceBounds)
      }
    }
    this.#window.once('closed', this.#windowClosedListener)
    this.#window.on('hide', this.#windowUnavailableListener)
    this.#window.on('minimize', this.#windowUnavailableListener)
    this.#window.on('restore', this.#windowAvailableListener)
    this.#window.on('show', this.#windowAvailableListener)
  }

  get isDisposed(): boolean {
    return this.#disposed
  }

  ensureSession(conversationId: string): DesktopBrowserState {
    return this.#ensureSession(conversationId, 'ephemeral')
  }

  async enablePersonalProfile(sessionId: string): Promise<DesktopBrowserState> {
    const current = this.#requireSession(sessionId)
    if (current.state.profileMode === 'personal')
      return snapshot(current.state)
    if (this.#personalSessionId && this.#sessions.get(this.#personalSessionId)) {
      throw new BrowserHostError(
        'BROWSER_SESSION_LIMIT_REACHED',
        'The personal browser profile is already open',
      )
    }

    if (current.state.controller === 'agent')
      this.#returnHumanControl(current, true)
    return this.#replaceSessionProfile(current, 'personal')
  }

  async resetPersonalProfile(sessionId: string): Promise<DesktopBrowserState> {
    const current = this.#requireSession(sessionId)
    if (current.state.profileMode === 'ephemeral')
      return snapshot(current.state)
    if (current.state.controller === 'agent')
      this.#returnHumanControl(current, true)
    try {
      await current.view.webContents.session.clearStorageData()
      await current.view.webContents.session.clearCache()
      current.view.webContents.session.flushStorageData()
    }
    catch {
      throw new BrowserHostError(
        'BROWSER_PAGE_FAILED',
        'Personal browser data could not be cleared',
      )
    }
    return this.#replaceSessionProfile(current, 'ephemeral')
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
        if (profileMode === 'personal')
          this.#personalSessionId = sessionId
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

  observe(input: BrowserObserveParams): Promise<BrowserObservation> {
    const session = this.#requireSession(input.sessionId)
    if (session.state.pageId !== input.pageId) {
      return Promise.reject(new BrowserHostError(
        'BROWSER_TARGET_STALE',
        'Browser page identity changed before observation',
      ))
    }
    if (session.state.status === 'error' && session.state.error) {
      return Promise.reject(new BrowserHostError(
        session.state.error.code,
        session.state.error.message,
      ))
    }
    this.#sessions.touch(input.sessionId)
    return session.semanticDriver.observe({
      maxElements: input.maxElements,
      pageId: session.state.pageId,
      sessionId: session.state.sessionId,
      status: session.state.status === 'idle' ? 'ready' : session.state.status,
      title: session.state.title,
      url: session.state.url,
    })
  }

  validateAction(input: BrowserValidateActionParams): void {
    const session = this.#requireSession(input.sessionId)
    this.#assertCurrentPage(session, input.pageId, 'before approved action validation')
    if (session.state.status === 'error' && session.state.error) {
      throw new BrowserHostError(
        session.state.error.code,
        session.state.error.message,
      )
    }
    this.#sessions.touch(input.sessionId)
    session.semanticDriver.validateAction({
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
        )
      }
      this.#sessions.touch(input.sessionId)
      const reference = {
        documentRevision: input.documentRevision,
        observationId: input.observationId,
      }
      let state: DesktopBrowserState

      switch (input.action.kind) {
        case 'navigate':
          session.semanticDriver.assertObservation(reference)
          state = await this.navigate(input.sessionId, input.action.url)
          break
        case 'back':
          session.semanticDriver.assertObservation(reference)
          this.goBack(input.sessionId)
          state = snapshot(session.state)
          break
        case 'forward':
          session.semanticDriver.assertObservation(reference)
          this.goForward(input.sessionId)
          state = snapshot(session.state)
          break
        case 'reload':
          session.semanticDriver.assertObservation(reference)
          this.reload(input.sessionId)
          state = snapshot(session.state)
          break
        case 'stop':
          session.semanticDriver.assertObservation(reference)
          this.stop(input.sessionId)
          state = snapshot(session.state)
          break
        case 'wait':
          session.semanticDriver.assertObservation(reference)
          await this.#waitForActionCondition(
            session,
            input.action.condition,
            input.action.timeoutMs,
            input.controlEpoch,
          )
          state = snapshot(session.state)
          break
        default:
          session.agentActionDepth += 1
          try {
            await session.semanticDriver.executeAction({
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
          session.semanticDriver.invalidateDocument()
          this.#refreshPageState(session)
          this.#publish(session)
          state = snapshot(session.state)
      }

      return {
        actionKind: input.action.kind,
        requiresObservation: true,
        state,
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
    return session.semanticDriver.resolveScreenshot(input)
  }

  async navigate(sessionId: string, rawUrl: string): Promise<DesktopBrowserState> {
    const session = this.#requireSession(sessionId)
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
      }
      session.state.status = 'error'
      this.#publish(session)
      throw new BrowserHostError(error.code, error.message)
    }
    if (!this.#shouldContinuePageAction(session, navigationSequence))
      return snapshot(session.state)
    if (isLoopbackBrowserUrl(url)) {
      const isReady = await this.#probeLocalUrl(url).catch(() => false)
      if (!this.#shouldContinuePageAction(session, navigationSequence))
        return snapshot(session.state)
      if (!isReady) {
        const message = 'Local browser server is unreachable'
        session.state.error = {
          code: 'BROWSER_LOCAL_SERVER_UNREACHABLE',
          message,
        }
        session.state.status = 'error'
        this.#publish(session)
        throw new BrowserHostError('BROWSER_LOCAL_SERVER_UNREACHABLE', message)
      }
    }

    session.state.url = url
    this.#publish(session)
    try {
      await session.view.webContents.loadURL(url)
      if (!this.#sessions.get(sessionId))
        throw this.#sessionNotFound(sessionId)
      if (!this.#isCurrentPageAction(session, navigationSequence))
        return snapshot(session.state)
      session.stoppedNavigationSequence = null
      this.#revokePreviewIfNavigatedAway(session, url)
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
        session.state.error = null
        session.state.status = session.state.url === 'about:blank' ? 'idle' : 'ready'
        this.#refreshPageState(session)
        this.#publish(session)
        return snapshot(session.state)
      }
      session.state.error = {
        code: 'BROWSER_PAGE_FAILED',
        message: diagnosticMessage(error),
      }
      session.state.status = 'error'
      this.#publish(session)
      throw new BrowserHostError('BROWSER_PAGE_FAILED', session.state.error.message)
    }
  }

  goBack(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    const history = session.view.webContents.navigationHistory
    if (!history.canGoBack())
      return
    this.#beginPageAction(session)
    history.goBack()
  }

  focusPage(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    if (!session.attached || !session.state.visible || session.view.webContents.isDestroyed())
      return
    this.#sessions.touch(sessionId)
    session.view.webContents.focus()
  }

  goForward(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    const history = session.view.webContents.navigationHistory
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
    session.view.webContents.reload()
  }

  stop(sessionId: string): void {
    const session = this.#requireSession(sessionId)
    if (session.state.status !== 'loading')
      return
    session.stoppedNavigationSequence = session.navigationSequence
    session.view.webContents.stop()
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
    const mount = await this.#previewServer.mount({
      ...grant,
      ownerSessionId: sessionId,
    })
    try {
      const state = await this.navigate(sessionId, mount.entryUrl)
      const previousToken = session.previewToken
      session.previewToken = mount.token
      if (previousToken && previousToken !== mount.token)
        this.#previewServer.revoke(previousToken)
      return state
    }
    catch (error) {
      this.#previewServer.revoke(mount.token)
      throw error
    }
  }

  #revokePreviewIfNavigatedAway(session: BrowserSession, url: string): void {
    const token = session.previewToken
    if (!token || isBrowserPreviewUrl(url, token))
      return
    this.#previewServer.revoke(token)
    session.previewToken = null
  }

  async #replaceSessionProfile(
    current: BrowserSession,
    profileMode: DesktopBrowserProfileMode,
  ): Promise<DesktopBrowserState> {
    const conversationId = current.state.conversationId
    const restoreBounds = current.state.visible && current.surfaceBounds
      ? { ...current.surfaceBounds }
      : null
    const restoreUrl = isBrowserPreviewUrl(current.state.url, current.previewToken)
      ? null
      : current.state.url
    this.#sessions.remove(current.state.sessionId)

    const state = this.#ensureSession(conversationId, profileMode)
    if (restoreBounds) {
      this.setSurface({
        bounds: restoreBounds,
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
    if (this.#window.isDestroyed()) {
      this.#detach(session)
      return
    }
    const bounds = clipSurfaceBounds(input.bounds, this.#window.getContentBounds())
    if (!bounds) {
      this.#hide(session)
      return
    }

    for (const other of this.#sessions.values()) {
      if (other !== session)
        this.#hide(other)
    }
    session.surfaceBounds = bounds
    this.#sessions.setProtected(session.state.sessionId, 'surface', true)
    this.#attach(session, bounds)
  }

  #attach(session: BrowserSession, bounds: Rectangle): void {
    if (this.#windowUnavailable || !this.#window.isVisible()) {
      this.#detach(session)
      return
    }
    if (!session.attached) {
      this.#window.contentView.addChildView(session.view as never)
      session.attached = true
    }
    session.view.setBounds(bounds)
    if (!session.state.visible) {
      session.state.visible = true
      this.#publish(session)
    }
  }

  async #waitForActionCondition(
    session: BrowserSession,
    condition: Extract<BrowserAction, { kind: 'wait' }>['condition'],
    timeoutMs: number,
    controlEpoch: number,
  ): Promise<void> {
    const initialUrl = session.state.url
    const deadline = Date.now() + timeoutMs
    while (true) {
      if (this.#sessions.get(session.state.sessionId) !== session)
        throw this.#sessionNotFound(session.state.sessionId)
      this.#assertAgentControl(session, controlEpoch)
      if (session.state.status === 'error' && session.state.error) {
        throw new BrowserHostError(
          session.state.error.code,
          session.state.error.message,
        )
      }
      if (
        (condition === 'page-ready' && session.state.status === 'ready')
        || (condition === 'url-changed' && session.state.url !== initialUrl)
      ) {
        return
      }
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        throw new BrowserHostError(
          'BROWSER_PAGE_FAILED',
          'Browser wait condition timed out',
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
    this.#window.off('hide', this.#windowUnavailableListener)
    this.#window.off('minimize', this.#windowUnavailableListener)
    this.#window.off('restore', this.#windowAvailableListener)
    this.#window.off('show', this.#windowAvailableListener)
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
    const view = this.#createView({
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        devTools: false,
        nodeIntegration: false,
        partition: profileMode === 'personal'
          ? BROWSER_PERSONAL_PARTITION
          : `buddy-browser:${sessionId}`,
        sandbox: true,
        webSecurity: true,
      },
    })
    const session: BrowserSession = {
      actionTail: Promise.resolve(),
      agentActionDepth: 0,
      attached: false,
      listeners: [],
      navigationSequence: 0,
      previewToken: null,
      securityPolicy: null,
      semanticDriver: new SemanticBrowserDriver({
        createId: this.#createId,
        page: view.webContents,
      }),
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
      surfaceBounds: null,
      view,
    }
    session.securityPolicy = new BrowserSecurityPolicy({
      onCertificateError: ({ error, url }) => {
        session.state.error = {
          code: 'BROWSER_CERTIFICATE_ERROR',
          message: error,
        }
        session.state.status = 'error'
        session.state.url = normalizeWebUrl(url) ?? session.state.url
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
        }
        session.state.status = 'error'
        this.#publish(session)
      },
      page: view.webContents,
      session: view.webContents.session,
    })
    this.#configureSession(session)
    return session
  }

  #teardownSession(
    session: BrowserSession,
    reason: BrowserSessionTeardownReason,
  ): void {
    if (this.#personalSessionId === session.state.sessionId)
      this.#personalSessionId = null
    if (reason === 'evicted') {
      this.#evictedConversationIds.add(session.state.conversationId)
      session.state.error = {
        code: 'BROWSER_SESSION_EVICTED',
        message: 'Inactive browser session was released',
      }
      session.state.status = 'error'
      this.#publish(session)
    }
    this.#onSessionClosed(snapshot(session.state), reason)
    this.#previewServer.revokeSession(session.state.sessionId)
    session.previewToken = null
    session.surfaceBounds = null
    this.#detach(session)
    session.semanticDriver.dispose()
    session.securityPolicy?.dispose()
    session.securityPolicy = null
    for (const removeListener of session.listeners)
      removeListener()
    session.listeners = []
    if (!session.view.webContents.isDestroyed())
      session.view.webContents.close()
  }

  #configureSession(session: BrowserSession): void {
    this.#listen(
      session,
      'before-input-event',
      (event: { preventDefault: () => void }, input: Input) => {
        if (session.agentActionDepth > 0)
          return
        if (input.type === 'keyDown' || input.type === 'rawKeyDown')
          this.#acceptHumanPageInput(session)
        if (
          !session.attached
          || !session.state.visible
          || input.type !== 'keyDown'
          || input.key !== 'Escape'
          || input.isAutoRepeat
          || input.isComposing
          || input.alt
          || input.control
          || input.meta
          || input.shift
        ) {
          return
        }
        event.preventDefault()
        this.#sessions.touch(session.state.sessionId)
        this.#window.webContents.focus()
        this.#onToolbarFocusRequested({
          conversationId: session.state.conversationId,
          sessionId: session.state.sessionId,
        })
      },
    )
    this.#listen(
      session,
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
    this.#listen(session, 'did-start-loading', () => {
      if (session.state.status !== 'loading') {
        session.navigationSequence += 1
        session.semanticDriver.invalidateDocument()
        session.stoppedNavigationSequence = null
      }
      session.state.error = null
      session.state.status = 'loading'
      this.#refreshPageState(session)
      this.#publish(session)
    })
    this.#listen(session, 'did-stop-loading', () => {
      this.#removeBootstrapHistory(session)
      const isPreparingInitialNavigation = session.state.status === 'loading'
        && session.state.url === 'about:blank'
      if (
        !isPreparingInitialNavigation
        && (!session.state.error || session.state.error.code === 'BROWSER_PERMISSION_DENIED')
      ) {
        session.state.status = session.state.url === 'about:blank' ? 'idle' : 'ready'
      }
      this.#refreshPageState(session)
      this.#publish(session)
    })
    this.#listen(session, 'page-title-updated', (_event, title: string) => {
      session.state.title = title.slice(0, 512)
      this.#publish(session)
    })
    const updateNavigation = (_event: unknown, url: string) => {
      const normalizedUrl = normalizeWebUrl(url)
      if (!normalizedUrl)
        return
      this.#refreshPageState(session)
      session.state.url = normalizedUrl
      this.#publish(session)
    }
    this.#listen(session, 'did-navigate', updateNavigation)
    this.#listen(
      session,
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
        session.semanticDriver.invalidateDocument()
        this.#publish(session)
      },
    )
    this.#listen(
      session,
      'did-navigate-in-page',
      (_event: unknown, url: string, isMainFrame: boolean) => {
        session.semanticDriver.invalidateDocument()
        if (isMainFrame)
          updateNavigation(_event, url)
        else
          this.#publish(session)
      },
    )
    const blockUnsafeNavigation = (event: { preventDefault: () => void }, url: string) => {
      if (normalizeWebUrl(url))
        return
      event.preventDefault()
      session.state.error = {
        code: 'BROWSER_NAVIGATION_BLOCKED',
        message: 'Browser navigation only supports HTTP and HTTPS URLs',
      }
      session.state.status = 'error'
      this.#publish(session)
    }
    this.#listen(session, 'will-navigate', blockUnsafeNavigation)
    this.#listen(session, 'will-redirect', blockUnsafeNavigation)
    this.#listen(
      session,
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
        session.state.error = {
          code: 'BROWSER_PAGE_FAILED',
          message: errorDescription.slice(0, 1_024),
        }
        session.state.status = 'error'
        session.state.url = normalizeWebUrl(validatedUrl) ?? session.state.url
        this.#publish(session)
      },
    )
    this.#listen(session, 'render-process-gone', () => {
      session.semanticDriver.invalidateDocument()
      session.state.error = {
        code: 'BROWSER_PAGE_CRASHED',
        message: 'Browser page renderer exited',
      }
      session.state.status = 'error'
      this.#publish(session)
    })
    this.#listen(session, 'unresponsive', () => {
      session.state.error = {
        code: 'BROWSER_PAGE_UNRESPONSIVE',
        message: 'Browser page is not responding',
      }
      session.state.status = 'error'
      this.#publish(session)
    })
    this.#listen(session, 'responsive', () => {
      if (session.state.error?.code !== 'BROWSER_PAGE_UNRESPONSIVE')
        return
      session.state.error = null
      session.state.status = 'ready'
      this.#refreshPageState(session)
      this.#publish(session)
    })
  }

  #detach(session: BrowserSession): void {
    if (session.attached && !this.#window.isDestroyed())
      this.#window.contentView.removeChildView(session.view as never)
    session.attached = false
    if (session.state.visible) {
      session.state.visible = false
      this.#publish(session)
    }
  }

  #hide(session: BrowserSession): void {
    session.surfaceBounds = null
    this.#sessions.setProtected(session.state.sessionId, 'surface', false)
    this.#detach(session)
  }

  #listen(
    session: BrowserSession,
    event: string,
    listener: (...args: never[]) => void,
  ): void {
    session.view.webContents.on(event, listener)
    session.listeners.push(() => session.view.webContents.off(event, listener))
  }

  #beginPageAction(session: BrowserSession): number {
    this.#sessions.touch(session.state.sessionId)
    session.navigationSequence += 1
    session.semanticDriver.invalidateDocument()
    session.stoppedNavigationSequence = null
    session.state.error = null
    session.state.status = 'loading'
    this.#publish(session)
    return session.navigationSequence
  }

  #isCurrentPageAction(session: BrowserSession, navigationSequence: number): boolean {
    return session.navigationSequence === navigationSequence
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
    const history = session.view.webContents.navigationHistory
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
    const page = session.view.webContents
    if (page.isDestroyed())
      return
    session.state.canGoBack = page.navigationHistory.canGoBack()
    session.state.canGoForward = page.navigationHistory.canGoForward()
    session.state.title = page.getTitle().slice(0, 512)
    const pageUrl = page.getURL()
    const normalizedPageUrl = normalizeWebUrl(pageUrl)
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
    if (!session.attached || !session.state.visible)
      return
    this.#sessions.touch(session.state.sessionId)
    if (session.state.controller === 'agent') {
      this.#returnHumanControl(session, true)
      return
    }
    session.semanticDriver.invalidateDocument()
  }

  #returnHumanControl(
    session: BrowserSession,
    invalidateObservation = false,
  ): DesktopBrowserState {
    this.#advanceControlEpoch(session)
    session.state.controller = 'human'
    if (invalidateObservation)
      session.semanticDriver.invalidateDocument()
    this.#sessions.setProtected(session.state.sessionId, 'runtime', false)
    this.#publish(session)
    return snapshot(session.state)
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

function normalizeWebUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return null
    return url.toString()
  }
  catch {
    return null
  }
}

function isBrowserPreviewUrl(rawUrl: string, token: string | null): boolean {
  if (!token || rawUrl === 'about:blank')
    return false
  try {
    return new URL(rawUrl).pathname.startsWith(`/preview/${token}/`)
  }
  catch {
    return false
  }
}

function clipSurfaceBounds(bounds: Rectangle, contentBounds: Rectangle): Rectangle | null {
  const values = [bounds.height, bounds.width, bounds.x, bounds.y]
  if (values.some(value => !Number.isFinite(value)))
    return null
  const contentWidth = Math.max(0, Math.trunc(contentBounds.width))
  const contentHeight = Math.max(0, Math.trunc(contentBounds.height))
  const x = Math.max(0, Math.trunc(bounds.x))
  const y = Math.max(0, Math.trunc(bounds.y))
  if (x >= contentWidth || y >= contentHeight)
    return null
  const width = Math.min(Math.max(0, Math.trunc(bounds.width)), contentWidth - x)
  const height = Math.min(Math.max(0, Math.trunc(bounds.height)), contentHeight - y)
  return width > 0 && height > 0 ? { height, width, x, y } : null
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
  if (isLoopbackBrowserUrl(rawUrl))
    return { kind: 'local', origin }
  return {
    kind: url.protocol === 'https:' ? 'secure' : 'insecure',
    origin,
  }
}

function diagnosticMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_024)
    : 'Browser page failed to load'
}

function wait(durationMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, durationMs))
}
