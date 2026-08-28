import type { BuddySessionIdentity } from './BuddySessionBlueprint'
import type { BuddySessionShutdownReason } from './createBuddySession'

export type { BuddySessionIdentity } from './BuddySessionBlueprint'

export interface BuddySessionBinding<TSession> {
  piSessionFile: string
  recoveredFromProductHistory?: boolean
  recoveryDegradation?: {
    missingAttachmentIds: readonly string[]
    recoveredImageCount: number
  }
  session: TSession
}

export interface DisposableBuddySession {
  shutdown: (reason: BuddySessionShutdownReason) => Promise<void>
}

interface BuddySessionEntry<TSession> {
  binding: BuddySessionBinding<TSession> | null
  promise: Promise<BuddySessionBinding<TSession>>
  requestedPiSessionFile: string | null
  reject: (reason: unknown) => void
  resolve: (binding: BuddySessionBinding<TSession>) => void
  shutdownReason: BuddySessionShutdownReason | null
  status: 'disposed' | 'failed' | 'pending' | 'ready'
}

interface ActiveRun {
  runId: string
  signal?: AbortSignal
}

export interface BuddySessionRegistryOptions {
  maxSessions?: number
}

export class BuddySessionRegistry<TSession extends DisposableBuddySession> {
  readonly #activeRuns = new Map<string, ActiveRun>()
  readonly #branchRoots = new Map<string, string>()
  readonly #identities = new Map<string, BuddySessionIdentity>()
  readonly #pendingInvalidations = new Set<string>()
  readonly #runTails = new Map<string, Promise<void>>()
  readonly #sessions = new Map<string, BuddySessionEntry<TSession>>()
  readonly #lastUsed = new Map<string, number>()
  readonly #maxSessions: number
  #accessSequence = 0

  constructor(options: BuddySessionRegistryOptions = {}) {
    this.#maxSessions = Math.max(1, Math.floor(options.maxSessions ?? 8))
  }

