<script setup lang="ts">
import type {
  LocalCustomProviderModel,
  LocalRuntimeModelOption,
} from '@buddy-electron/shared/localChatApi'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import { NAlert, NButton, NInputNumber } from 'naive-ui'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  providerSettings: ModelProvidersStore
  model: LocalRuntimeModelOption
  show: boolean
}>()
const providerSettings = props.providerSettings
const { t } = useBuddyI18n(providerSettings.language)
const editing = shallowRef(false)
const form = reactive({ contextWindow: 1, maxTokens: 1 })
const saving = computed(() => providerSettings.mutatingProviderId.value === props.model.providerId)
const valid = computed(() => (
  form.contextWindow > 0
  && form.maxTokens > 0
  && form.maxTokens <= form.contextWindow
))
const defaultParametersLabel = computed(() => t(
  props.model.source === 'builtin'
    ? 'desktop.providers.catalogDefaultParameters'
    : 'desktop.providers.serviceDefaultParameters',
))

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
  form.contextWindow = props.model.contextWindow
  form.maxTokens = props.model.maxTokens
}

function startEditing() {
  resetForm()
  editing.value = true
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat(providerSettings.language.value).format(value)
}

async function save() {
  if (!valid.value)
    return
  let succeeded: boolean
  if (props.model.source === 'manual' && !props.model.hasParameterOverride) {
    const input: LocalCustomProviderModel = {
      contextWindow: form.contextWindow,
      id: props.model.modelId,
      input: props.model.capabilities.includes('image') ? ['text', 'image'] : ['text'],
      maxTokens: form.maxTokens,
      name: props.model.displayName,
      reasoning: props.model.capabilities.includes('reasoning'),
    }
    succeeded = await providerSettings.upsertManualModel(props.model.providerId, input)
  }
  else {
    succeeded = await providerSettings.setModelParameters(props.model.providerId, props.model.modelId, {
      contextWindow: form.contextWindow,
      maxTokens: form.maxTokens,
    })
  }
  if (succeeded)
    editing.value = false
}

async function restoreDefaults() {
  if (await providerSettings.restoreModelSourceParameters(props.model.providerId, props.model.modelId))
    editing.value = false
}

async function keepCustomParameters() {
  await providerSettings.acknowledgeModelSourceUpdate(props.model.providerId, props.model.modelId)
}
</script>

<template>
  <section class="desktop-model-parameters-panel">
    <header class="desktop-model-parameters-panel__header">
      <div>
        <h3>{{ t('desktop.providers.modelParameters') }}</h3>
        <p>{{ t('desktop.providers.modelParametersDescription') }}</p>
      </div>
      <NButton v-if="!editing" quaternary size="small" @click="startEditing">
        {{ model.source === 'manual' || model.hasParameterOverride
          ? t('common.edit')
          : t('desktop.providers.customizeParameters') }}
      </NButton>
    </header>

    <NAlert
      v-if="model.sourceParametersUpdated && !editing"
      class="desktop-model-parameters-panel__notice"
      type="warning"
      :show-icon="false"
    >
      <div class="desktop-model-parameters-panel__notice-content">
        <div>
          <strong>{{ t('desktop.providers.sourceParametersUpdated') }}</strong>
          <span>{{ t('desktop.providers.sourceParametersUpdatedDescription') }}</span>
        </div>
        <div class="desktop-model-parameters-panel__notice-actions">
          <NButton size="small" :loading="saving" @click="keepCustomParameters">
            {{ t('desktop.providers.keepOverride') }}
          </NButton>
          <NButton size="small" type="primary" :loading="saving" @click="restoreDefaults">
            {{ t('desktop.providers.useUpdatedDefaultParameters') }}
          </NButton>
        </div>
      </div>
    </NAlert>

    <div v-if="editing" class="desktop-model-parameters-panel__form">
      <label>
        <span>{{ t('desktop.providers.contextWindow') }}</span>
        <NInputNumber v-model:value="form.contextWindow" :min="1" :precision="0" />
      </label>
      <label>
        <span>{{ t('desktop.providers.maxTokens') }}</span>
        <NInputNumber v-model:value="form.maxTokens" :min="1" :precision="0" />
      </label>
      <div class="desktop-model-parameters-panel__form-actions">
        <NButton size="small" @click="editing = false">
          {{ t('common.cancel') }}
        </NButton>
        <NButton size="small" type="primary" :disabled="!valid" :loading="saving" @click="save">
          {{ t('common.save') }}
        </NButton>
      </div>
    </div>

    <dl v-else class="desktop-model-parameters-panel__metrics">
      <div>
        <dt>{{ t('desktop.providers.contextWindow') }}</dt>
        <dd>{{ formatTokens(model.contextWindow) }}</dd>
      </div>
      <div>
        <dt>{{ t('desktop.providers.maxTokens') }}</dt>
        <dd>{{ formatTokens(model.maxTokens) }}</dd>
      </div>
    </dl>

    <footer
      v-if="model.hasParameterOverride && !editing"
      class="desktop-model-parameters-panel__defaults"
    >
      <div>
        <strong>{{ defaultParametersLabel }}</strong>
        <span>
          {{ t('desktop.providers.parameterPairSummary', {
            contextWindow: formatTokens(model.sourceContextWindow),
            maxTokens: formatTokens(model.sourceMaxTokens),
          }) }}
        </span>
      </div>
      <NButton size="small" @click="restoreDefaults">
        {{ t('desktop.providers.restoreDefaultParameters') }}
      </NButton>
    </footer>
  </section>
