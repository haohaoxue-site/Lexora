import type { BuddyWindowResizeDirection } from '@/lib/tauriRuntime'
import { shallowRef } from 'vue'
import {
  getBuddyCurrentWindowFrameState,
  hideBuddyCurrentWindow,
  minimizeBuddyCurrentWindow,
  setBuddyCurrentWindowAlwaysOnTop,
  startBuddyCurrentWindowDragging,
  startBuddyCurrentWindowResizing,
  toggleBuddyCurrentWindowMaximize,
} from '@/lib/tauriRuntime'

export function useBuddyWindowFrame() {
  const isMaximized = shallowRef(false)
  const isPinned = shallowRef(false)

  async function refreshWindowState() {
    await runWindowAction(async () => {
      applyWindowFrameState(await getBuddyCurrentWindowFrameState())
    })
  }

  async function refreshMaximized() {
    await refreshWindowState()
  }

  async function minimize() {
    await runWindowAction(async () => {
      await minimizeBuddyCurrentWindow()
    })
  }

  async function toggleMaximize() {
    await runWindowAction(async () => {
      applyWindowFrameState(await toggleBuddyCurrentWindowMaximize())
    })
  }

  async function togglePin() {
    await runWindowAction(async () => {
      applyWindowFrameState(await setBuddyCurrentWindowAlwaysOnTop(!isPinned.value))
    })
  }

  async function startDragging() {
    await runWindowAction(async () => {
      await startBuddyCurrentWindowDragging()
    })
  }

  async function startResizing(direction: BuddyWindowResizeDirection) {
    await runWindowAction(async () => {
      await startBuddyCurrentWindowResizing(direction)
    })
  }

  async function hide() {
    await runWindowAction(async () => {
      await hideBuddyCurrentWindow()
    })
  }

  async function runWindowAction(action: () => Promise<void>) {
    try {
      await action()
    }
    catch (error) {
      console.error('Lexora window action failed', error)
    }
  }

  function applyWindowFrameState(state: { isAlwaysOnTop: boolean, isMaximized: boolean }) {
    isMaximized.value = state.isMaximized
    isPinned.value = state.isAlwaysOnTop
  }

  return {
    hide,
    isMaximized,
    isPinned,
    minimize,
    refreshMaximized,
    refreshWindowState,
    startDragging,
    startResizing,
    toggleMaximize,
    togglePin,
  }
}
