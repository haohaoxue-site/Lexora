// @vitest-environment jsdom
import type { BuddyComposerSource } from '@buddy-shared/conversation/composerResource'
import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'
import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import type { JSONContent } from '@tiptap/core'
import type { ChatComposerContextOptions, ChatPromptContextOption } from '@/modules/prompt-input'
import { deferred } from '@buddy-tests/deferred'
import { EditorContent } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { createChatComposerContentFromText, getChatComposerResourceIds } from '@/modules/prompt-input'
import { useChatComposer } from '../useChatComposer'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

function fileOption(name: string): ChatPromptContextOption {
  return {
    description: null,
    kind: 'file',
    label: name,
    path: name,
    source: { bindingId: 'binding-1', relativePath: name, spaceId: 'space-1' },
    value: name,
  }
}

async function mountComposer(options: {
  loadContextOptions?: (query: string | null) => Promise<ChatComposerContextOptions>
  selectSource?: (source: BuddyComposerSource) => Promise<string | null>
  model?: LocalRuntimeModelOption
} = {}) {
  const content = shallowRef(createChatComposerContentFromText(''))
  const draft = shallowRef('')
  const draftId = shallowRef('draft-1')
  const selectedEffort = shallowRef<BuddyThinkingLevel | null>(null)
  const selectedServiceTier = shallowRef<BuddyServiceTier | null>(null)
  const updates: { text: string, content: JSONContent }[] = []
  const sent: string[] = []
  let composer!: ReturnType<typeof useChatComposer>
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(defineComponent({
    setup() {
      composer = useChatComposer({
        canSend: shallowRef(true),
        composerContent: content,
        draft,
        draftId,
        resources: shallowRef([]),
        rejectedResourceIds: () => new Set(),
        isRunning: shallowRef(false),
        isSending: shallowRef(false),
        language: shallowRef('zh-CN'),
        selectedModel: shallowRef(options.model ?? null),
        selectedEffort,
        selectedServiceTier,
        loadContextOptions: options.loadContextOptions ?? (async () => ({ files: [], skills: [] })),
        beginImport: () => [],
        selectSource: options.selectSource ?? (async () => null),
        onSend: payload => sent.push(payload.content),
        onUpdateContent: (text, value) => {
          updates.push({ text, content: value })
          draft.value = text
          content.value = value
        },
      })
      return () => h(EditorContent, { editor: composer.editor.value })
    },
  }))
  app.mount(root)
  await nextTick()
  await nextTick()
  let mounted = true
  function unmount() {
    if (!mounted)
      return
    mounted = false
    app.unmount()
    root.remove()
  }
  cleanups.push(unmount)
  const editor = composer.editor.value!
  function keydown(key: string, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
    editor.view.dom.dispatchEvent(event)
    return event
  }
  return { composer, content, draft, draftId, editor, keydown, selectedEffort, selectedServiceTier, sent, updates, unmount }
}

