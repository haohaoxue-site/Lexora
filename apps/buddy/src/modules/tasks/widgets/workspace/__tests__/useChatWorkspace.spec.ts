import type { DesktopChatWelcomePreference } from '@buddy-electron/shared/desktopApi'
import type { LocalBuddyServiceSupervisorState } from '@buddy-shared/runtime/serviceState'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { TaskChatWorkspace } from '../../../contracts'
import type { ChatApprovalDecision } from '../../../model/runs/typing'
import type { ChatWorkspaceProps } from '../typing'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatComposerSubmitPayload } from '@/modules/prompt-input'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, shallowReactive, shallowRef, watchEffect } from 'vue'
import { createChatComposerContentFromText } from '@/modules/prompt-input'
import { useChatWorkspace } from '../useChatWorkspace'
import { useTaskComposer } from '../useTaskComposer'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

function createOwner(name: string) {
  const delivered: { mode: 'send' | 'edit', content: string }[] = []
  const draft = shallowRef(`${name} draft`)
  const workspace = {
    tree: { data: shallowRef(null), loading: shallowRef(false), error: shallowRef(null), refresh: async () => {}, setVisible: () => {} },
    composer: {
      target: shallowRef({ kind: 'global' } as const),
      composerContent: shallowRef(createChatComposerContentFromText(draft.value)),
      contextUsage: shallowRef(null),
      draft,
      draftId: shallowRef(`${name}-draft`),
      editorKey: shallowRef(`${name}-editor`),
      resources: shallowRef([]),
      rejectedResourceIds: new Set<string>(),
      canUpdatePermissionSettings: shallowRef(true),
      isUpdatingPermissionSettings: shallowRef(false),
      isSelectingFiles: shallowRef(false),
      interaction: shallowRef(null),
      models: shallowRef([]),
      providers: shallowRef([]),
      selectedEffort: shallowRef(null),
      selectedModel: shallowRef(null),
      selectedModelId: shallowRef(null),
      selectedServiceTier: shallowRef(null),
      permissionMode: shallowRef('manual_approval' as const),
      beginImport: () => [name],
      dismissInteraction: () => {},
      listContextOptions: async () => ({ files: [], skills: [] }),
      retryResource: async () => {},
      selectAttachments: async () => {},
      selectModel: async () => {},
      selectSource: async () => null,
      setSelectedEffort: async () => {},
      setSelectedServiceTier: async () => {},
      setPermissionMode: async () => true,
      updateComposerContent: (text: string) => { draft.value = text },
    },
    execution: {
      beginFollowup: async () => false,
      cancelFollowup: () => {},
      activeRun: shallowRef(null),
      approvalViews: shallowRef([]),
      canMutateBranch: shallowRef(true),
      canSend: shallowRef(false),
      editingMessageId: shallowRef<string | null>(null),
      isMutatingBranch: shallowRef(false),
      isSending: shallowRef(false),
      resolvingApprovalActions: shallowRef(new Map<string, ChatApprovalDecision>()),
      resolvingApprovalIds: shallowRef(new Set<string>()),
      cancelActiveRun: async () => {},
      cancelEditUserMessage: () => {},
      editUserMessage: async () => true,
      regenerateAssistant: async () => true,
      resolveApproval: async () => {},
      send: async (payload: ChatComposerSubmitPayload | string) => {
        delivered.push({ mode: 'send', content: typeof payload === 'string' ? payload : payload.content })
        draft.value = ''
        return true
      },
      submitEditedMessage: async (payload: ChatComposerSubmitPayload) => {
        delivered.push({ mode: 'edit', content: payload.content })
        draft.value = ''
        return true
      },
    },
    language: shallowRef<BuddyLocale>('zh-CN'),
    welcomePreference: shallowRef<DesktopChatWelcomePreference>('writing'),
    session: {
      activeBranchId: shallowRef<string | null>(null),
      activeConversation: shallowRef(null),
      activeConversationId: shallowRef<string | null>(null),
      activeSpace: shallowRef<LocalSpace | null>(null),
      currentTitle: shallowRef(name),
      spaceId: shallowRef(null),
      listActiveConversationMessages: async () => [],
      openConversation: async () => {},
    },
    status: {
      canRestartRuntime: shallowRef(false),
      errorMessage: shallowRef<string | null>(null),
      isLoading: shallowRef(true),
      runtimeError: shallowRef(null),
      runtimeState: shallowRef<LocalBuddyServiceSupervisorState>({ lastError: null, pid: null, restartAttempt: 0, status: 'starting' }),
      visibleChatBlocker: shallowRef(null),
      dismissChatBlocker: () => {},
      restartRuntime: async () => true,
    },
    transcript: {
      branches: shallowRef([]),
      changeSets: shallowRef([]),
      hasOlderMessages: shallowRef(false),
      isLoadingOlderMessages: shallowRef(false),
      messages: shallowRef([]),
      runEventBuckets: shallowRef<TaskChatWorkspace['transcript']['runEventBuckets']['value']>(new Map()),
      runSignalEvents: shallowRef([]),
      runOutputs: shallowRef([]),
      runs: shallowRef([]),
      timelineItems: shallowRef([]),
      activateBranch: async () => true,
      loadOlderMessages: async () => false,
    },
    restoration: {
      state: shallowRef('ready' as const),
      conflict: shallowRef(null),
      restore: async () => {},
      resolveRemote: async () => true,
    },
    context: {
      getNodeDetail: async () => { throw new Error('Unused detail loader') },
      getChangeSet: async () => { throw new Error('Unused fixture operation') },
      readArtifactText: async () => { throw new Error('Unused fixture operation') },
    },
  } satisfies TaskChatWorkspace
  return { delivered, workspace }
}

