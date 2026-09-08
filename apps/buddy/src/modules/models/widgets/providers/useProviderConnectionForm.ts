import type { LocalCustomProvider, LocalProvider } from '@buddy-shared/providers/providerApi'
import type { Ref } from 'vue'
import type { ProviderConnectionActions } from './typing'
import { computed, reactive, shallowRef, watch } from 'vue'

interface ProviderConnectionInput {
  actions: ProviderConnectionActions
  provider: LocalProvider
}

export function useProviderConnectionForm(props: ProviderConnectionInput, show: Ref<boolean>) {
  const saving = shallowRef(false)
  const form = reactive({ api: '', baseUrl: '', description: '', displayName: '' })
  const canSave = computed(() => Boolean(form.displayName.trim() && form.baseUrl.trim()))

  watch([show, () => props.provider], ([visible, provider]) => {
    if (!visible) {
      props.actions.clearError()
      return
    }
    props.actions.clearError()
    form.api = provider.api ?? 'openai-responses'
    form.baseUrl = provider.baseUrl ?? ''
    form.description = provider.description ?? ''
    form.displayName = provider.displayName
  }, { immediate: true })

  function close() {
    props.actions.clearError()
    show.value = false
  }

  async function save() {
    if (!canSave.value)
      return
    saving.value = true
    const succeeded = await props.actions.save({
      api: form.api as LocalCustomProvider['api'],
      baseUrl: form.baseUrl.trim(),
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim(),
      enabled: props.provider.enabled,
      id: props.provider.id,
    })
    saving.value = false
    if (succeeded)
      close()
  }

  return { saving, form, canSave, close, save }
}
