import type { DesktopBrowserState } from '@buddy-electron/shared/desktopApi'
import type { DeepReadonly, Ref } from 'vue'
import { onScopeDispose, readonly, shallowRef, watch } from 'vue'

export function useBrowserAddress(
  state: Readonly<Ref<DeepReadonly<DesktopBrowserState> | null>>,
  navigate: (address: string) => Promise<boolean>,
) {
  const address = shallowRef('')
  let dirty = false
  let editVersion = 0
  watch([() => state.value?.sessionId, () => state.value?.url], ([sessionId, url], previous) => {
    if (sessionId !== previous?.[0]) {
      editVersion += 1
      dirty = false
      address.value = url && url !== 'about:blank' ? url : ''
    }
    else if (url && url !== 'about:blank' && !dirty) {
      address.value = url
    }
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    editVersion += 1
  })

  function updateAddress(value: string) {
    editVersion += 1
    dirty = true
    address.value = value
  }

  async function openAddress() {
    const version = ++editVersion
    const opened = await navigate(address.value)
    if (!opened || editVersion !== version)
      return
    dirty = false
    const url = state.value?.url
    if (url && url !== 'about:blank')
      address.value = url
  }

  return { address: readonly(address), openAddress, updateAddress }
}