function createSpace(id: string): LocalSpace {
  return {
    activeRunCount: 0,
    additionalDirectories: [],
    createdAt: '2026-09-08T00:00:00.000Z',
    id,
    memoryScope: 'space_only',
    name: id,
    primaryDirectory: null,
    revokedAt: null,
    updatedAt: '2026-09-08T00:00:00.000Z',
  }
}

function bindWorkspace(owner: ReturnType<typeof createOwner>) {
  const props = shallowReactive<ChatWorkspaceProps>({
    activeSearchMessageId: null,
    matchingSearchMessageIds: [],
    workspace: owner.workspace,
  })
  const scope = effectScope()
  const view = scope.run(() => useChatWorkspace(props, shallowRef(null)))!
  cleanups.push(() => scope.stop())
  const composer = scope.run(() => useTaskComposer({
    get composer() { return props.workspace.composer },
    get execution() { return props.workspace.execution },
    get language() { return props.workspace.language.value },
  }))!
  return { props, scope, view, composer }
}

describe('useChatWorkspace', () => {
  it('updates returned bindings when the owning state completes asynchronously', async () => {
    const owner = createOwner('first')
    const { scope, view, composer } = bindWorkspace(owner)
    const { isLoading, language, isEmpty } = view
    const draft = computed(() => composer.bindings.value.draft)
    const canSend = computed(() => composer.bindings.value.canSend)
    const observed: string[] = []
    scope.run(() => watchEffect(() => {
      observed.push(`${language.value}:${draft.value}:${isLoading.value}:${canSend.value}:${isEmpty.value}`)
    }))

    await Promise.resolve()
    owner.workspace.composer.draft.value = 'restored draft'
    owner.workspace.execution.canSend.value = true
    owner.workspace.status.isLoading.value = false
    owner.workspace.session.activeConversationId.value = 'conversation-first'
    owner.workspace.session.activeBranchId.value = 'branch-first'
    owner.workspace.language.value = 'en-US'
    await nextTick()

    expect(observed).toEqual([
      'zh-CN:first draft:true:false:true',
      'en-US:restored draft:false:true:false',
    ])
    expect(view.transcriptBindings.value?.conversationId).toBe('conversation-first')
  })

  it('follows a replacement workspace owner and ignores late updates from the previous owner', async () => {
    const previous = createOwner('previous')
    const next = createOwner('next')
    const { props, view, composer } = bindWorkspace(previous)
    const { language } = view
    const draft = computed(() => composer.bindings.value.draft)
    const draftId = computed(() => composer.bindings.value.draftId)
    next.workspace.language.value = 'en-US'
    props.workspace = next.workspace
    await nextTick()

    expect(draft.value).toBe('next draft')
    expect(draftId.value).toBe('next-draft')
    expect(language.value).toBe('en-US')
    expect(composer.bindings.value.beginImport([])).toEqual(['next'])

    await Promise.resolve()
    previous.workspace.composer.draft.value = 'late previous draft'
    previous.workspace.language.value = 'en-US'
    next.workspace.composer.draft.value = 'updated next draft'
    next.workspace.language.value = 'zh-CN'
    await nextTick()

    expect(draft.value).toBe('updated next draft')
    expect(language.value).toBe('zh-CN')
    expect(composer.bindings.value.beginImport([])).toEqual(['next'])
    expect(previous.workspace.composer.draft.value).toBe('late previous draft')
  })

  it('sends and submits edits through the current owner after the workspace is replaced', async () => {
    const previous = createOwner('previous')
    const next = createOwner('next')
    const { props, composer } = bindWorkspace(previous)
    const { sendMessage } = composer
    props.workspace = next.workspace

    await sendMessage({ content: 'new turn' })
    expect(next.delivered).toEqual([{ mode: 'send', content: 'new turn' }])
    expect(next.workspace.composer.draft.value).toBe('')
    expect(previous.delivered).toEqual([])
    expect(previous.workspace.composer.draft.value).toBe('previous draft')

    next.workspace.execution.editingMessageId.value = 'message-edited'
    next.workspace.composer.draft.value = 'edited content'
    await sendMessage({ content: 'edited content' })

    expect(next.delivered).toEqual([
      { mode: 'send', content: 'new turn' },
      { mode: 'edit', content: 'edited content' },
    ])
    expect(next.workspace.composer.draft.value).toBe('')
    expect(previous.delivered).toEqual([])
  })

  it('keeps a random welcome stable while switching spaces', async () => {
    const random = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
    cleanups.push(() => random.mockRestore())
    const owner = createOwner('first')
    owner.workspace.welcomePreference.value = 'random'
    const { view } = bindWorkspace(owner)

    expect(view.welcomeVariant.value.id).toBe('writing')

    owner.workspace.session.activeSpace.value = createSpace('space-a')
    await nextTick()

    expect(view.welcomeVariant.value.id).toBe('writing')

    owner.workspace.session.activeConversationId.value = 'conversation-first'
    await nextTick()
    owner.workspace.session.activeConversationId.value = null
    await nextTick()

    expect(view.welcomeVariant.value.id).toBe('orchestrating')
  })
})
