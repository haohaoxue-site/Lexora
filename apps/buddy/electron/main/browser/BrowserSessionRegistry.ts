import { randomUUID } from 'node:crypto'

export type BrowserSessionProtection = 'runtime' | 'surface'
export type BrowserSessionTeardownReason = 'closed' | 'disposed' | 'evicted'

export interface BrowserSessionFactoryContext {
  conversationId: string
  sessionId: string
}

export interface BrowserSessionFactoryResult<Session> {
  session: Session
  teardown: (reason: BrowserSessionTeardownReason) => void
}

interface BrowserSessionEntry<Session> extends BrowserSessionFactoryContext {
  lastUsed: number
  protections: Set<BrowserSessionProtection>
  session: Session
  teardown: (reason: BrowserSessionTeardownReason) => void
}

interface BrowserSessionRegistryOptions {
  createId?: () => string
  maxSessions?: number
}

export class BrowserSessionRegistryError extends Error {
  readonly code = 'BROWSER_SESSION_LIMIT_REACHED' as const

  constructor() {
    super('Every browser session is protected')
    this.name = 'BrowserSessionRegistryError'
  }
}

export class BrowserSessionRegistry<Session> {
  readonly #byConversationId = new Map<string, BrowserSessionEntry<Session>>()
  readonly #bySessionId = new Map<string, BrowserSessionEntry<Session>>()
  readonly #createId: () => string
  readonly #maxSessions: number
  #clock = 0
  #disposed = false

  constructor(options: BrowserSessionRegistryOptions = {}) {
    this.#createId = options.createId ?? randomUUID
    this.#maxSessions = options.maxSessions ?? 4
    if (!Number.isInteger(this.#maxSessions) || this.#maxSessions < 1)
      throw new RangeError('Browser session limit must be a positive integer')
  }

  ensure(
    conversationId: string,
    createSession: (
      context: BrowserSessionFactoryContext,
    ) => BrowserSessionFactoryResult<Session>,
  ): Session {
    this.#assertActive()
    const existing = this.#byConversationId.get(conversationId)
    if (existing) {
      this.#touchEntry(existing)
      return existing.session
    }

    const evictionCandidate = this.#findEvictionCandidate()
    if (this.#bySessionId.size >= this.#maxSessions && !evictionCandidate)
      throw new BrowserSessionRegistryError()

    const sessionId = this.#createId()
    const created = createSession({ conversationId, sessionId })
    if (evictionCandidate)
      this.#removeEntry(evictionCandidate, 'evicted')

    const entry: BrowserSessionEntry<Session> = {
      conversationId,
      lastUsed: ++this.#clock,
      protections: new Set(),
      session: created.session,
      sessionId,
      teardown: created.teardown,
    }
    this.#byConversationId.set(conversationId, entry)
    this.#bySessionId.set(sessionId, entry)
    return entry.session
  }

  get(sessionId: string): Session | undefined {
    return this.#bySessionId.get(sessionId)?.session
  }

  getByConversation(conversationId: string): Session | undefined {
    return this.#byConversationId.get(conversationId)?.session
  }

  touch(sessionId: string): boolean {
    const entry = this.#bySessionId.get(sessionId)
    if (!entry)
      return false
    this.#touchEntry(entry)
    return true
  }

  setProtected(
    sessionId: string,
    protection: BrowserSessionProtection,
    isProtected: boolean,
  ): boolean {
    const entry = this.#bySessionId.get(sessionId)
    if (!entry)
      return false
    if (isProtected)
      entry.protections.add(protection)
    else
      entry.protections.delete(protection)
    this.#touchEntry(entry)
    return true
  }

  remove(sessionId: string): boolean {
    const entry = this.#bySessionId.get(sessionId)
    if (!entry)
      return false
    this.#removeEntry(entry, 'closed')
    return true
  }

  values(): Session[] {
    return [...this.#bySessionId.values()].map(entry => entry.session)
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true
    for (const entry of [...this.#bySessionId.values()])
      this.#removeEntry(entry, 'disposed')
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new Error('Browser session registry is disposed')
  }

  #findEvictionCandidate(): BrowserSessionEntry<Session> | undefined {
    if (this.#bySessionId.size < this.#maxSessions)
      return undefined
    return [...this.#bySessionId.values()]
      .filter(entry => entry.protections.size === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed)
      .at(0)
  }

  #removeEntry(
    entry: BrowserSessionEntry<Session>,
    reason: BrowserSessionTeardownReason,
  ): void {
    this.#byConversationId.delete(entry.conversationId)
    this.#bySessionId.delete(entry.sessionId)
    entry.teardown(reason)
  }

  #touchEntry(entry: BrowserSessionEntry<Session>): void {
    entry.lastUsed = ++this.#clock
  }
}