describe('chat composer editing', () => {
  it('retains unsupported saved model settings and blocks submission until the user selects supported values', async () => {
    const flow = await mountComposer({
      model: {
        available: true,
        capabilities: ['text'],
        contextWindow: 128_000,
        displayName: 'Fixture',
        enabled: true,
        hasParameterOverride: false,
        lastSeenAt: null,
        maxTokens: 4_096,
        modelId: 'fixture',
        overrideContextWindow: null,
        overrideMaxTokens: null,
        providerId: 'fixture',
        reasoningOptions: ['low'],
        serviceTiers: [],
        source: 'builtin',
        sourceContextWindow: 128_000,
        sourceMaxTokens: 4_096,
        sourceParametersUpdated: false,
      },
    })
    flow.editor.commands.insertContent('saved draft')
    flow.selectedEffort.value = 'high'
    flow.selectedServiceTier.value = 'priority'
    flow.composer.submit()
    expect(flow.composer.modelInputIssue.value).toBe('reasoning_unsupported')
    expect(flow.composer.canSubmit.value).toBe(false)
    expect(flow.sent).toEqual([])
    expect(flow.selectedEffort.value).toBe('high')
    expect(flow.selectedServiceTier.value).toBe('priority')

    flow.selectedEffort.value = 'low'
    expect(flow.composer.modelInputIssue.value).toBe('service_tier_unsupported')
    flow.composer.submit()
    expect(flow.sent).toEqual([])

    flow.selectedServiceTier.value = null
    expect(flow.composer.modelInputIssue.value).toBeNull()
    expect(flow.composer.canSubmit.value).toBe(true)
    flow.composer.submit()
    expect(flow.sent).toEqual(['saved draft'])
  })

  it('echoes local transactions once and preserves selection and undo when canonical content returns', async () => {
    const flow = await mountComposer()
    flow.editor.commands.insertContent('first draft')
    const selection = flow.editor.state.selection.toJSON()
    await nextTick()

    expect(flow.updates.map(update => update.text)).toEqual(['first draft'])
    expect(flow.content.value).toEqual(flow.editor.getJSON())
    expect(flow.editor.state.selection.toJSON()).toEqual(selection)

    flow.editor.commands.undo()
    await nextTick()
    expect(flow.editor.getText()).toBe('')
    expect(flow.draft.value).toBe('')
    flow.editor.commands.redo()
    await nextTick()
    expect(flow.draft.value).toBe('first draft')
  })

  it('hydrates an external draft without emitting it back and resumes local transaction updates', async () => {
    const flow = await mountComposer()
    flow.editor.commands.insertContent('local')
    await nextTick()
    flow.draftId.value = 'draft-2'
    flow.draft.value = 'restored'
    flow.content.value = createChatComposerContentFromText('restored')
    await nextTick()

    expect(flow.editor.getText()).toBe('restored')
    expect(flow.updates.map(update => update.text)).toEqual(['local'])
    flow.editor.commands.insertContentAt(9, ' text')
    await nextTick()
    expect(flow.draft.value).toBe('restored text')
    expect(flow.updates.map(update => update.text)).toEqual(['local', 'restored text'])
  })

  it('does not submit or expose suggestions during IME composition and restores the trigger afterward', async () => {
    const flow = await mountComposer()
    flow.editor.view.dom.focus()
    flow.editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    flow.editor.commands.insertContent('@notes')
    await nextTick()
    expect(flow.composer.activeTrigger.value).toBeNull()
    flow.keydown('Enter', { isComposing: true })
    expect(flow.sent).toEqual([])
    expect(flow.editor.getText()).toBe('@notes')

    flow.editor.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    await nextTick()
    expect(flow.composer.activeTrigger.value).toEqual({ kind: 'mention', query: 'notes' })
  })

  it('inserts a line break with Shift Enter and submits with Enter', async () => {
    const flow = await mountComposer()
    flow.editor.commands.insertContent('notes')
    flow.keydown('Enter', { shiftKey: true })
    expect(flow.editor.getJSON().content?.[0]?.content?.at(-1)?.type).toBe('hardBreak')
    expect(flow.sent).toEqual([])
    flow.keydown('Enter')
    expect(flow.sent).toEqual(['notes'])
  })

  it('keeps an empty mention active and prevents Enter from accidentally submitting until it is dismissed', async () => {
    const pending = deferred<ChatComposerContextOptions>()
    const flow = await mountComposer({ loadContextOptions: () => pending.promise })
    flow.editor.view.dom.focus()
    flow.editor.commands.insertContent('@')
    await nextTick()
    expect(flow.keydown('Enter').defaultPrevented).toBe(true)
    expect(flow.sent).toEqual([])
    pending.resolve({ files: [], skills: [] })
    await nextTick()
    await nextTick()
    expect(flow.composer.isLoadingContext.value).toBe(false)
    expect(flow.composer.activeTrigger.value).toEqual({ kind: 'mention', query: '' })
    flow.keydown('Enter')
    expect(flow.sent).toEqual([])
    flow.keydown('Escape')
    expect(flow.composer.activeTrigger.value).toBeNull()
    expect(flow.editor.getText()).toBe('@')
    flow.keydown('Enter')
    expect(flow.sent).toEqual(['@'])
  })

  it('keeps the latest query results when earlier requests fail and invalidates queries across drafts', async () => {
    const old = deferred<ChatComposerContextOptions>()
    const latest = deferred<ChatComposerContextOptions>()
    const leaving = deferred<ChatComposerContextOptions>()
    const requests = [old, latest, leaving]
    const flow = await mountComposer({ loadContextOptions: () => requests.shift()!.promise })
    const oldRequest = flow.composer.loadContextOptions('old')
    const latestRequest = flow.composer.loadContextOptions('latest')
    latest.resolve({ files: [fileOption('latest.txt')], skills: [] })
    await latestRequest
    old.reject(new Error('Old query failed'))
    await oldRequest
    expect(flow.composer.sourceOptions.value.map(option => option.label)).toEqual(['latest.txt'])
    expect(flow.composer.isLoadingContext.value).toBe(false)

    const leavingRequest = flow.composer.loadContextOptions('leaving')
    flow.draftId.value = 'draft-2'
    leaving.resolve({ files: [fileOption('old-draft.txt')], skills: [] })
    await leavingRequest
    expect(flow.composer.sourceOptions.value).toEqual([])
    expect(flow.composer.isLoadingContext.value).toBe(false)
  })

  it.each(['panel', 'inline'] as const)('does not insert a pending %s source after leaving and returning to the original draft', async (placement) => {
    const selecting = deferred<string | null>()
    const flow = await mountComposer({ selectSource: () => selecting.promise })
    flow.editor.commands.insertContent('@notes')
    flow.composer.activeTrigger.value = { kind: 'mention', query: 'notes' }
    const selected = placement === 'panel'
      ? flow.composer.selectPanelSource(fileOption('notes.txt'))
      : flow.composer.selectSuggestion(fileOption('notes.txt'))
    flow.draftId.value = 'draft-2'
    flow.draftId.value = 'draft-1'
    selecting.resolve('resource-1')
    await selected
    await nextTick()

    expect(getChatComposerResourceIds(flow.editor.getJSON())).toEqual([])
    expect(flow.editor.getText()).toBe('@notes')
  })

  it('maps a pending inline source through later typing in the same draft without moving the selection', async () => {
    const selecting = deferred<string | null>()
    const flow = await mountComposer({ selectSource: () => selecting.promise })
    flow.editor.commands.insertContent('@notes')
    flow.composer.activeTrigger.value = { kind: 'mention', query: 'notes' }
    flow.composer.selectSuggestion(fileOption('notes.txt'))
    flow.editor.commands.insertContentAt(1, 'before ')
    flow.editor.commands.setTextSelection(flow.editor.state.doc.content.size - 1)
    flow.editor.commands.insertContent(' after')
    selecting.resolve('resource-1')
    await nextTick()
    await nextTick()

    expect(getChatComposerResourceIds(flow.editor.getJSON())).toEqual(['resource-1'])
    expect(flow.editor.getText()).toContain('before ')
    expect(flow.editor.getText()).toContain(' after')
    expect(flow.editor.state.selection.from).toBe(flow.editor.state.doc.content.size - 1)
  })

  it('discards query results after the editor scope is disposed', async () => {
    const pending = deferred<ChatComposerContextOptions>()
    const flow = await mountComposer({ loadContextOptions: () => pending.promise })
    const loading = flow.composer.loadContextOptions('notes')
    flow.unmount()
    pending.resolve({ files: [fileOption('notes.txt')], skills: [] })
    await loading
    expect(flow.composer.sourceOptions.value).toEqual([])
    expect(flow.composer.isLoadingContext.value).toBe(false)
  })
})
