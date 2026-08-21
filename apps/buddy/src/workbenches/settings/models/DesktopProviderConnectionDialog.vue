<script setup lang="ts">
import type { LocalCustomProvider, LocalProvider } from '@buddy-electron/shared/localChatApi'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import { NAlert, NButton, NCard, NInput, NModal, NSelect } from 'naive-ui'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopProviderApiOptions } from '@/workbenches/settings/models/desktopProviderApiOptions'

const props = defineProps<{
  providerSettings: ModelProvidersStore
  provider: LocalProvider
}>()
const show = defineModel<boolean>('show', { required: true })
const providerSettings = props.providerSettings
const { t } = useBuddyI18n(providerSettings.language)
const saving = shallowRef(false)
const form = reactive({ api: '', baseUrl: '', description: '', displayName: '' })
const canSave = computed(() => Boolean(form.displayName.trim() && form.baseUrl.trim()))

watch([show, () => props.provider], ([visible, provider]) => {
  if (!visible) {
    providerSettings.clearModelProviderError()
    return
  }
  providerSettings.clearModelProviderError()
  form.api = provider.api ?? 'openai-responses'
  form.baseUrl = provider.baseUrl ?? ''
  form.description = provider.description ?? ''
  form.displayName = provider.displayName
}, { immediate: true })

function close() {
  providerSettings.clearModelProviderError()
  show.value = false
}

async function save() {
  if (!canSave.value)
    return
  saving.value = true
  const succeeded = await providerSettings.upsertCustomProvider({
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
</script>

<template>
  <NModal v-model:show="show" :mask-closable="false">
    <NCard
      class="desktop-provider-connection-dialog"
      closable
      :style="{ width: 'min(42rem, calc(100vw - 2rem))' }"
      @close="close"
    >
      <template #header>
        {{ t('desktop.providers.connectionSettings') }}
      </template>

      <NAlert v-if="providerSettings.modelProviderError.value" type="error" :show-icon="false">
        {{ providerSettings.modelProviderError.value }}
      </NAlert>

      <div class="desktop-provider-connection-dialog__form">
        <label>
          <span>{{ t('desktop.providers.displayName') }}</span>
          <NInput
            v-model:value="form.displayName"
            :placeholder="t('desktop.providers.displayNamePlaceholder')"
          />
        </label>
        <label>
          <span>{{ t('desktop.providers.identifier') }}</span>
          <NInput :value="provider.id" disabled />
        </label>
        <label>
          <span>{{ t('desktop.providers.apiType') }}</span>
          <NSelect
            v-model:value="form.api"
            menu-size="small"
            :options="desktopProviderApiOptions"
          />
        </label>
        <label>
          <span>Base URL</span>
          <NInput v-model:value="form.baseUrl" />
        </label>
        <label class="is-wide">
          <span>{{ t('desktop.providers.customProviderDescription') }}</span>
          <NInput
            v-model:value="form.description"
            :maxlength="200"
            :placeholder="t('desktop.providers.customProviderDescriptionPlaceholder')"
          />
        </label>
      </div>

      <template #footer>
        <div class="desktop-provider-connection-dialog__actions">
          <NButton :disabled="saving" @click="close">
            {{ t('common.cancel') }}
          </NButton>
          <NButton type="primary" :disabled="!canSave" :loading="saving" @click="save">
            {{ t('common.save') }}
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.desktop-provider-connection-dialog :deep(.n-card__content) {
  display: grid;
  gap: 0.9rem;
}

.desktop-provider-connection-dialog__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  padding: 2px;
}

.desktop-provider-connection-dialog__form label {
  display: grid;
  gap: 0.35rem;
}

.desktop-provider-connection-dialog__form label > span {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
}

.desktop-provider-connection-dialog__form .is-wide {
  grid-column: 1 / -1;
}

.desktop-provider-connection-dialog__form :deep(.n-input),
.desktop-provider-connection-dialog__form :deep(.n-base-selection) {
  width: 100%;
}

.desktop-provider-connection-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

@media (max-width: 700px) {
  .desktop-provider-connection-dialog__form {
    grid-template-columns: minmax(0, 1fr);
  }

  .desktop-provider-connection-dialog__form .is-wide {
    grid-column: auto;
  }
}
</style>