</template>

<style scoped>
.desktop-model-parameters-panel {
  overflow: hidden;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.65rem;
  background: var(--buddy-bg-surface);
}

.desktop-model-parameters-panel__header,
.desktop-model-parameters-panel__defaults,
.desktop-model-parameters-panel__notice-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.desktop-model-parameters-panel__header {
  padding: 0.9rem 1rem;
}

.desktop-model-parameters-panel__header > div,
.desktop-model-parameters-panel__defaults > div,
.desktop-model-parameters-panel__notice-content > div:first-child {
  display: grid;
  min-width: 0;
  gap: 0.18rem;
}

.desktop-model-parameters-panel__header h3,
.desktop-model-parameters-panel__header p {
  margin: 0;
}

.desktop-model-parameters-panel__header h3,
.desktop-model-parameters-panel__defaults strong,
.desktop-model-parameters-panel__notice-content strong {
  font-size: 0.76rem;
}

.desktop-model-parameters-panel__header p,
.desktop-model-parameters-panel__defaults span,
.desktop-model-parameters-panel__notice-content span {
  color: var(--buddy-text-secondary);
  font-size: 0.66rem;
  line-height: 1.5;
}

.desktop-model-parameters-panel__notice {
  margin: 0 1rem 0.9rem;
}

.desktop-model-parameters-panel__notice :deep(.n-alert-body),
.desktop-model-parameters-panel__notice :deep(.n-alert-body__content) {
  width: 100%;
}

.desktop-model-parameters-panel__notice-actions {
  display: flex;
  flex: none;
  gap: 0.45rem;
}

.desktop-model-parameters-panel__metrics,
.desktop-model-parameters-panel__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--buddy-border-light);
  margin: 0;
}

.desktop-model-parameters-panel__metrics > div,
.desktop-model-parameters-panel__form > label {
  display: grid;
  min-width: 0;
  gap: 0.3rem;
  padding: 0.85rem 1rem;
}

.desktop-model-parameters-panel__metrics > div + div,
.desktop-model-parameters-panel__form > label + label {
  border-left: 1px solid var(--buddy-border-light);
}

.desktop-model-parameters-panel__metrics dt,
.desktop-model-parameters-panel__form label > span {
  color: var(--buddy-text-secondary);
  font-size: 0.65rem;
}

.desktop-model-parameters-panel__metrics dd {
  margin: 0;
  color: var(--buddy-text-primary);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 620;
}

.desktop-model-parameters-panel__form :deep(.n-input-number) {
  width: 100%;
}

.desktop-model-parameters-panel__form-actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 0.5rem;
  border-top: 1px solid var(--buddy-border-light);
  padding: 0.7rem 1rem;
}

.desktop-model-parameters-panel__defaults {
  border-top: 1px solid var(--buddy-border-light);
  background: var(--buddy-fill-light);
  padding: 0.65rem 1rem;
}

@media (max-width: 620px) {
  .desktop-model-parameters-panel__header,
  .desktop-model-parameters-panel__defaults,
  .desktop-model-parameters-panel__notice-content {
    align-items: stretch;
    flex-direction: column;
  }

  .desktop-model-parameters-panel__metrics,
  .desktop-model-parameters-panel__form {
    grid-template-columns: minmax(0, 1fr);
  }

  .desktop-model-parameters-panel__metrics > div + div,
  .desktop-model-parameters-panel__form > label + label {
    border-top: 1px solid var(--buddy-border-light);
    border-left: 0;
  }
}
</style>
