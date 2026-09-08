import { describe, expect, it, vi } from 'vitest'

import { BuddySessionRegistry } from '../BuddySessionRegistry'

describe('buddySessionRegistry session identity', () => {
  it('replaces a branch session when its execution profile changes', async () => {
    const shutdownSandboxed = vi.fn(async () => {})
    const shutdownFullAccess = vi.fn(async () => {})
    const registry = new BuddySessionRegistry({ maxSessions: 2 })
    const baseIdentity = {
      branchId: 'branch-1',
      canonicalRoot: '/workspace',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy' as const,
      grantRevision: 'grants-1',
      resourceRevision: 'resources-1',
      scratchRoot: '/workspace/scratch',
      sessionMode: 'interactive' as const,
      spaceId: null,
    }

    await registry.getOrCreate(
      { ...baseIdentity, executionProfile: 'workspace_write' },
      null,
      async () => ({
        piSessionFile: '/tmp/controlled.jsonl',
        session: { shutdown: shutdownSandboxed },
      }),
    )
    await registry.getOrCreate(
      { ...baseIdentity, executionProfile: 'full_access' },
      '/tmp/controlled.jsonl',
      async () => ({
        piSessionFile: '/tmp/full-access.jsonl',
        session: { shutdown: shutdownFullAccess },
      }),
    )

    expect(shutdownSandboxed).toHaveBeenCalledWith('resource-change')
    expect(shutdownFullAccess).not.toHaveBeenCalled()
    await registry.dispose()
  })

  it('replaces a branch session when its approval policy changes', async () => {
    const shutdownPolicy = vi.fn(async () => {})
    const shutdownManual = vi.fn(async () => {})
    const registry = new BuddySessionRegistry({ maxSessions: 2 })
    const baseIdentity = {
      branchId: 'branch-1',
      canonicalRoot: '/workspace',
      conversationId: 'conversation-1',
      executionProfile: 'workspace_write' as const,
      grantRevision: 'grants-1',
      resourceRevision: 'resources-1',
      scratchRoot: '/workspace/scratch',
      sessionMode: 'interactive' as const,
      spaceId: null,
    }

    await registry.getOrCreate(
      { ...baseIdentity, approvalPolicy: 'policy' },
      null,
      async () => ({
        piSessionFile: '/tmp/policy.jsonl',
        session: { shutdown: shutdownPolicy },
      }),
    )
    await registry.getOrCreate(
      { ...baseIdentity, approvalPolicy: 'manual' },
      '/tmp/policy.jsonl',
      async () => ({
        piSessionFile: '/tmp/manual.jsonl',
        session: { shutdown: shutdownManual },
      }),
    )

    expect(shutdownPolicy).toHaveBeenCalledWith('resource-change')
    expect(shutdownManual).not.toHaveBeenCalled()
    await registry.dispose()
  })

  it('replaces a background session before an interactive continuation', async () => {
    const shutdownBackground = vi.fn(async () => {})
    const shutdownInteractive = vi.fn(async () => {})
    const registry = new BuddySessionRegistry({ maxSessions: 2 })
    const baseIdentity = {
      branchId: 'branch-1',
      canonicalRoot: '/workspace',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write' as const,
      grantRevision: 'grants-1',
      resourceRevision: 'resources-1',
      scratchRoot: '/workspace/scratch',
      spaceId: null,
    }

    await registry.getOrCreate(
      { ...baseIdentity, sessionMode: 'automation_background' },
      null,
      async () => ({
        piSessionFile: '/tmp/background.jsonl',
        session: { shutdown: shutdownBackground },
      }),
    )
    await registry.getOrCreate(
      { ...baseIdentity, sessionMode: 'interactive' },
      '/tmp/background.jsonl',
      async () => ({
        piSessionFile: '/tmp/interactive.jsonl',
        session: { shutdown: shutdownInteractive },
      }),
    )

    expect(shutdownBackground).toHaveBeenCalledWith('resource-change')
    expect(shutdownInteractive).not.toHaveBeenCalled()
    await registry.dispose()
  })
})
