import type { DesktopBrowserState } from '@buddy-electron/shared/desktopApi'
import type { LocalRunOutput } from '@buddy-shared/runs/runApi'
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { deferred } from '../../../../../../__tests__/deferred'
import { useTaskResourcePanel } from '../useTaskResourcePanel'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function fixture() {
  const scope = effectScope()
  scopes.push(scope)
  const activeConversationId = shallowRef<string | null>('conversation')
  const gate = deferred<DesktopBrowserState>()
  let sessionOpen = true
  const browser = {
    onStateChanged: () => () => {},
    ensureSession: () => gate.promise,
    close: async () => { sessionOpen = false },
    openArtifact: async () => { throw new Error('preview unavailable') },
  }
  const runOutputs = shallowRef<readonly LocalRunOutput[]>([{
    runId: 'run',
    createdAt: '2026-09-08T00:00:00.000Z',
    sourceToolCallId: 'tool',
    artifacts: [{ artifactId: 'html', conversationId: 'conversation', createdAt: '2026-09-08T00:00:00.000Z', kind: 'file', mimeType: 'text/html', name: 'page.html', path: '/workspace/page.html', previewUrl: null, runId: 'run', sizeBytes: 10, sourceArtifactId: null, sourceToolCallId: 'tool', updatedAt: '2026-09-08T00:00:00.000Z' }],
  }])
  const panel = scope.run(() => useTaskResourcePanel({ spaces: shallowRef([]), activeConversationId, activeRunId: shallowRef(null), browser, changeSets: shallowRef([]), runSignalEvents: shallowRef([]), runOutputs }))!
  const release = () => gate.resolve({ sessionId: 'session' } as DesktopBrowserState)
  return { activeConversationId, browser, panel, release, scope, sessionOpen: () => sessionOpen }
}

describe('resource panel operations', () => {
  it('retains late manual sessions across task changes without updating another tab', async () => {
    const f = fixture()
    f.activeConversationId.value = null
    f.panel.addBrowser()
    const first = f.panel.activeTab.value!
    f.panel.addBrowser()
    const second = f.panel.activeTab.value!
    if (first.kind !== 'browser' || second.kind !== 'browser')
      throw new Error('Expected browser tabs')
    const firstState = { conversationId: null, sessionId: 'first-session', title: 'First' } as DesktopBrowserState
    const secondState = { conversationId: null, sessionId: 'second-session', title: 'Second' } as DesktopBrowserState
    f.activeConversationId.value = 'other'
    f.panel.retainBrowserSession(firstState, first.browserKey)
    f.panel.retainBrowserSession(secondState, second.browserKey)
    f.panel.updateBrowserState({ ...firstState, title: 'Late first update' })
    await nextTick()
    expect(f.panel.activeBrowserState.value).toEqual(secondState)
    f.panel.selectTab(first.id)
    expect(f.panel.activeBrowserState.value).toEqual(firstState)
    expect(f.sessionOpen()).toBe(true)
  })

  it('restores a failed manual close after changing tasks without taking focus', async () => {
    const f = fixture()
    const closing = deferred<void>()
    f.browser.close = () => closing.promise
    f.panel.addBrowser()
    const tab = f.panel.activeTab.value!
    if (tab.kind !== 'browser')
      throw new Error('Expected a browser tab')
    f.panel.retainBrowserSession({ conversationId: null, sessionId: 'manual-session' } as DesktopBrowserState, tab.browserKey)
    const result = f.panel.closeTab(tab.id)
    f.activeConversationId.value = 'other'
    f.panel.addBrowser()
    const selected = f.panel.activeTab.value
    closing.reject(new Error('close failed'))
    expect(await result).toBe(false)
    expect(f.panel.activeTab.value).toEqual(selected)
    expect(f.panel.tabs.value.map(tab => tab.id)).toContain(tab.id)
  })

  it('closes an uninitialized manual tab and releases its late session without restoring the tab', async () => {
    const f = fixture()
    f.panel.addBrowser()
    const tab = f.panel.activeTab.value!
    expect(await f.panel.closeTab(tab.id)).toBe(true)
    if (tab.kind !== 'browser')
      throw new Error('Expected a browser tab')
    f.panel.retainBrowserSession({ sessionId: 'session', conversationId: null } as DesktopBrowserState, tab.browserKey)
    await nextTick()
    expect(f.sessionOpen()).toBe(false)
    expect(f.panel.tabs.value).toEqual([])
  })

  it('does not close a browser reopened while its old close awaits the session', async () => {
    const f = fixture()
    f.panel.openBrowser()
    const closing = f.panel.closeTab('browser:conversation')
    expect(f.panel.tabs.value).toEqual([])
    f.panel.openBrowser()
    f.release()
    expect(await closing).toBe(false)
    expect(f.sessionOpen()).toBe(true)
    expect(f.panel.activeTab.value?.id).toBe('browser:conversation')
  })

  it('does not let failed artifact loading reopen a collapsed panel', async () => {
    const f = fixture()
    const opening = f.panel.openArtifact('html')
    f.panel.toggle()
    f.release()
    await opening
    expect(f.panel.isOpen.value).toBe(false)
    expect(f.panel.tabs.value.map(tab => tab.kind)).toEqual(['browser'])
  })

  it('invalidates a close across A to B to A even before Vue renders', async () => {
    const f = fixture()
    f.panel.openBrowser()
    const closing = f.panel.closeTab('browser:conversation')
    f.activeConversationId.value = 'other'
    f.activeConversationId.value = 'conversation'
    f.release()
    await closing
    await nextTick()
    expect(f.sessionOpen()).toBe(true)
    expect(f.panel.tabs.value).toEqual([])
  })

  it('restores a failed background close without taking focus from the selected artifact', async () => {
    const f = fixture()
    f.release()
    await f.panel.openArtifact('html')
    f.browser.close = async () => {
      throw new Error('close failed')
    }
    expect(await f.panel.closeTab('browser:conversation')).toBe(false)
    expect(f.panel.activeTab.value?.kind).toBe('artifact')
    expect(f.panel.tabs.value.map(tab => tab.kind).sort()).toEqual(['artifact', 'browser'])
  })

  it('restores a tab after a current close fails and retains HTML fallback', async () => {
    const f = fixture()
    f.browser.close = async () => {
      throw new Error('close failed')
    }
    f.panel.openBrowser()
    const closing = f.panel.closeTab('browser:conversation')
    f.release()
    expect(await closing).toBe(false)
    expect(f.panel.activeTab.value?.kind).toBe('browser')
    await f.panel.openArtifact('html')
    expect(f.panel.activeTab.value?.kind).toBe('artifact')
  })
})
