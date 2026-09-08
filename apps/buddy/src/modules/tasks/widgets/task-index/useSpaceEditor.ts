import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { TaskSpaceInput } from '../../state/task-index/typing'
import { computed, onScopeDispose, reactive, readonly, shallowRef, watch } from 'vue'

interface SpaceEditorOptions {
  show: () => boolean
  space: () => LocalSpace | null
  selectDirectory: () => Promise<string | null>
  save: (input: TaskSpaceInput) => Promise<boolean>
  onSaved: () => void
}

export function useSpaceEditor(options: SpaceEditorOptions) {
  const form = reactive<TaskSpaceInput>({ memoryScope: 'personal_and_space', name: '', primaryDirectory: null })
  const saving = shallowRef(false)
  const selectingDirectory = shallowRef(false)
  const failed = shallowRef(false)
  let session = 0
  watch([options.show, () => options.space()?.id], ([show]) => {
    session += 1
    saving.value = false
    selectingDirectory.value = false
    failed.value = false
    if (!show)
      return
    const space = options.space()
    Object.assign(form, {
      memoryScope: space?.memoryScope ?? 'personal_and_space',
      name: space?.name ?? '',
      primaryDirectory: space?.primaryDirectory ? { id: space.primaryDirectory.id, root: space.primaryDirectory.root } : null,
    })
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    session += 1
  })
  const directoryEditingDisabled = computed(() => Boolean(options.space()?.activeRunCount))
  const directoryConfigurationChanged = computed(() => {
    const existing = options.space()?.primaryDirectory
    return (form.primaryDirectory?.id ?? null) !== (existing?.id ?? null)
      || (form.primaryDirectory?.root ?? null) !== (existing?.root ?? null)
  })
  const directoryChangeBlocked = computed(() => directoryEditingDisabled.value && directoryConfigurationChanged.value)
  const canSave = computed(() => Boolean(form.name.trim()) && !saving.value && !selectingDirectory.value && !directoryChangeBlocked.value)

  async function selectPrimaryDirectory() {
    if (form.primaryDirectory || directoryEditingDisabled.value || selectingDirectory.value || saving.value)
      return
    const current = session
    selectingDirectory.value = true
    failed.value = false
    try {
      const selected = await options.selectDirectory()
      if (!selected || current !== session || directoryEditingDisabled.value)
        return
      const existing = options.space()?.additionalDirectories.find(directory => directory.root === selected)
      form.primaryDirectory = { id: existing?.id ?? null, root: selected }
    }
    catch {
      if (current === session)
        failed.value = true
    }
    finally {
      if (current === session)
        selectingDirectory.value = false
    }
  }

  async function save() {
    if (!options.show() || !canSave.value)
      return
    const current = session
    const input: TaskSpaceInput = {
      memoryScope: form.memoryScope,
      name: form.name.trim(),
      primaryDirectory: form.primaryDirectory ? { ...form.primaryDirectory } : null,
    }
    const editingValue = JSON.stringify(form)
    saving.value = true
    failed.value = false
    try {
      const saved = await options.save(input)
      if (current !== session)
        return
      failed.value = !saved
      if (saved && JSON.stringify(form) === editingValue)
        options.onSaved()
    }
    catch {
      if (current === session)
        failed.value = true
    }
    finally {
      if (current === session)
        saving.value = false
    }
  }

  return { canSave, directoryChangeBlocked, directoryEditingDisabled, failed: readonly(failed), form, save, saving: readonly(saving), selectingDirectory: readonly(selectingDirectory), selectPrimaryDirectory }
}
