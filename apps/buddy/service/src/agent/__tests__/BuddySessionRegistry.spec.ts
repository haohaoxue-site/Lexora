import { describe, expect, it, vi } from 'vitest'

import { BuddySessionRegistry } from '../BuddySessionRegistry'

describe('buddySessionRegistry', () => {
  it('creates one Pi session binding for the same Buddy branch', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    let creates = 0
    const identity = {
      branchId: 'branch-1',
      canonicalRoot: '/workspace/space',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write' as const,
      grantRevision: 'grants-1',
      resourceRevision: 'resources-1',
      scratchRoot: '/workspace/scratch',
      sessionMode: 'interactive' as const,
      spaceId: null,
    }

    const [first, second] = await Promise.all([
      registry.getOrCreate(identity, null, async () => {
        creates += 1
        return { piSessionFile: '/sessions/one.jsonl', session: new TestSession() }
      }),
      registry.getOrCreate(identity, null, async () => {
        creates += 1
        return { piSessionFile: '/sessions/two.jsonl', session: new TestSession() }
      }),
    ])

    expect(creates).toBe(1)
    expect(first).toBe(second)
    expect(first.piSessionFile).toBe('/sessions/one.jsonl')
  })

  it('replaces resources when the previous session shutdown fails', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    const firstSession = new FailingShutdownSession()
    const secondSession = new TestSession()
    const firstIdentity = identity('branch-1')
    await registry.getOrCreate(firstIdentity, null, async () => ({
      piSessionFile: '/sessions/one.jsonl',
      session: firstSession,
    }))

    const replacement = await registry.getOrCreate({
      ...firstIdentity,
      resourceRevision: 'resources-2',
    }, '/sessions/one.jsonl', async () => ({
      piSessionFile: '/sessions/one.jsonl',
      session: secondSession,
    }))

    expect(replacement.session).toBe(secondSession)
    expect(firstSession.shutdownReasons).toEqual(['resource-change'])
  })

  it('serializes runs on one branch while allowing another branch to proceed', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const first = registry.withBranchRun(identity('branch-1'), 'run-1', undefined, async () => {
      order.push('first:start')
      await firstGate
      order.push('first:end')
    })
    const second = registry.withBranchRun(identity('branch-1'), 'run-2', undefined, async () => {
      order.push('second')
    })
    const otherBranch = registry.withBranchRun(identity('branch-2'), 'run-3', undefined, async () => {
      order.push('other')
    })
    await vi.waitUntil(() => order.includes('first:start') && order.includes('other'))
    expect(order).not.toContain('second')

    releaseFirst()
    await Promise.all([first, second, otherBranch])
    expect(order).toEqual(['first:start', 'other', 'first:end', 'second'])
  })

  it('does not rebind an existing Buddy branch to another directory', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    await registry.getOrCreate(identity('branch-1'), null, async () => ({
      piSessionFile: '/sessions/one.jsonl',
      session: new TestSession(),
    }))

    await expect(registry.getOrCreate({
      ...identity('branch-1'),
      canonicalRoot: '/workspace/other',
    }, '/sessions/one.jsonl', async () => ({
      piSessionFile: '/sessions/two.jsonl',
      session: new TestSession(),
    }))).rejects.toMatchObject({ code: 'SESSION_BINDING_MISMATCH' })
  })

  it('defers invalidation until the active branch run settles', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    const session = new TestSession()
    const bound = identity('branch-1')
    await registry.getOrCreate(bound, null, async () => ({
      piSessionFile: '/sessions/one.jsonl',
      session,
    }))
    let invalidate!: () => void
    const gate = new Promise<void>((resolve) => {
      invalidate = resolve
    })
    const run = registry.withBranchRun(bound, 'run-1', undefined, async () => {
      await gate
    })
    await vi.waitUntil(() => registry.getActiveRun(bound)?.runId === 'run-1')

    expect(await registry.invalidateAll()).toBe(1)
    expect(session.shutdownReasons).toEqual([])
    invalidate()
    await run
    expect(session.shutdownReasons).toEqual(['invalidate'])
  })

  it('invalidates every selected session when one shutdown fails', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    const first = new FailingShutdownSession()
    const second = new TestSession()
    await registry.getOrCreate(identity('branch-1'), null, async () => ({
      piSessionFile: '/sessions/one.jsonl',
      session: first,
    }))
    await registry.getOrCreate(identity('branch-2'), null, async () => ({
      piSessionFile: '/sessions/two.jsonl',
      session: second,
    }))

    await expect(registry.invalidateAll()).resolves.toBe(2)
    expect(first.shutdownReasons).toEqual(['invalidate'])
    expect(second.shutdownReasons).toEqual(['invalidate'])
  })

  it('invalidates a pending session without waiting and shuts down a late factory result', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    const session = new TestSession()
    let resolveFactory!: (binding: {
      piSessionFile: string
      session: TestSession
    }) => void
    const creation = registry.getOrCreate(identity('branch-1'), null, () => new Promise((resolve) => {
      resolveFactory = resolve
    }))
    const creationOutcomePromise = toOutcome(creation)

    const invalidation = registry.invalidateAll()
    const invalidationOutcome = await observeThroughNextTurn(invalidation)
    resolveFactory({ piSessionFile: '/sessions/one.jsonl', session })
    const creationOutcome = await creationOutcomePromise
    await Promise.allSettled([invalidation])
    await vi.waitUntil(() => session.shutdownReasons.length === 1)

    expect(invalidationOutcome).toEqual({ status: 'fulfilled', value: 1 })
    expect(creationOutcome.status).toBe('rejected')
    expect(session.shutdownReasons).toEqual(['invalidate'])
  })

  it('waits for a late factory result to close before reporting disposal complete', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    const session = new TestSession()
    let resolveFactory!: (binding: {
      piSessionFile: string
      session: TestSession
    }) => void
    const creation = registry.getOrCreate(identity('branch-1'), null, () => new Promise((resolve) => {
      resolveFactory = resolve
    }))
    const creationOutcomePromise = toOutcome(creation)

    const disposal = registry.dispose()
    const disposalOutcome = await observeThroughNextTurn(disposal)
    resolveFactory({ piSessionFile: '/sessions/one.jsonl', session })
    const creationOutcome = await creationOutcomePromise
    await Promise.allSettled([disposal])
    await vi.waitUntil(() => session.shutdownReasons.length === 1)

    expect(disposalOutcome).toEqual({ status: 'pending' })
    expect(creationOutcome.status).toBe('rejected')
    expect(session.shutdownReasons).toEqual(['quit'])
  })

  it('does not let a stale factory failure delete its replacement session', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    let rejectFactory!: (error: Error) => void
    const staleCreation = registry.getOrCreate(identity('branch-1'), null, () => new Promise((_resolve, reject) => {
      rejectFactory = reject
    }))
    const staleCreationOutcome = toOutcome(staleCreation)
    const invalidation = registry.invalidateAll()
    const replacementSession = new TestSession()
    let replacementCreates = 0
    const replacement = await registry.getOrCreate(identity('branch-1'), null, async () => {
      replacementCreates += 1
      return {
        piSessionFile: '/sessions/replacement.jsonl',
        session: replacementSession,
      }
    })

    rejectFactory(new Error('stale factory failed'))
    await Promise.all([staleCreationOutcome, invalidation])
    const reused = await registry.getOrCreate(
      identity('branch-1'),
      '/sessions/replacement.jsonl',
      async () => {
        replacementCreates += 1
        return {
          piSessionFile: '/sessions/unexpected.jsonl',
          session: new TestSession(),
        }
      },
    )

    expect(reused).toBe(replacement)
    expect(replacementCreates).toBe(1)
  })

  it('evicts the least recently used idle session when the desktop cache is full', async () => {
    const registry = new BuddySessionRegistry<TestSession>({ maxSessions: 2 })
    const first = new TestSession()
    const second = new FailingShutdownSession()
    const third = new TestSession()
    await registry.getOrCreate(identity('branch-1'), null, async () => ({
      piSessionFile: '/sessions/one.jsonl',
      session: first,
    }))
    await registry.getOrCreate(identity('branch-2'), null, async () => ({
      piSessionFile: '/sessions/two.jsonl',
      session: second,
    }))
    await registry.getOrCreate(identity('branch-1'), '/sessions/one.jsonl', async () => {
      throw new Error('must reuse the first session')
    })
    await registry.getOrCreate(identity('branch-3'), null, async () => ({
      piSessionFile: '/sessions/three.jsonl',
      session: third,
    }))

    expect(first.shutdownReasons).toEqual([])
    expect(second.shutdownReasons).toEqual(['evict'])
    expect(third.shutdownReasons).toEqual([])
    const reused = await registry.getOrCreate(identity('branch-3'), '/sessions/three.jsonl', async () => {
      throw new Error('must reuse the new session after failed eviction cleanup')
    })
    expect(reused.session).toBe(third)
  })

  it('preserves the binding mismatch when cached session shutdown fails', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    const cachedSession = new FailingShutdownSession()
    await registry.getOrCreate(identity('branch-1'), null, async () => ({
      piSessionFile: '/sessions/one.jsonl',
      session: cachedSession,
    }))

    await expect(registry.getOrCreate(
      identity('branch-1'),
      '/sessions/two.jsonl',
      async () => ({
        piSessionFile: '/sessions/two.jsonl',
        session: new TestSession(),
      }),
    )).rejects.toMatchObject({ code: 'SESSION_BINDING_MISMATCH' })
    expect(cachedSession.shutdownReasons).toEqual(['invalidate'])
  })

  it('accepts the new persisted binding after product-history recovery replaces a Pi file', async () => {
    const registry = new BuddySessionRegistry<TestSession>()
    let creates = 0
    const recovered = await registry.getOrCreate(
      identity('branch-1'),
      '/sessions/corrupt.jsonl',
      async () => {
        creates += 1
        return {
          piSessionFile: '/sessions/recovered.jsonl',
          session: new TestSession(),
        }
      },
    )
    const reused = await registry.getOrCreate(
      identity('branch-1'),
      '/sessions/recovered.jsonl',
      async () => {
        creates += 1
        return {
          piSessionFile: '/sessions/unexpected.jsonl',
          session: new TestSession(),
        }
      },
    )

    expect(reused).toBe(recovered)
    expect(creates).toBe(1)
  })
})

