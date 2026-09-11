// @vitest-environment jsdom
import { deferred } from '@buddy-tests/deferred'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useComposerSubmissionFocus } from '../useComposerSubmissionFocus'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
})

function createFixture() {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const root = document.createElement('div')
  document.body.append(root)
  let input = document.createElement('input')
  input.value = 'original draft'
  const other = document.createElement('button')
  other.textContent = 'Other action'
  root.append(input, other)
  input.focus()
  const draftId = shallowRef('draft-1')
  const ready = shallowRef(true)
  const scope = effectScope()
  const focus = scope.run(() => useComposerSubmissionFocus({
    draftId: () => draftId.value,
    ready: () => ready.value,
    inputElement: () => input,
    restoreFocus: () => input.focus({ preventScroll: true }),
  }))!
  cleanups.push(() => {
    scope.stop()
    root.remove()
  })
  function replaceInput() {
    const next = document.createElement('input')
    input.replaceWith(next)
    input = next
  }
  return {
    draftId,
    focus,
    get input() {
      return input
    },
    other,
    ready,
    replaceInput,
    root,
    scope,
  }
}

describe('composer submission focus', () => {
  it('focuses the replacement input after the submitted draft is cleared', async () => {
    const flow = createFixture()
    const receipt = deferred<boolean>()
    const sending = flow.focus.withSubmissionFocus(() => receipt.promise)
    flow.replaceInput()
    receipt.resolve(true)
    expect(await sending).toBe(true)
    expect(document.activeElement).toBe(flow.input)
    expect(flow.input.value).toBe('')
  })

  it.each([false, true])('waits for the pane to become interactive and honors cancellation while waiting: %s', async (cancelled) => {
    const flow = createFixture()
    const receipt = deferred<boolean>()
    const sending = flow.focus.withSubmissionFocus(() => receipt.promise)
    flow.ready.value = false
    flow.replaceInput()
    receipt.resolve(true)
    await sending
    expect(document.activeElement).not.toBe(flow.input)
    if (cancelled)
      flow.other.focus()
    flow.ready.value = true
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(cancelled ? flow.other : flow.input)
  })

  it('restores focus without changing the failed draft or its selection', async () => {
    const flow = createFixture()
    flow.input.setSelectionRange(3, 7)
    const receipt = deferred<boolean>()
    const sending = flow.focus.withSubmissionFocus(() => receipt.promise)
    flow.input.blur()
    receipt.resolve(false)
    expect(await sending).toBe(false)
    expect(document.activeElement).toBe(flow.input)
    expect(flow.input.value).toBe('original draft')
    expect([flow.input.selectionStart, flow.input.selectionEnd]).toEqual([3, 7])
  })

  it.each(['pointer', 'focus', 'tab', 'window', 'hidden'] as const)(
    'does not reclaim focus after a newer %s intent, even when the window is active again',
    async (intent) => {
      const flow = createFixture()
      const receipt = deferred<boolean>()
      const sending = flow.focus.withSubmissionFocus(() => receipt.promise)
      if (intent === 'pointer')
        flow.root.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      if (intent === 'focus')
        flow.other.focus()
      if (intent === 'tab')
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
      if (intent === 'window')
        window.dispatchEvent(new Event('blur'))
      if (intent === 'hidden') {
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
        hidden.mockReturnValue(false)
      }
      flow.replaceInput()
      receipt.resolve(true)
      await sending
      expect(document.activeElement).not.toBe(flow.input)
      if (intent === 'focus')
        expect(document.activeElement).toBe(flow.other)
    },
  )

  it('does not restore a stale submission after switching drafts and returning', async () => {
    const flow = createFixture()
    const receipt = deferred<boolean>()
    const sending = flow.focus.withSubmissionFocus(() => receipt.promise)
    flow.draftId.value = 'draft-2'
    await nextTick()
    flow.draftId.value = 'draft-1'
    flow.replaceInput()
    receipt.resolve(true)
    await sending
    expect(document.activeElement).not.toBe(flow.input)
  })

  it('invalidates pending restoration when its owner is disposed', async () => {
    const flow = createFixture()
    const receipt = deferred<boolean>()
    const sending = flow.focus.withSubmissionFocus(() => receipt.promise)
    flow.scope.stop()
    flow.replaceInput()
    receipt.resolve(true)
    await sending
    expect(document.activeElement).not.toBe(flow.input)
  })

  it('does not focus the composer for a submission begun in a background window', async () => {
    const flow = createFixture()
    vi.mocked(document.hasFocus).mockReturnValue(false)
    const receipt = deferred<boolean>()
    const sending = flow.focus.withSubmissionFocus(() => receipt.promise)
    flow.replaceInput()
    vi.mocked(document.hasFocus).mockReturnValue(true)
    receipt.resolve(true)
    await sending
    expect(document.activeElement).not.toBe(flow.input)
  })

  it('only lets the latest pending submission restore focus', async () => {
    const flow = createFixture()
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const sendingFirst = flow.focus.withSubmissionFocus(() => first.promise)
    const sendingSecond = flow.focus.withSubmissionFocus(() => second.promise)
    flow.replaceInput()
    first.resolve(true)
    await sendingFirst
    expect(document.activeElement).not.toBe(flow.input)
    second.resolve(true)
    await sendingSecond
    expect(document.activeElement).toBe(flow.input)
  })
})
