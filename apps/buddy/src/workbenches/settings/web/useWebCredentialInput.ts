import { computed, onScopeDispose, shallowRef, watch } from 'vue'

export function useWebCredentialInput(options: {
  configured: () => boolean
  reveal: () => Promise<string | null>
  save: (key: string | null) => Promise<boolean>
}) {
  const draft = shallowRef<string | null>(null)
  const revealed = shallowRef<string | null>(null)
  const visible = shallowRef(false)
  const revealing = shallowRef(false)
  const revealFailed = shallowRef(false)
  let revision = 0
  const masked = computed(() => draft.value === null && !visible.value && options.configured())
  const value = computed(() => draft.value ?? (visible.value ? revealed.value ?? '' : options.configured() ? '****' : ''))
  const canSave = computed(() => draft.value !== null && !/^\*+$/.test(draft.value.trim()) && (options.configured() || Boolean(draft.value.trim())))

  function reset() {
    revision++
    draft.value = revealed.value = null
    visible.value = revealing.value = revealFailed.value = false
  }

  async function toggleVisibility() {
    if (visible.value) {
      revision++
      visible.value = false
      revealed.value = null
      return
    }
    if (draft.value !== null || !options.configured()) {
      visible.value = true
      return
    }
    if (revealing.value)
      return
    const request = ++revision
    revealing.value = true
    revealFailed.value = false
    try {
      const key = await options.reveal()
      if (request !== revision)
        return
      revealed.value = key
      visible.value = true
    }
    catch {
      if (request === revision)
        revealFailed.value = true
    }
    finally {
      if (request === revision)
        revealing.value = false
    }
  }

  function update(value: string) {
    revision++
    revealing.value = false
    revealFailed.value = false
    revealed.value = null
    draft.value = value
  }

  async function save() {
    if (canSave.value && await options.save(draft.value!.trim() || null))
      reset()
  }

  watch(options.configured, reset)
  onScopeDispose(reset)

  return {
    value,
    masked,
    visible,
    revealing,
    revealFailed,
    canSave,
    update,
    toggleVisibility,
    save,
  }
}
