import { describe, expect, it } from 'vitest'
import { chatRequestSchemas } from '../../../shared/conversation/chatApi'
import { composerRequestSchemas } from '../../../shared/conversation/composerApi'
import { contextRequestSchemas } from '../../../shared/conversation/contextApi'
import { localWorkspaceStateValueSchema } from '../../../shared/conversation/workspaceApi'

describe('local permission settings contracts', () => {
  it('keeps turn send as a strict Draft revision reference', () => {
    const request = {
      draftId: 'draft-1',
      expectedRevision: 2,
      requestId: 'request-1',
    }

    expect(chatRequestSchemas.startTurn.parse(request)).toEqual(request)
    expect(chatRequestSchemas.startTurn.safeParse({
      ...request,
      expectedRevision: undefined,
    }).success).toBe(false)
    expect(chatRequestSchemas.startTurn.safeParse({
      ...request,
      executionProfile: 'full_access',
    }).success).toBe(false)
    expect(contextRequestSchemas.contextUsageSnapshot.parse({
      approvalPolicy: 'manual',
      branchId: null,
      conversationId: null,
      draftId: 'draft-1',
      executionProfile: 'full_access',
      modelSelection: {
        modelId: 'model-1',
        providerId: 'provider-1',
        reasoning: null,
        serviceTier: null,
      },
      spaceId: null,
    }).approvalPolicy).toBe('manual')
  })

  it('persists permission settings in Runtime Drafts, not workspace navigation', () => {
    const draft = composerRequestSchemas.composerDraftOpen.parse({
      draftId: 'draft-global',
      initialContent: {
        body: [{ content: [], type: 'paragraph' }],
        panelResourceIds: [],
        version: 1,
      },
      initialExecutionConfig: {
        approvalPolicy: 'manual',
        executionProfile: 'full_access',
      },
      initialModelSelection: null,
      scope: { kind: 'global' },
    })

    expect(draft.initialExecutionConfig).toEqual({
      approvalPolicy: 'manual',
      executionProfile: 'full_access',
    })
    expect(localWorkspaceStateValueSchema.parse({
      activeConversationId: null,
      spaceId: null,
    })).toEqual({ activeConversationId: null, spaceId: null })
    expect(localWorkspaceStateValueSchema.safeParse({
      activeConversationId: null,
      drafts: [],
      spaceId: null,
    }).success).toBe(false)
  })
})
