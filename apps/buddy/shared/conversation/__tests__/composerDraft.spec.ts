import { describe, expect, it } from 'vitest'
import { createBuddyUserContent } from '../buddyUserContent'
import {
  buddyComposerDraftSchema,
  buddyComposerDraftScopeKey,
  buddyComposerDraftScopeSchema,
} from '../composerDraft'

describe('composer draft contract', () => {
  it('uses branch-scoped identities instead of conversation-only identities', () => {
    expect(buddyComposerDraftScopeKey({ kind: 'global' })).toBe('global')
    expect(buddyComposerDraftScopeKey({ kind: 'space', spaceId: 'space-1' }))
      .toBe('space:space-1')
    expect(buddyComposerDraftScopeKey({
      branchId: 'branch-2',
      conversationId: 'conversation-1',
      kind: 'conversation_branch',
    })).toBe('conversation:conversation-1:branch-2')
  })

  it('rejects ambiguous scopes and unknown durable fields', () => {
    expect(buddyComposerDraftScopeSchema.safeParse({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      kind: 'space',
      spaceId: 'space-1',
    }).success).toBe(false)
    expect(buddyComposerDraftSchema.safeParse({
      content: createBuddyUserContent('Hello'),
      draftId: 'draft-1',
      executionConfig: {
        approvalPolicy: 'policy',
        executionProfile: 'workspace_write',
      },
      modelSelection: null,
      revision: 0,
      scope: { kind: 'global' },
      temporaryEditorJson: {},
      updatedAt: '2026-09-06T00:00:00.000Z',
    }).success).toBe(false)
  })
})
