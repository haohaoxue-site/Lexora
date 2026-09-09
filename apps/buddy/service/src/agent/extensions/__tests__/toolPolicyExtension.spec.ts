import { describe, expect, it, vi } from 'vitest'

import { ApprovalCancelledError } from '../../../approvals/ApprovalService'
import { createToolClassificationFailure } from '../../../approvals/toolClassification'
import { createToolPolicyExtension } from '../toolPolicyExtension'

describe('toolPolicyExtension always-confirm', () => {
  it('does not record execution until a requested approval is granted', async () => {
    const order: string[] = []
    const onToolExecutionAuthorized = vi.fn(async () => {
      order.push('authorized')
    })
    const request = vi.fn(async () => {
      order.push('approved')
      return { approvalId: 'approval-1', decision: 'approved_once' as const }
    })
    let handler: ((event: unknown) => Promise<unknown>) | null = null
    const extension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request },
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      getGrants: () => [{ canonicalRoot: '/tmp', grantId: 'workspace-1', kind: 'workspace' as const, root: '/tmp' }],
      getRunContext: () => ({
        flushProjectedEvents: async () => {
          order.push('prepared')
        },
        onToolExecutionAuthorized,
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
    })
    extension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        handler = callback
      },
    } as never)

    const invoke = handler as unknown as (event: unknown) => Promise<unknown>
    await expect(invoke({
      input: { command: 'python transform.py' },
      toolCallId: 'tool-call-1',
      toolName: 'bash',
    })).resolves.toBeUndefined()

    expect(order).toEqual(['prepared', 'approved', 'authorized'])
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      allowForTurn: true,
      shell: { cwd: '/tmp', reason: 'unknown-command' },
    }))
  })

  it('awaits capability preparation and keeps forced approval in full access', async () => {
    const request = vi.fn().mockResolvedValue({
      approvalId: 'approval-1',
      decision: 'approved_once',
    })
    const classifyTool = vi.fn().mockResolvedValue({
      access: 'execute',
      forceAsk: true,
    })
    const run = {
      flushProjectedEvents: async () => {},
      onToolExecutionAuthorized: async () => {},
      runId: 'run-1',
      signal: new AbortController().signal,
    }
    let handler: ((event: unknown) => Promise<unknown>) | null = null
    const extension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request },
      classifyTool,
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'full_access',
      getGrants: () => [],
      getRunContext: () => run,
    })
    extension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        handler = callback
      },
    } as never)
    const event = {
      input: {
        action: 'terminate-process',
        reason: 'Stop the exact process',
        target: { kind: 'process', pid: 42 },
      },
      toolCallId: 'tool-call-1',
      toolName: 'lexora_system_action',
    }

    const invoke = handler as unknown as (event: unknown) => Promise<unknown>
    await expect(invoke(event)).resolves.toBeUndefined()

    expect(classifyTool).toHaveBeenCalledWith(event, run)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      allowForTurn: false,
      kind: 'shell',
    }))
  })

  it('does not let full access bypass a capability-owned classification failure', async () => {
    const onToolExecutionAuthorized = vi.fn()
    let handler: ((event: unknown) => Promise<unknown>) | null = null
    const extension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: vi.fn() },
      classifyTool: () => createToolClassificationFailure('AUTOMATION_NOT_FOUND'),
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'full_access',
      getGrants: () => [],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized,
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
    })
    extension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        handler = callback
      },
    } as never)

    const invoke = handler as unknown as (event: unknown) => Promise<unknown>
    await expect(invoke({
      input: { automationId: 'missing-automation', operation: 'pause' },
      toolCallId: 'tool-call-1',
      toolName: 'lexora_buddy_automation',
    })).resolves.toEqual({
      block: true,
      reason: 'AUTOMATION_NOT_FOUND',
      terminate: false,
    })
    expect(onToolExecutionAuthorized).not.toHaveBeenCalled()
  })

  it('preserves explicit approval failures and hides unexpected classifier errors', async () => {
    let approvalHandler: ((event: unknown) => Promise<unknown>) | null = null
    const approvalExtension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: vi.fn().mockRejectedValue(new ApprovalCancelledError()) },
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      getGrants: () => [{ canonicalRoot: '/tmp', grantId: 'workspace-1', kind: 'workspace' as const, root: '/tmp' }],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: async () => {},
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
    })
    approvalExtension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        approvalHandler = callback
      },
    } as never)

    const invokeApproval = approvalHandler as unknown as (event: unknown) => Promise<unknown>
    await expect(invokeApproval({
      input: { command: 'python transform.py' },
      toolCallId: 'tool-call-1',
      toolName: 'bash',
    })).resolves.toMatchObject({ block: true, reason: 'APPROVAL_CANCELLED' })

    let unexpectedHandler: ((event: unknown) => Promise<unknown>) | null = null
    const unexpectedExtension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: vi.fn() },
      classifyTool: () => {
        throw new Error('private classifier details')
      },
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'full_access',
      getGrants: () => [],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: async () => {},
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
    })
    unexpectedExtension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        unexpectedHandler = callback
      },
    } as never)

    const invokeUnexpected = unexpectedHandler as unknown as (event: unknown) => Promise<unknown>
    await expect(invokeUnexpected({
      input: {},
      toolCallId: 'tool-call-2',
      toolName: 'lexora_unknown_tool',
    })).resolves.toEqual({
      block: true,
      reason: 'TOOL_POLICY_FAILED',
      terminate: false,
    })
  })

  it('does not classify or execute a tool call without an active run context', async () => {
    const classifyTool = vi.fn()
    let handler: ((event: unknown) => Promise<unknown>) | null = null
    const extension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: vi.fn() },
      classifyTool,
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'full_access',
      getGrants: () => [],
      getRunContext: () => null,
    })
    extension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        handler = callback
      },
    } as never)

    const invoke = handler as unknown as (event: unknown) => Promise<unknown>
    await expect(invoke({
      input: {},
      toolCallId: 'tool-call-1',
      toolName: 'bash',
    })).resolves.toEqual({
      block: true,
      reason: 'RUN_CONTEXT_UNAVAILABLE',
      terminate: false,
    })
    expect(classifyTool).not.toHaveBeenCalled()
  })

  it('projects a stable denial fact when the read-only profile blocks mutation', async () => {
    const onToolExecutionDenied = vi.fn(async () => {})
    let handler: ((event: unknown) => Promise<unknown>) | null = null
    const extension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: vi.fn() },
      classifyTool: () => ({
        access: 'write' as const,
        paths: [{ mode: 'create' as const, path: '/tmp/result.txt' }],
      }),
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'read_only',
      getGrants: () => [{ canonicalRoot: '/tmp', grantId: 'workspace-1', kind: 'workspace' as const, root: '/tmp' }],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: async () => {},
        onToolExecutionDenied,
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
    })
    extension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        handler = callback
      },
    } as never)

    const invoke = handler as unknown as (event: unknown) => Promise<unknown>
    await expect(invoke({
      input: { content: 'result', path: '/tmp/result.txt' },
      toolCallId: 'tool-call-1',
      toolName: 'write',
    })).resolves.toEqual({
      block: true,
      reason: 'READ_ONLY_PROFILE',
      terminate: false,
    })
    expect(onToolExecutionDenied).toHaveBeenCalledWith({
      denialCode: 'READ_ONLY_PROFILE',
      toolCallId: 'tool-call-1',
      toolName: 'write',
    })
  })

  it('does not persist a directory grant when approval is activated for the turn', async () => {
    const applyGrant = vi.fn()
    const onToolExecutionAuthorized = vi.fn(async () => {})
    let handler: ((event: unknown) => Promise<unknown>) | null = null
    const extension = createToolPolicyExtension({
      applyGrant,
      approvalAvailable: true,
      approvalService: {
        request: vi.fn(async () => ({
          approvalId: 'approval-1',
          decision: 'approved_for_turn' as const,
        })),
      },
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      getGrants: () => [{
        canonicalRoot: '/tmp',
        grantId: 'workspace-1',
        kind: 'workspace' as const,
        root: '/tmp',
      }],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized,
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
      owner: { id: 'conversation-1', kind: 'conversation' },
    })
    extension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        handler = callback
      },
    } as never)

    const invoke = handler as unknown as (event: unknown) => Promise<unknown>
    await expect(invoke({
      input: { content: 'result', path: '/var/tmp/result.txt' },
      toolCallId: 'tool-call-turn',
      toolName: 'write',
    })).resolves.toBeUndefined()
    expect(applyGrant).not.toHaveBeenCalled()
    expect(onToolExecutionAuthorized).toHaveBeenCalledOnce()
  })

  it('records directory grant persistence failure and blocks the tool', async () => {
    const onToolExecutionAuthorized = vi.fn()
    const onToolExecutionDenied = vi.fn(async () => {})
    let handler: ((event: unknown) => Promise<unknown>) | null = null
    const extension = createToolPolicyExtension({
      applyGrant: vi.fn(async () => {
        throw new Error('storage unavailable')
      }),
      approvalAvailable: true,
      approvalService: {
        request: vi.fn(async () => ({
          approvalId: 'approval-1',
          decision: 'approved_once' as const,
        })),
      },
      cwd: '/tmp',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      getGrants: () => [{
        canonicalRoot: '/tmp',
        grantId: 'workspace-1',
        kind: 'workspace' as const,
        root: '/tmp',
      }],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized,
        onToolExecutionDenied,
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
      owner: { id: 'conversation-1', kind: 'conversation' },
    })
    extension.factory({
      on: (_event: string, callback: (event: unknown) => Promise<unknown>) => {
        handler = callback
      },
    } as never)

    const invoke = handler as unknown as (event: unknown) => Promise<unknown>
    await expect(invoke({
      input: { content: 'result', path: '/var/tmp/result.txt' },
      toolCallId: 'tool-call-grant-failure',
      toolName: 'write',
    })).resolves.toEqual({
      block: true,
      reason: 'DIRECTORY_GRANT_FAILED',
      terminate: false,
    })
    expect(onToolExecutionDenied).toHaveBeenCalledWith({
      denialCode: 'DIRECTORY_GRANT_FAILED',
      toolCallId: 'tool-call-grant-failure',
      toolName: 'write',
    })
    expect(onToolExecutionAuthorized).not.toHaveBeenCalled()
  })
})
