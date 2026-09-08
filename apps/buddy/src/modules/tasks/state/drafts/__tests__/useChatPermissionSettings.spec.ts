import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { LocalRun } from '@buddy-shared/runs/runApi'

import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useChatDrafts } from '../useChatDrafts'

import { useChatPermissionSettings } from '../useChatPermissionSettings'

const timestamp = '2026-08-24T00:00:00.000Z'

describe('useChatPermissionSettings', () => {
  it('rolls back only the source Draft when a save fails after navigation', async () => {
    const saving = Promise.withResolvers<boolean>()
    const targetKey = ref('global')
    const drafts = useChatDrafts({ onChange: () => {}, targetKey: computed(() => targetKey.value) })
    const permission = useChatPermissionSettings({
      activeConversation: ref(null),
      activeConversationId: ref(null),
      activeRun: ref(null),
      api: { setPermissionSettings: vi.fn() },
      applyConversation: vi.fn(),
      drafts,
      onError: vi.fn(),
      persistWorkspaceState: () => saving.promise,
    })
    drafts.updateComposerContent('source text', null)
    const updating = permission.setPermissionMode('full_access')
    targetKey.value = 'space:space-1'
    drafts.setPermissionSettings({ approvalPolicy: 'manual', executionProfile: 'workspace_write' })
    drafts.updateComposerContent('destination text', null)
    saving.resolve(false)

    await expect(updating).resolves.toBe(false)
    expect(drafts.snapshot('global')).toMatchObject({ approvalPolicy: 'policy', executionProfile: 'workspace_write' })
    expect(drafts.draft.value).toBe('destination text')
    expect(drafts.approvalPolicy.value).toBe('manual')
  })

  it('changes draft permission settings atomically through an explicit user mutation', async () => {
    const draftApprovalPolicy = ref<'manual' | 'policy'>('policy')
    const draftProfile = ref<'read_only' | 'workspace_write' | 'full_access'>('workspace_write')
    const setDraftPermissionSettings = vi.fn((value: {
      approvalPolicy: 'manual' | 'policy'
      executionProfile: 'read_only' | 'workspace_write' | 'full_access'
    }) => {
      draftApprovalPolicy.value = value.approvalPolicy
      draftProfile.value = value.executionProfile
    })
    const persistWorkspaceState = vi.fn(async () => true)
    const permission = useChatPermissionSettings({
      activeConversation: ref(null),
      activeConversationId: ref(null),
      activeRun: ref(null),
      api: { setPermissionSettings: vi.fn() } as never,
      applyConversation: vi.fn(),
      drafts: {
        approvalPolicy: draftApprovalPolicy,
        executionProfile: draftProfile,
        setPermissionSettings: setDraftPermissionSettings,
        targetKey: ref('global'),
      } as never,
      onError: vi.fn(),
      persistWorkspaceState,
    })

    expect(permission.permissionMode.value).toBe('policy_approval')
    await expect(permission.setPermissionMode('manual_approval')).resolves.toBe(true)
    expect(setDraftPermissionSettings).toHaveBeenCalledWith({
      approvalPolicy: 'manual',
      executionProfile: 'workspace_write',
    })
    expect(persistWorkspaceState).toHaveBeenCalledOnce()
    expect(permission.permissionMode.value).toBe('manual_approval')
  })

  it('keeps the active run permission snapshot immutable and blocks changes', async () => {
    const conversation = ref<LocalConversationSummary>({
      activeBranchId: 'branch-1',
      activity: 'running',
      automationOccurrence: null,
      createdAt: timestamp,
      deletedAt: null,
      approvalPolicy: 'policy' as const,
      executionProfile: 'full_access',
      id: 'conversation-1',
      modelSelection: null,
      spaceId: null,
      title: null,
      updatedAt: timestamp,
    })
    const activeRun = ref<LocalRun>({
      branchId: 'branch-1',
      completedAt: null,
      conversationId: 'conversation-1',
      errorCode: null,
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'run-1',
      modelId: 'model-1',
      providerId: 'provider-1',
      purpose: 'chat',
      reasoningLevel: null,
      startedAt: timestamp,
      status: 'running',
      triggeringMessageId: 'message-1',
    })
    const setConversationPermissionSettings = vi.fn()
    const permission = useChatPermissionSettings({
      activeConversation: conversation,
      activeConversationId: ref('conversation-1'),
      activeRun,
      api: { setPermissionSettings: setConversationPermissionSettings } as never,
      applyConversation: vi.fn(),
      drafts: {
        approvalPolicy: ref('policy'),
        executionProfile: ref('workspace_write'),
      } as never,
      onError: vi.fn(),
      persistWorkspaceState: vi.fn(async () => true),
    })

    expect(permission.permissionMode.value).toBe('policy_approval')
    expect(permission.canUpdate.value).toBe(false)
    await expect(permission.setPermissionMode('full_access')).resolves.toBe(false)
    expect(setConversationPermissionSettings).not.toHaveBeenCalled()
  })
})
