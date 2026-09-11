import { nextTick, onScopeDispose, watch } from 'vue'

interface ComposerSubmissionFocusOptions {
  draftId: () => string
  ready: () => boolean
  inputElement: () => HTMLElement | null | undefined
  restoreFocus: () => void
}

export function useComposerSubmissionFocus(options: ComposerSubmissionFocusOptions) {
  let pending: { controller: AbortController, draftId: string, completed: boolean } | null = null

  function cancelPending() {
    pending?.controller.abort()
    pending = null
  }

  async function restorePending() {
    const request = pending
    if (!request?.completed || !options.ready())
      return
    await nextTick()
    if (pending !== request || !options.ready())
      return
    const input = options.inputElement()
    if (!input?.isConnected)
      return
    if (options.draftId() === request.draftId && input.ownerDocument.hasFocus()
      && !input.ownerDocument.hidden && !input.closest('[inert]')) {
      options.restoreFocus()
    }
    cancelPending()
  }

  watch(options.draftId, cancelPending)
  watch([options.ready, options.inputElement], restorePending, { flush: 'post' })
  onScopeDispose(cancelPending)

  async function withSubmissionFocus(submit: () => Promise<unknown>) {
    cancelPending()
    const input = options.inputElement()
    const document = input?.ownerDocument
    const window = document?.defaultView
    if (!input?.isConnected || !document?.hasFocus() || document.hidden || !window)
      return submit()

    const controller = new AbortController()
    const request = { controller, draftId: options.draftId(), completed: false }
    pending = request
    const listenerOptions = { capture: true, signal: controller.signal }
    const cancelOutsideInput = (event: Event) => {
      if (!(event.target instanceof Node) || !options.inputElement()?.contains(event.target))
        cancelPending()
    }
    document.addEventListener('pointerdown', cancelOutsideInput, listenerOptions)
    document.addEventListener('focusin', cancelOutsideInput, listenerOptions)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab')
        cancelPending()
    }, listenerOptions)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden)
        cancelPending()
    }, listenerOptions)
    window.addEventListener('blur', cancelPending, { signal: controller.signal })

    try {
      return await submit()
    }
    finally {
      if (pending === request) {
        request.completed = true
        await restorePending()
      }
    }
  }

  return { withSubmissionFocus }
}
