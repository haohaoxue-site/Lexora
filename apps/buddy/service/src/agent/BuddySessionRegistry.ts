import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddySessionShutdownReason } from './createBuddySession'

export interface BuddySessionIdentity {
  branchId: string
  canonicalRoot: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  resourceRevision: string
}

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
  readonly #sessions = new Map<string, Promise<BuddySessionBinding<TSession>>>()
  readonly #lastUsed = new Map<string, number>()
  readonly #maxSessions: number
  #accessSequence = 0

  constructor(options: BuddySessionRegistryOptions = {}) {
    this.#maxSessions = Math.max(1, Math.floor(options.maxSessions ?? 8))
  }

  async getOrCreate(
    identity: BuddySessionIdentity,
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
      this.#touch(sessionKey)
      return existing
    }

    for (const [candidateKey, candidateIdentity] of [...this.#identities]) {
      if (createBranchKey(candidateIdentity) === branchKey)
        await this.#disposeSession(candidateKey, 'resource-change')
    }
    this.#branchRoots.set(branchKey, identity.canonicalRoot)

    const pending = factory()
    this.#sessions.set(sessionKey, pending)
    this.#identities.set(sessionKey, identity)
    try {
      const binding = await pending
      this.#touch(sessionKey)
      await this.#evictIdleSessions(sessionKey)
      return binding
    }
    catch (error) {
      this.#sessions.delete(sessionKey)
      this.#identities.delete(sessionKey)
      this.#lastUsed.delete(sessionKey)
      if (![...this.#sessions.keys()].some(key => key.startsWith(`${branchKey}\0`)))
        this.#branchRoots.delete(branchKey)
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
    const bindings = await Promise.allSettled(this.#sessions.values())
    await Promise.allSettled(bindings.flatMap(binding => binding.status === 'fulfilled'
      ? [binding.value.session.shutdown('quit')]
      : []))
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
    for (const [sessionKey, identity] of this.#identities) {
      if (!predicate(identity))
        continue
      count += 1
      const branchKey = createBranchKey(identity)
      if (this.#activeRuns.has(branchKey)) {
        this.#pendingInvalidations.add(sessionKey)
        continue
      }
      await this.#disposeSession(sessionKey, 'invalidate')
    }
    return count
  }

  async #flushInvalidations(branchKey: string): Promise<void> {
    for (const sessionKey of [...this.#pendingInvalidations]) {
      const identity = this.#identities.get(sessionKey)
      if (!identity || createBranchKey(identity) !== branchKey)
        continue
      this.#pendingInvalidations.delete(sessionKey)
      await this.#disposeSession(sessionKey, 'invalidate')
    }
  }

  async #disposeSession(
    sessionKey: string,
    reason: BuddySessionShutdownReason,
  ): Promise<void> {
    const pending = this.#sessions.get(sessionKey)
    const identity = this.#identities.get(sessionKey)
    this.#sessions.delete(sessionKey)
    this.#identities.delete(sessionKey)
    this.#lastUsed.delete(sessionKey)
    this.#pendingInvalidations.delete(sessionKey)
    const binding = pending ? await pending.catch(() => null) : null
    try {
      await binding?.session.shutdown(reason)
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
      await this.#disposeSession(candidate, 'evict')
    }
  }

  #touch(sessionKey: string): void {
    this.#accessSequence += 1
    this.#lastUsed.set(sessionKey, this.#accessSequence)
  }
}

export class BuddySessionBindingError extends Error {
  readonly code = 'SESSION_BINDING_MISMATCH'

  constructor() {
    super('Lexora Buddy conversation branch is bound to another directory')
    this.name = 'BuddySessionBindingError'
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
    identity.resourceRevision,
  ].join('\0')
}
