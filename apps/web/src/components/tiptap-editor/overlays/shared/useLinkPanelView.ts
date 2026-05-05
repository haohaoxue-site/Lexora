import type { ComponentPublicInstance, ShallowRef } from 'vue'
import type { LinkPanelController } from './useLinkPanel'
import { nextTick, shallowRef, watch } from 'vue'

interface FocusableElement {
  focus: () => void
}

type LinkPanelRefTarget = Element | ComponentPublicInstance | null

/** 链接面板视图控制器。 */
export interface LinkPanelViewController {
  /** 主输入框引用 */
  primaryInputRef: ShallowRef<FocusableElement | null>
  /** 次输入框引用 */
  secondaryInputRef: ShallowRef<FocusableElement | null>
  /** 绑定主输入框引用 */
  assignPrimaryInputRef: (element: LinkPanelRefTarget) => void
  /** 绑定次输入框引用 */
  assignSecondaryInputRef: (element: LinkPanelRefTarget) => void
  /** 输入框键盘协议 */
  handleInputKeydown: (event: Event | KeyboardEvent) => void
}

export function useLinkPanelView(controller: LinkPanelController): LinkPanelViewController {
  const primaryInputRef = shallowRef<FocusableElement | null>(null)
  const secondaryInputRef = shallowRef<FocusableElement | null>(null)

  watch(
    () => [controller.isOpen.value, controller.mode.value] as const,
    async ([isOpen]) => {
      if (!isOpen) {
        return
      }

      await nextTick()
      primaryInputRef.value?.focus()
    },
  )

  function assignPrimaryInputRef(element: LinkPanelRefTarget) {
    primaryInputRef.value = normalizeFocusableElement(element)
  }

  function assignSecondaryInputRef(element: LinkPanelRefTarget) {
    secondaryInputRef.value = normalizeFocusableElement(element)
  }

  function handleInputKeydown(event: Event | KeyboardEvent) {
    if (!(event instanceof KeyboardEvent)) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      controller.apply()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      controller.cancel()
      return
    }

    if (
      controller.mode.value === 'empty-block'
      && event.key === 'Tab'
      && event.shiftKey === false
    ) {
      event.preventDefault()
      secondaryInputRef.value?.focus()
    }
  }

  return {
    primaryInputRef,
    secondaryInputRef,
    assignPrimaryInputRef,
    assignSecondaryInputRef,
    handleInputKeydown,
  }
}

function normalizeFocusableElement(target: LinkPanelRefTarget): FocusableElement | null {
  if (!target || typeof target !== 'object') {
    return null
  }

  const focus = (target as unknown as { focus?: unknown }).focus
  return typeof focus === 'function' ? target as unknown as FocusableElement : null
}
