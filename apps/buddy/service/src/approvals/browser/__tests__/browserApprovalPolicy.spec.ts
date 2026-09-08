import type { BuddyInProcessExtension } from '../../../agent/createBuddyResourceLoader'
import type { BuddyToolClassificationResult } from '../../toolClassification'
import { describe, expect, it, vi } from 'vitest'
import { createToolPolicyExtension } from '../../../agent/hooks/toolPolicyExtension'
import {
  BROWSER_ACT_TOOL_NAME,
  classifyBrowserTool,
} from '../../../browser/browserToolContract'
import { ApprovalExpiredError } from '../../ApprovalService'

const ACTION_INPUT = {
  action: { kind: 'click', ref: 'e1' } as const,
  documentRevision: 2,
  frameId: 'main-frame',
  observationId: 'b3a5d63b-17b7-4b5a-863a-37f135e297d4',
  pageId: 'ed312709-baf9-44b3-a292-108055838477',
}

const BROWSER_REVIEW = {
  action: 'click' as const,
  actionDigest: 'a'.repeat(64),
  documentRevision: 2,
  effect: 'publish' as const,
  key: null,
  observationId: 'b3a5d63b-17b7-4b5a-863a-37f135e297d4',
  origin: 'https://example.com',
  pageId: 'ed312709-baf9-44b3-a292-108055838477',
  risk: 'commit-like' as const,
  sessionId: '6f828cc1-6549-4245-b26e-43b2917c9281',
  targetName: 'Publish now',
  targetRole: 'button',
}

