import type { DatabaseSync } from 'node:sqlite'
import type { BuddyComposerDraftScope } from '../../../../shared/conversation/composerDraft'
import type { PrepareCommandRequestInput } from '../commandRequestRepository'
import type { PrepareTurnRequestInput } from '../turnRequestRepository'
import { createBuddyUserContent } from '../../../../shared/conversation/buddyUserContent'
import { createCommandRequestRepository } from '../commandRequestRepository'
import { createComposerDraftRepository } from '../composerDraftRepository'
import { createTurnRequestRepository } from '../turnRequestRepository'

export function prepareTestTurnRequest(
  database: DatabaseSync,
  input: Omit<PrepareTurnRequestInput, 'draft'>,
) {
  const drafts = createComposerDraftRepository(database)
  const existingConversation = database.prepare(
    'SELECT active_branch_id FROM conversations WHERE id = ?',
  ).get(input.conversationId) as { active_branch_id: string | null } | undefined
  const scope: BuddyComposerDraftScope = existingConversation
    ? {
        branchId: input.branchId,
        conversationId: input.conversationId,
        kind: 'conversation_branch',
      }
    : input.spaceId
      ? { kind: 'space', spaceId: input.spaceId }
      : { kind: 'global' }
  const opened = drafts.open({
    draftId: `draft-${input.requestId}`,
    initialContent: createBuddyUserContent(input.runInput.prompt),
    initialExecutionConfig: {
      approvalPolicy: input.approvalPolicy,
      executionProfile: input.executionProfile,
    },
    initialModelSelection: {
      modelId: input.model,
      providerId: input.provider,
      reasoning: input.runInput.reasoning,
      serviceTier: input.runInput.serviceTier,
    },
    now: input.createdAt,
    scope,
  })
  const draft = drafts.save({
    content: createBuddyUserContent(input.runInput.prompt),
    draftId: opened.draftId,
    executionConfig: {
      approvalPolicy: input.approvalPolicy,
      executionProfile: input.executionProfile,
    },
    expectedRevision: opened.revision,
    modelSelection: {
      modelId: input.model,
      providerId: input.provider,
      reasoning: input.runInput.reasoning,
      serviceTier: input.runInput.serviceTier,
    },
    now: input.createdAt,
  })
  return createTurnRequestRepository(database).prepare({
    ...input,
    draft: { draftId: draft.draftId, expectedRevision: draft.revision },
  })
}

export function prepareTestCommandRequest(
  database: DatabaseSync,
  input: Omit<PrepareCommandRequestInput, 'draft'>,
) {
  const drafts = createComposerDraftRepository(database)
  const opened = drafts.open({
    draftId: `draft-${input.requestId}`,
    initialContent: createBuddyUserContent(),
    initialExecutionConfig: {
      approvalPolicy: input.approvalPolicy,
      executionProfile: input.executionProfile,
    },
    initialModelSelection: null,
    now: input.createdAt,
    scope: {
      branchId: input.branchId,
      conversationId: input.conversationId,
      kind: 'conversation_branch',
    },
  })
  const draft = drafts.save({
    content: createActionCommandContent(input.command, input.arguments),
    draftId: opened.draftId,
    executionConfig: {
      approvalPolicy: input.approvalPolicy,
      executionProfile: input.executionProfile,
    },
    expectedRevision: opened.revision,
    modelSelection: null,
    now: input.createdAt,
  })
  return createCommandRequestRepository(database).prepare({
    ...input,
    draft: { draftId: draft.draftId, expectedRevision: draft.revision },
  })
}

function createActionCommandContent(command: string, argumentsValue: string) {
  return {
    body: [{
      content: [
        {
          commandMode: 'action' as const,
          directive: 'slash_command' as const,
          type: 'prompt_directive' as const,
          value: `/${command}`,
        },
        ...(argumentsValue ? [{ text: ` ${argumentsValue}`, type: 'text' as const }] : []),
      ],
      type: 'paragraph' as const,
    }],
    panelResourceIds: [],
    version: 1 as const,
  }
}
