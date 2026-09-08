import type { DesktopTaskPinnedItem } from '@buddy-electron/shared/desktopApi'
import { deferred } from '@buddy-tests/deferred'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { useTaskPinnedItems } from '../useTaskPinnedItems'

const original: DesktopTaskPinnedItem = { id: 'original-task', kind: 'conversation' }
const space: DesktopTaskPinnedItem = { id: 'sample-space', kind: 'space' }
const newest: DesktopTaskPinnedItem = { id: 'newest-task', kind: 'conversation' }

describe('useTaskPinnedItems', () => {
  it('keeps the newest optimistic order while earlier saves finish and serializes persistence', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const config = shallowRef({ desktop: { taskSidebarPinnedItems: [original] } })
    const saves = [first, second]
    const updateSettings = vi.fn(async (patch: { desktop: { taskSidebarPinnedItems: DesktopTaskPinnedItem[] } }) => {
      const saved = await saves.shift()!.promise
      if (saved)
        config.value = patch
      return saved
    })
    const pins = useTaskPinnedItems({ config, updateSettings })
    expect(pins.pinnedItems.value).toEqual([original])

    const firstSave = pins.setPinnedItems([space, original])
    const secondSave = pins.setPinnedItems([newest, space, original])
    await nextTick()
    expect(pins.pinnedItems.value).toEqual([newest, space, original])
    expect(updateSettings).toHaveBeenCalledTimes(1)

    first.resolve(true)
    await firstSave
    expect(config.value.desktop.taskSidebarPinnedItems).toEqual([space, original])
    expect(pins.pinnedItems.value).toEqual([newest, space, original])

    second.resolve(true)
    await secondSave
    expect(config.value.desktop.taskSidebarPinnedItems).toEqual([newest, space, original])
    expect(pins.pinnedItems.value).toEqual([newest, space, original])
  })

  it('restores the last confirmed order on failure and accepts subsequent saves', async () => {
    const config = shallowRef({ desktop: { taskSidebarPinnedItems: [original] } })
    const updateSettings = vi.fn(async () => false)
    const pins = useTaskPinnedItems({ config, updateSettings })
    const failedSave = pins.setPinnedItems([space, original])
    expect(pins.pinnedItems.value).toEqual([space, original])
    expect(await failedSave).toBe(false)
    expect(pins.pinnedItems.value).toEqual([original])

    updateSettings.mockImplementation(async () => {
      config.value = { desktop: { taskSidebarPinnedItems: [newest, original] } }
      return true
    })
    expect(await pins.setPinnedItems([newest, original])).toBe(true)
    expect(pins.pinnedItems.value).toEqual([newest, original])
  })
})