describe('browser approval policy', () => {
  it('creates a dedicated non-turn approval for a consequential action', () => {
    const validateActionApproval = vi.fn(async () => null)
    const classification = classifyBrowserTool({
      input: ACTION_INPUT,
      toolName: BROWSER_ACT_TOOL_NAME,
    }, {
      classifyAction: () => ({
        approvalReview: BROWSER_REVIEW,
        effect: 'publish',
        risk: 'commit-like',
      }),
      validateActionApproval,
    })

    expect(classification).toMatchObject({
      forceAsk: true,
      approval: {
        browser: BROWSER_REVIEW,
        kind: 'browser',
        summary: 'Publish content in the browser',
      },
    })
    expect(classification).toHaveProperty('validateBeforeExecution')
  })

  it('keeps the browser capability instance bound during approval revalidation', async () => {
    const actionClassifier = new class {
      validated = false

      classifyAction() {
        return {
          approvalReview: BROWSER_REVIEW,
          effect: 'publish' as const,
          risk: 'commit-like' as const,
        }
      }

      async validateActionApproval() {
        this.validated = true
        return null
      }
    }()
    const classification = classifyBrowserTool({
      input: ACTION_INPUT,
      toolName: BROWSER_ACT_TOOL_NAME,
    }, actionClassifier)

    if (
      !classification
      || 'blocked' in classification
      || !classification.validateBeforeExecution
    ) {
      throw new Error('Expected browser approval revalidation')
    }
    await expect(classification.validateBeforeExecution()).resolves.toBeNull()

    expect(actionClassifier.validated).toBe(true)
  })

  it('cannot be bypassed by the full-access execution profile', async () => {
    const validateActionApproval = vi.fn(async () => null)
    const classification = classifyBrowserTool({
      input: ACTION_INPUT,
      toolName: BROWSER_ACT_TOOL_NAME,
    }, {
      classifyAction: () => ({
        approvalReview: BROWSER_REVIEW,
        effect: 'publish',
        risk: 'commit-like',
      }),
      validateActionApproval,
    })
    const requestApproval = vi.fn(async () => ({
      approvalId: 'approval-1',
      decision: 'approved_once' as const,
    }))
    const onAuthorized = vi.fn(async () => {})
    const extension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: requestApproval },
      classifyTool: () => classification as BuddyToolClassificationResult,
      cwd: '/workspace',
      approvalPolicy: 'policy' as const,
      executionProfile: 'full_access',
      getGrants: () => [],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: onAuthorized,
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
    })
    const invoke = activate(extension)

    await expect(invoke({
      input: ACTION_INPUT,
      toolCallId: 'tool-act',
      toolName: BROWSER_ACT_TOOL_NAME,
      type: 'tool_call',
    })).resolves.toBeUndefined()

    expect(requestApproval).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      allowForTurn: false,
      arguments: ACTION_INPUT,
      browser: BROWSER_REVIEW,
      kind: 'browser',
      runId: 'run-1',
      signal: expect.any(AbortSignal),
      summary: 'Publish content in the browser',
      toolCallId: 'tool-act',
      toolName: BROWSER_ACT_TOOL_NAME,
    }))
    expect(onAuthorized).toHaveBeenCalledExactlyOnceWith({
      arguments: ACTION_INPUT,
      toolCallId: 'tool-act',
      toolName: BROWSER_ACT_TOOL_NAME,
    })
    expect(validateActionApproval).toHaveBeenCalledExactlyOnceWith(
      ACTION_INPUT,
      BROWSER_REVIEW,
    )
  })

  it('invalidates an approval before authorization when Main reports a stale page', async () => {
    const validateActionApproval = vi.fn(async () => ({
      blocked: true as const,
      reason: 'BROWSER_TARGET_STALE' as const,
    }))
    const classification = classifyBrowserTool({
      input: ACTION_INPUT,
      toolName: BROWSER_ACT_TOOL_NAME,
    }, {
      classifyAction: () => ({
        approvalReview: BROWSER_REVIEW,
        effect: 'publish',
        risk: 'commit-like',
      }),
      validateActionApproval,
    })
    const requestApproval = vi.fn(async () => ({
      approvalId: 'approval-1',
      decision: 'approved_once' as const,
    }))
    const onAuthorized = vi.fn(async () => {})
    const extension = createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: requestApproval },
      classifyTool: () => classification as BuddyToolClassificationResult,
      cwd: '/workspace',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      getGrants: () => [],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: onAuthorized,
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
    })

    await expect(activate(extension)({
      input: ACTION_INPUT,
      toolCallId: 'tool-act-stale',
      toolName: BROWSER_ACT_TOOL_NAME,
      type: 'tool_call',
    })).resolves.toEqual({
      block: true,
      reason: 'BROWSER_TARGET_STALE',
      terminate: false,
    })

    expect(requestApproval).toHaveBeenCalledOnce()
    expect(validateActionApproval).toHaveBeenCalledOnce()
    expect(onAuthorized).not.toHaveBeenCalled()
  })

  it('does not validate or authorize a browser action after the user denies it', async () => {
    const validateActionApproval = vi.fn(async () => null)
    const classification = classifyBrowserTool({
      input: ACTION_INPUT,
      toolName: BROWSER_ACT_TOOL_NAME,
    }, {
      classifyAction: () => ({
        approvalReview: BROWSER_REVIEW,
        effect: 'publish',
        risk: 'commit-like',
      }),
      validateActionApproval,
    })
    const requestApproval = vi.fn(async () => ({
      approvalId: 'approval-1',
      decision: 'denied' as const,
    }))
    const onAuthorized = vi.fn(async () => {})
    const invoke = activate(createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: requestApproval },
      classifyTool: () => classification as BuddyToolClassificationResult,
      cwd: '/workspace',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      getGrants: () => [],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: onAuthorized,
        runId: 'run-denied',
        signal: new AbortController().signal,
      }),
    }))

    await expect(invoke({
      input: ACTION_INPUT,
      toolCallId: 'tool-act-denied',
      toolName: BROWSER_ACT_TOOL_NAME,
      type: 'tool_call',
    })).resolves.toEqual({
      block: true,
      reason: 'APPROVAL_DENIED',
      terminate: false,
    })

    expect(requestApproval).toHaveBeenCalledOnce()
    expect(validateActionApproval).not.toHaveBeenCalled()
    expect(onAuthorized).not.toHaveBeenCalled()
  })

  it('does not retry or authorize a browser action after approval expiry', async () => {
    const validateActionApproval = vi.fn(async () => null)
    const classification = classifyBrowserTool({
      input: ACTION_INPUT,
      toolName: BROWSER_ACT_TOOL_NAME,
    }, {
      classifyAction: () => ({
        approvalReview: BROWSER_REVIEW,
        effect: 'publish',
        risk: 'commit-like',
      }),
      validateActionApproval,
    })
    const requestApproval = vi.fn(async () => {
      throw new ApprovalExpiredError()
    })
    const onAuthorized = vi.fn(async () => {})
    const invoke = activate(createToolPolicyExtension({
      approvalAvailable: true,
      owner: { id: 'conversation-1', kind: 'conversation' as const },
      approvalService: { request: requestApproval },
      classifyTool: () => classification as BuddyToolClassificationResult,
      cwd: '/workspace',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      getGrants: () => [],
      getRunContext: () => ({
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: onAuthorized,
        runId: 'run-expired',
        signal: new AbortController().signal,
      }),
    }))

    await expect(invoke({
      input: ACTION_INPUT,
      toolCallId: 'tool-act-expired',
      toolName: BROWSER_ACT_TOOL_NAME,
      type: 'tool_call',
    })).resolves.toEqual({
      block: true,
      reason: 'AUTOMATION_APPROVAL_EXPIRED',
      terminate: false,
    })

    expect(requestApproval).toHaveBeenCalledOnce()
    expect(validateActionApproval).not.toHaveBeenCalled()
    expect(onAuthorized).not.toHaveBeenCalled()
  })

  it('requires the same dedicated approval for unknown activation despite page role or copy', () => {
    const review = {
      ...BROWSER_REVIEW,
      effect: null,
      risk: 'unknown-commit-like' as const,
      targetName: 'Safe documentation link',
      targetRole: 'link',
    }
    const classification = classifyBrowserTool({
      input: ACTION_INPUT,
      toolName: BROWSER_ACT_TOOL_NAME,
    }, {
      classifyAction: () => ({
        approvalReview: review,
        risk: 'unknown-commit-like',
      }),
      validateActionApproval: async () => null,
    })

    expect(classification).toMatchObject({
      forceAsk: true,
      approval: {
        browser: review,
        kind: 'browser',
        summary: 'Confirm an ambiguous browser action',
      },
    })
    expect(classification).toHaveProperty('validateBeforeExecution')
  })
})

function activate(extension: BuddyInProcessExtension) {
  let handler: ((event: unknown) => Promise<unknown>) | null = null
  extension.factory({
    on(event: string, callback: (event: unknown) => Promise<unknown>) {
      if (event === 'tool_call')
        handler = callback
    },
  } as never)
  if (!handler)
    throw new Error('Tool policy extension did not register its tool_call handler')
  return handler as unknown as (event: {
    input: unknown
    toolCallId: string
    toolName: string
    type: 'tool_call'
  }) => Promise<unknown>
}
