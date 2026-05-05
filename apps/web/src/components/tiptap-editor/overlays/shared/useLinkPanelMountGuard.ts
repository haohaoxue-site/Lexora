import type { WatchSource } from 'vue'
import type { LinkPanelController } from './useLinkPanel'
import { watch } from 'vue'

export function useLinkPanelMountGuard(
  linkPanel: LinkPanelController,
  shouldKeepMounted: WatchSource<boolean>,
) {
  watch(shouldKeepMounted, (nextShouldKeepMounted) => {
    if (!linkPanel.isOpen.value || nextShouldKeepMounted) {
      return
    }

    linkPanel.dismiss()
  })
}