  async getOrCreate(
    identity: BuddySessionIdentity,
    piSessionFile: string | null,
    factory: () => Promise<BuddySessionBinding<TSession>>,
  ): Promise<BuddySessionBinding<TSession>> {
    const branchKey = createBranchKey(identity)
    const boundRoot = this.#branchRoots.get(branchKey)
    if (boundRoot !== undefined && boundRoot !== identity.canonicalRoot)
      throw new BuddySessionBindingError()
    this.#branchRoots.set(branchKey, identity.canonicalRoot)

    const sessionKey = createSessionKey(identity)
    const existing = this.#sessions.get(sessionKey)
    if (existing) {
      if (!matchesPiSessionBinding(existing, piSessionFile)) {
        await this.#settleSessionDisposal(sessionKey, 'invalidate', existing)
        throw new BuddySessionBindingError()
      }
      this.#touch(sessionKey)
      return existing.promise
    }

    for (const [candidateKey, candidateIdentity] of [...this.#identities]) {
      const candidate = this.#sessions.get(candidateKey)
      if (candidate && createBranchKey(candidateIdentity) === branchKey)
        await this.#settleSessionDisposal(candidateKey, 'resource-change', candidate)
    }
    this.#branchRoots.set(branchKey, identity.canonicalRoot)

    const entry = this.#createEntry(piSessionFile, factory)
    this.#sessions.set(sessionKey, entry)
    this.#identities.set(sessionKey, identity)
    try {
      const binding = await entry.promise
      if (this.#sessions.get(sessionKey) !== entry)
        throw new BuddySessionLifecycleAbortError()
      this.#touch(sessionKey)
      await this.#evictIdleSessions(sessionKey)
      return binding
    }
    catch (error) {
      if (this.#sessions.get(sessionKey) === entry) {
        this.#sessions.delete(sessionKey)
        this.#identities.delete(sessionKey)
        this.#lastUsed.delete(sessionKey)
        if (![...this.#identities.values()].some(candidate => createBranchKey(candidate) === branchKey))
          this.#branchRoots.delete(branchKey)
      }
      throw error
    }
  }

  getActiveRun(identity: BuddySessionIdentity): ActiveRun | undefined {
    return this.#activeRuns.get(createBranchKey(identity))
  }

  invalidateAll(): Promise<number> {
    return this.#invalidate(() => true)
  }

  invalidateRoot(canonicalRoot: string): Promise<number> {
    return this.#invalidate(identity => identity.canonicalRoot === canonicalRoot)
  }

  invalidateConversation(conversationId: string): Promise<number> {
    return this.#invalidate(identity => identity.conversationId === conversationId)
  }

  invalidateSession(identity: BuddySessionIdentity): Promise<number> {
    const sessionKey = createSessionKey(identity)
    return this.#invalidate(candidate => createSessionKey(candidate) === sessionKey)
  }

  async withBranchRun<TResult>(
    identity: BuddySessionIdentity,
    runId: string,
    signal: AbortSignal | undefined,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const branchKey = createBranchKey(identity)
    const previous = this.#runTails.get(branchKey) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => current)
    this.#runTails.set(branchKey, tail)

    await previous
    try {
      signal?.throwIfAborted()
      this.#activeRuns.set(branchKey, { runId, signal })
      return await operation()
    }
    finally {
      this.#activeRuns.delete(branchKey)
      try {
        await this.#flushInvalidations(branchKey)
        await this.#evictIdleSessions()
      }
      finally {
        release()
        if (this.#runTails.get(branchKey) === tail)
          this.#runTails.delete(branchKey)
      }
    }
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.#sessions.entries()].map(([sessionKey, entry]) =>
      this.#disposeSession(sessionKey, 'quit', entry)))
    this.#activeRuns.clear()
    this.#branchRoots.clear()
    this.#identities.clear()
    this.#lastUsed.clear()
    this.#pendingInvalidations.clear()
    this.#runTails.clear()
    this.#sessions.clear()
  }

  async #invalidate(predicate: (identity: BuddySessionIdentity) => boolean): Promise<number> {
    let count = 0
    const candidates = [...this.#identities]
      .map(([sessionKey, identity]) => ({
        entry: this.#sessions.get(sessionKey),
        identity,
        sessionKey,
      }))
    for (const { entry, identity, sessionKey } of candidates) {
      if (!predicate(identity))
        continue
      count += 1
      const branchKey = createBranchKey(identity)
      if (this.#activeRuns.has(branchKey)) {
        this.#pendingInvalidations.add(sessionKey)
        continue
      }
      if (entry)
        await this.#settleSessionDisposal(sessionKey, 'invalidate', entry)
    }
    return count
  }

  async #flushInvalidations(branchKey: string): Promise<void> {
    for (const sessionKey of [...this.#pendingInvalidations]) {
      const identity = this.#identities.get(sessionKey)
      if (!identity || createBranchKey(identity) !== branchKey)
        continue
      this.#pendingInvalidations.delete(sessionKey)
      const entry = this.#sessions.get(sessionKey)
      if (entry)
        await this.#settleSessionDisposal(sessionKey, 'invalidate', entry)
    }
  }

  async #disposeSession(
    sessionKey: string,
    reason: BuddySessionShutdownReason,
    expectedEntry: BuddySessionEntry<TSession>,
  ): Promise<void> {
    const entry = this.#sessions.get(sessionKey)
    if (entry !== expectedEntry)
      return
    const identity = this.#identities.get(sessionKey)
    this.#sessions.delete(sessionKey)
    this.#identities.delete(sessionKey)
    this.#lastUsed.delete(sessionKey)
    this.#pendingInvalidations.delete(sessionKey)
    try {
      await this.#disposeEntry(entry, reason)
    }
    finally {
      if (identity) {
        const branchKey = createBranchKey(identity)
        if (![...this.#identities.values()].some(candidate => createBranchKey(candidate) === branchKey))
          this.#branchRoots.delete(branchKey)
      }
    }
  }

  async #evictIdleSessions(protectedKey?: string): Promise<void> {
    while (this.#sessions.size > this.#maxSessions) {
      const candidate = [...this.#lastUsed.entries()]
        .filter(([sessionKey]) => sessionKey !== protectedKey)
        .filter(([sessionKey]) => {
          const identity = this.#identities.get(sessionKey)
          return identity && !this.#activeRuns.has(createBranchKey(identity))
        })
        .sort((left, right) => left[1] - right[1])[0]?.[0]
      if (!candidate)
        return
      const entry = this.#sessions.get(candidate)
      if (entry)
        await this.#settleSessionDisposal(candidate, 'evict', entry)
    }
  }

  async #settleSessionDisposal(
    sessionKey: string,
    reason: BuddySessionShutdownReason,
    entry: BuddySessionEntry<TSession>,
  ): Promise<void> {
    await this.#disposeSession(sessionKey, reason, entry).catch(() => {})
  }

  #createEntry(
    requestedPiSessionFile: string | null,
    factory: () => Promise<BuddySessionBinding<TSession>>,
  ): BuddySessionEntry<TSession> {
    let reject!: (reason: unknown) => void
    let resolve!: (binding: BuddySessionBinding<TSession>) => void
    const promise = new Promise<BuddySessionBinding<TSession>>((resolvePromise, rejectPromise) => {
      reject = rejectPromise
      resolve = resolvePromise
    })
    const entry: BuddySessionEntry<TSession> = {
      binding: null,
      promise,
      requestedPiSessionFile,
      reject,
      resolve,
      shutdownReason: null,
      status: 'pending',
    }
    let factoryPromise: Promise<BuddySessionBinding<TSession>>
    try {
      factoryPromise = factory()
    }
    catch (error) {
      factoryPromise = Promise.reject(error)
    }
    void factoryPromise.then(
      (binding) => {
        if (entry.status === 'disposed') {
          const reason = entry.shutdownReason ?? 'invalidate'
          void (async () => binding.session.shutdown(reason))().catch(() => {})
          return
        }
        entry.binding = binding
        entry.status = 'ready'
        entry.resolve(binding)
      },
      (error) => {
        if (entry.status !== 'pending')
          return
        entry.status = 'failed'
        entry.reject(error)
      },
    )
    return entry
  }

  async #disposeEntry(
    entry: BuddySessionEntry<TSession>,
    reason: BuddySessionShutdownReason,
  ): Promise<void> {
    if (entry.status === 'disposed')
      return
    if (entry.status === 'pending') {
      entry.status = 'disposed'
      entry.shutdownReason = reason
      entry.reject(new BuddySessionLifecycleAbortError())
      return
    }
    const binding = entry.binding
    entry.status = 'disposed'
    entry.shutdownReason = reason
    if (binding)
      await binding.session.shutdown(reason)
  }

  #touch(sessionKey: string): void {
    this.#accessSequence += 1
    this.#lastUsed.set(sessionKey, this.#accessSequence)
  }
}

export class BuddySessionBindingError extends Error {
  readonly code = 'SESSION_BINDING_MISMATCH'

  constructor() {
    super('Lexora Buddy session binding does not match the conversation branch')
    this.name = 'BuddySessionBindingError'
  }
}

class BuddySessionLifecycleAbortError extends Error {
  constructor() {
    super('Lexora Buddy session lifecycle ended before startup completed')
    this.name = 'AbortError'
  }
}

function createBranchKey(identity: BuddySessionIdentity): string {
  return `${identity.conversationId}\0${identity.branchId}`
}

function createSessionKey(identity: BuddySessionIdentity): string {
  return [
    createBranchKey(identity),
    identity.canonicalRoot,
    identity.executionProfile,
    identity.sessionMode,
    identity.resourceRevision,
  ].join('\0')
}

function matchesPiSessionBinding<TSession>(
  entry: BuddySessionEntry<TSession>,
  piSessionFile: string | null,
): boolean {
  return entry.status === 'ready'
    ? entry.binding?.piSessionFile === piSessionFile
    : entry.requestedPiSessionFile === piSessionFile
}