class TestSession {
  readonly shutdownReasons: string[] = []

  async shutdown(reason: string): Promise<void> {
    await Promise.resolve()
    this.shutdownReasons.push(reason)
  }
}

class FailingShutdownSession extends TestSession {
  override async shutdown(reason: string): Promise<void> {
    await super.shutdown(reason)
    throw new Error('session shutdown hook failed')
  }
}

function identity(branchId: string) {
  return {
    branchId,
    canonicalRoot: '/workspace/space',
    conversationId: 'conversation-1',
    approvalPolicy: 'policy' as const,
    executionProfile: 'workspace_write' as const,
    grantRevision: 'grants-1',
    resourceRevision: 'resources-1',
    scratchRoot: '/workspace/scratch',
    sessionMode: 'interactive' as const,
    spaceId: null,
  }
}

type PromiseOutcome<T>
  = | { status: 'fulfilled', value: T }
    | { reason: unknown, status: 'rejected' }

function toOutcome<T>(promise: Promise<T>): Promise<PromiseOutcome<T>> {
  return promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ reason, status: 'rejected' }),
  )
}

async function observeThroughNextTurn<T>(
  promise: Promise<T>,
): Promise<PromiseOutcome<T> | { status: 'pending' }> {
  let outcome: PromiseOutcome<T> | { status: 'pending' } = { status: 'pending' }
  void toOutcome(promise).then((result) => {
    outcome = result
  })
  await new Promise(resolve => setImmediate(resolve))
  return outcome
}
