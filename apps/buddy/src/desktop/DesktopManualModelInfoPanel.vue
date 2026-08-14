<script setup lang="ts">
import type { LocalCustomProviderModel, LocalRuntimeModelOption } from '../../electron/shared/localChatApi'
import type { DesktopChatController } from './useDesktopChat'
import { NButton, NCheckbox, NInput } from 'naive-ui'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  chat: DesktopChatController
  model: LocalRuntimeModelOption
  show: boolean
}>()
const chat = props.chat
const { t } = useBuddyI18n(chat.language)
const editing = shallowRef(false)
const form = reactive({ image: false, name: '', reasoning: false })
const saving = computed(() => chat.mutatingProviderId.value === props.model.providerId)
const valid = computed(() => form.name.trim().length > 0)
const capabilitySummary = computed(() => [
  t('desktop.providers.textInput'),
  ...(props.model.capabilities.includes('image') ? [t('desktop.providers.imageInput')] : []),
  ...(props.model.capabilities.includes('reasoning') ? [t('desktop.providers.reasoning')] : []),
].join(' · '))

watch([
  () => props.show,
  () => props.model.providerId,
  () => props.model.modelId,
], ([show]) => {
  if (!show)
    return
  editing.value = false
  resetForm()
}, { immediate: true })

function resetForm() {
  form.name = props.model.displayName
  form.image = props.model.capabilities.includes('image')
  form.reasoning = props.model.capabilities.includes('reasoning')
}

function startEditing() {
  resetForm()
  editing.value = true
}

async function save() {
  if (!valid.value)
    return
  const input: LocalCustomProviderModel = {
    contextWindow: props.model.sourceContextWindow,
    id: props.model.modelId,
    input: form.image ? ['text', 'image'] : ['text'],
    maxTokens: props.model.sourceMaxTokens,
    name: form.name.trim(),
    reasoning: form.reasoning,
  }
  if (await chat.upsertManualModel(props.model.providerId, input))
    editing.value = false
}
</script>

<template>
  <section class="desktop-manual-model-info-panel">
    <header class="desktop-manual-model-info-panel__header">
      <div>
        <h3>{{ t('desktop.providers.modelInformation') }}</h3>
        <p>{{ t('desktop.providers.modelInformationDescription') }}</p>
      </div>
      <NButton v-if="!editing" quaternary size="small" @click="startEditing">
        {{ t('common.edit') }}
      </NButton>
    </header>

    <div v-if="editing" class="desktop-manual-model-info-panel__form">
      <label>
        <span>{{ t('desktop.providers.modelName') }}</span>
        <NInput v-model:value="form.name" />
      </label>
      <div class="desktop-manual-model-info-panel__checks">
        <NCheckbox v-model:checked="form.image">
          {{ t('desktop.providers.imageInput') }}
        </NCheckbox>
        <NCheckbox v-model:checked="form.reasoning">
          {{ t('desktop.providers.reasoning') }}
        </NCheckbox>
      </div>
      <div class="desktop-manual-model-info-panel__form-actions">
        <NButton size="small" @click="editing = false">
          {{ t('common.cancel') }}
        </NButton>
        <NButton size="small" type="primary" :disabled="!valid" :loading="saving" @click="save">
          {{ t('common.save') }}
        </NButton>
      </div>
    </div>

    <dl v-else class="desktop-manual-model-info-panel__values">
      <div>
        <dt>{{ t('desktop.providers.displayName') }}</dt>
        <dd>{{ model.displayName }}</dd>
      </div>
      <div>
        <dt>{{ t('desktop.providers.modelCapabilities') }}</dt>
        <dd>{{ capabilitySummary }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.desktop-manual-model-info-panel {
  overflow: hidden;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.65rem;
  background: var(--buddy-bg-surface);
}

.desktop-manual-model-info-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
}

.desktop-manual-model-info-panel__header > div {
  display: grid;
  gap: 0.18rem;
}

.desktop-manual-model-info-panel__header h3,
.desktop-manual-model-info-panel__header p {
  margin: 0;
}

.desktop-manual-model-info-panel__header h3 {
  font-size: 0.76rem;
}

.desktop-manual-model-info-panel__header p {
  color: var(--buddy-text-secondary);
  font-size: 0.66rem;
}

.desktop-manual-model-info-panel__values,
.desktop-manual-model-info-panel__form {
  display: grid;
  border-top: 1px solid var(--buddy-border-light);
  margin: 0;
}

.desktop-manual-model-info-panel__values > div,
.desktop-manual-model-info-panel__form > label,
.desktop-manual-model-info-panel__checks {
  display: grid;
  gap: 0.3rem;
  padding: 0.7rem 1rem;
}

.desktop-manual-model-info-panel__values > div + div,
.desktop-manual-model-info-panel__checks {
  border-top: 1px solid var(--buddy-border-light);
}

.desktop-manual-model-info-panel__values dt,
.desktop-manual-model-info-panel__form label > span {
  color: var(--buddy-text-secondary);
  font-size: 0.65rem;
}

.desktop-manual-model-info-panel__values dd {
  overflow: hidden;
  margin: 0;
  color: var(--buddy-text-primary);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-manual-model-info-panel__checks {
  display: flex;
  gap: 1rem;
}

.desktop-manual-model-info-panel__checks :deep(.n-checkbox-box) {
  border-radius: 3px;
}

.desktop-manual-model-info-panel__form :deep(.n-input) {
  width: 100%;
}

.desktop-manual-model-info-panel__form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  border-top: 1px solid var(--buddy-border-light);
  padding: 0.7rem 1rem;
}
</style>
