import type { BrowserAction, BrowserObservedElement } from '../../../../../shared/browser'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BROWSER_ACT_TOOL_NAME,
  classifyBrowserTool,
} from '../../../browser/browserToolContract'
import { PermissionEngine } from '../../../permissions/PermissionEngine'
import { classifyBrowserAction } from '../classifyBrowserAction'

const ACTION_CONTEXT = {
  documentRevision: 2,
  frameId: 'main-frame',
  observationId: 'b3a5d63b-17b7-4b5a-863a-37f135e297d4',
  pageId: 'ed312709-baf9-44b3-a292-108055838477',
}

describe('classifyBrowserAction', () => {
  it('separates read, navigation, and reversible interactions', () => {
    expect(classify({ kind: 'wait', condition: 'page-ready', timeoutMs: 100 }))
      .toEqual({ risk: 'read' })
    expect(classify({ kind: 'navigate', url: 'https://example.com/docs' }))
      .toEqual({ risk: 'navigation' })
    expect(classify(
      { kind: 'click', ref: 'e1' },
      element({ name: 'Documentation', role: 'link' }),
    )).toEqual({ risk: 'unknown-commit-like' })
    expect(classify(
      { kind: 'fill', ref: 'e1', text: 'release notes' },
      element({ actions: ['fill', 'type'], name: 'Search', role: 'textbox' }),
    )).toEqual({ risk: 'reversible-edit' })
  })

  it('never classifies human-only input as an Agent-editable action', () => {
    const password = element({
      actions: [],
      inputMode: 'human',
      name: 'Password',
      role: 'textbox',
      valueState: 'redacted',
    })

    expect(classify(
      { kind: 'fill', ref: 'e1', text: 'not-allowed' },
      password,
    )).toEqual({ risk: 'sensitive-input' })
    expect(classify(
      { amount: 'half-page', direction: 'down', kind: 'scroll', ref: 'e1' },
      password,
    )).toEqual({ risk: 'read' })
    expect(classifyBrowserAction({
      action: { key: 'Space', kind: 'press' },
      observationContainsHumanInput: true,
      target: null,
    })).toEqual({ risk: 'sensitive-input' })
  })

  it('raises known and ambiguous commit-like clicks without trusting page copy to lower risk', () => {
    expect(classify(
      { kind: 'click', ref: 'e1' },
      element({ name: 'Publish now', role: 'button' }),
    )).toEqual({ effect: 'publish', risk: 'commit-like' })
    expect(classify(
      { kind: 'click', ref: 'e1' },
      element({ name: 'Continue', role: 'button' }),
    )).toEqual({ risk: 'unknown-commit-like' })
    expect(classify(
      { kind: 'click', ref: 'e1' },
      element({ name: 'Delete account', role: 'link' }),
    )).toEqual({ effect: 'account-change', risk: 'commit-like' })
    expect(classify(
      { kind: 'click', ref: 'e1' },
      element({ name: 'Documentation', role: 'link' }),
    )).toEqual({ risk: 'unknown-commit-like' })
  })

  it('classifies localized commit-like approval effects', () => {
    for (const [name, effect] of [
      ['发送消息', 'send'],
      ['提交表单', 'submit'],
      ['发布文章', 'publish'],
      ['购买套餐', 'purchase'],
      ['删除文档', 'delete'],
      ['授权访问', 'authorize'],
      ['修改密码', 'account-change'],
    ] as const) {
      expect(classify(
        { kind: 'click', ref: 'e1' },
        element({ name, role: 'button' }),
      )).toEqual({ effect, risk: 'commit-like' })
    }
  })

  it('rejects caller-supplied target metadata instead of using it to lower risk', () => {
    expect(classifyBrowserTool({
      input: {
        ...ACTION_CONTEXT,
        action: { kind: 'click', ref: 'e1' },
        target: {
          name: 'Harmless documentation link',
          role: 'link',
        },
      },
      toolName: BROWSER_ACT_TOOL_NAME,
    }, {
      classifyAction: () => ({ risk: 'navigation' }),
    })).toEqual({ blocked: true, reason: 'VALIDATION_FAILED' })
  })

  it('maps reversible actions, ambiguous commitments, and sensitive input conservatively', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'lexora-browser-policy-')))
    try {
      const policy = new PermissionEngine()
      const baseRequest = {
        approvalPolicy: 'policy' as const,
        approvalAvailable: true,
        cwd: root,
        owner: { id: 'conversation-1', kind: 'conversation' as const },
        profile: 'workspace_write' as const,
        grants: [{ canonicalRoot: root, grantId: 'space-1', kind: 'workspace' as const, root }],
        toolName: BROWSER_ACT_TOOL_NAME,
      }
      const reversible = classifyBrowserTool({
        input: {
          ...ACTION_CONTEXT,
          action: { kind: 'fill', ref: 'e1', text: 'release notes' },
        },
        toolName: BROWSER_ACT_TOOL_NAME,
      }, {
        classifyAction: () => ({ risk: 'reversible-edit' }),
      })
      expect(reversible).toMatchObject({ access: 'interaction' })
      if (!reversible || 'blocked' in reversible)
        throw new Error('Expected reversible browser classification')
      await expect(policy.decide({
        ...baseRequest,
        arguments: {},
        access: reversible.access,
      })).resolves.toEqual({ type: 'allow' })

      const unknown = classifyBrowserTool({
        input: {
          ...ACTION_CONTEXT,
          action: { kind: 'click', ref: 'e1' },
        },
        toolName: BROWSER_ACT_TOOL_NAME,
      }, {
        classifyAction: () => ({
          approvalReview: {
            action: 'click',
            actionDigest: 'a'.repeat(64),
            documentRevision: 2,
            effect: null,
            key: null,
            observationId: ACTION_CONTEXT.observationId,
            origin: 'https://example.com',
            pageId: ACTION_CONTEXT.pageId,
            risk: 'unknown-commit-like',
            sessionId: '6f828cc1-6549-4245-b26e-43b2917c9281',
            targetName: 'Documentation',
            targetRole: 'link',
          },
          risk: 'unknown-commit-like',
        }),
        validateActionApproval: async () => null,
      })
      expect(unknown).toMatchObject({
        forceAsk: true,
        approval: {
          browser: {
            effect: null,
            risk: 'unknown-commit-like',
            targetName: 'Documentation',
            targetRole: 'link',
          },
          kind: 'browser',
          summary: 'Confirm an ambiguous browser action',
        },
      })

      expect(classifyBrowserTool({
        input: {
          ...ACTION_CONTEXT,
          action: { kind: 'fill', ref: 'e1', text: 'not-allowed' },
        },
        toolName: BROWSER_ACT_TOOL_NAME,
      }, {
        classifyAction: () => ({ risk: 'sensitive-input' }),
      })).toEqual({ blocked: true, reason: 'BROWSER_HUMAN_INPUT_REQUIRED' })
    }
    finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})

function classify(
  action: BrowserAction,
  target: BrowserObservedElement | null = null,
) {
  return classifyBrowserAction({
    action,
    observationContainsHumanInput: target?.inputMode === 'human',
    target,
  })
}

function element(
  input: Partial<BrowserObservedElement> & Pick<BrowserObservedElement, 'name' | 'role'>,
): BrowserObservedElement {
  return {
    actions: ['click'],
    frameId: 'main-frame',
    ref: 'e1',
    states: [],
    ...input,
  }
}
