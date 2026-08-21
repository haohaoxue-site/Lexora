<script setup lang="ts">
import type {
  LocalCustomProvider,
  LocalCustomProviderModel,
  LocalProvider,
} from '../../electron/shared/localChatApi'
import type { DesktopChatController } from './useDesktopChat'
import { Add20Regular } from '@vicons/fluent'
import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NEmpty,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NStep,
  NSteps,
  NSwitch,
  NTabPane,
  NTabs,
  NTooltip,
} from 'naive-ui'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopManualModelDialog from './DesktopManualModelDialog.vue'
import { desktopProviderApiOptions } from './desktopProviderApiOptions'

const props = defineProps<{
  chat: DesktopChatController
  resumeProviderId: string | null
}>()
const emit = defineEmits<{
  manage: [providerId: string]
}>()
const show = defineModel<boolean>('show', { required: true })
const chat = props.chat
const { t } = useBuddyI18n(chat.language)
const step = shallowRef(1)
const furthestStep = shallowRef(1)
const sourceTab = shallowRef<'builtin' | 'custom'>('builtin')
const providerQuery = shallowRef('')
const selectedProviderId = shallowRef<string | null>(null)
const manualFormKey = shallowRef(0)
const showManualModelDialog = shallowRef(false)
const savingManualModel = shallowRef(false)
const customIdEdited = shallowRef(false)
const customForm = reactive({
  api: desktopProviderApiOptions[0]!.value,
  baseUrl: 'https://api.example.com/v1',
  description: '',
  displayName: '',
  id: createCustomId(),
})
const providers = computed(() => chat.providers.value)
const selectedProvider = computed(() => providers.value.find(
  provider => provider.id === selectedProviderId.value,
) ?? null)
const providerModels = computed(() => chat.registeredModels.value.filter(
  model => model.providerId === selectedProviderId.value,
))
const enabledModels = computed(() => providerModels.value.filter(
  model => model.enabled && model.available,
))
const filteredProviders = computed(() => {
  const query = providerQuery.value.trim().toLocaleLowerCase()
  return providers.value.filter(provider => !provider.custom && (
    !query
    || provider.displayName.toLocaleLowerCase().includes(query)
    || provider.id.toLocaleLowerCase().includes(query)
  ))
})
const requiresDefaultModel = computed(() => chat.defaultModelId.value === null)
const stepCount = computed(() => requiresDefaultModel.value ? 4 : 3)
const canContinueCustom = computed(() => Boolean(
  customForm.displayName.trim()
  && customForm.id.trim()
  && customForm.baseUrl.trim(),
))
const canComplete = computed(() => (
  selectedProvider.value?.storedCredentialType !== null
  && enabledModels.value.length > 0
))
const defaultModelId = shallowRef<string | null>(null)

watch(show, (visible) => {
  if (!visible) {
    chat.clearAgentError()
    return
  }
  chat.clearAgentError()
  selectedProviderId.value = props.resumeProviderId
  showManualModelDialog.value = false
  defaultModelId.value = null
  const provider = selectedProvider.value
  sourceTab.value = provider?.custom ? 'custom' : 'builtin'
  if (!provider) {
    resetNewProviderForm()
    resetSteps(1)
    return
  }
  if (provider.custom)
    populateCustomForm(provider)
  const initialStep = !provider.storedCredentialType
    ? 2
    : provider.enabledModelCount === 0
      ? 3
      : requiresDefaultModel.value ? 4 : 3
  resetSteps(initialStep)
})

function updateCustomName(value: string) {
  customForm.displayName = value
  if (customIdEdited.value)
    return
  customForm.id = toProviderId(value) || customForm.id
}

function closeDialog() {
  chat.clearAgentError()
  show.value = false
}

async function addBuiltin(provider: LocalProvider) {
  if (provider.added) {
    if (provider.id === selectedProviderId.value && furthestStep.value > 1) {
      navigateToReachedStep(2)
      return
    }
    closeDialog()
    emit('manage', provider.id)
    return
  }
  if (!await chat.addProvider(provider.id))
    return
  selectedProviderId.value = provider.id
  advanceToStep(selectedProvider.value?.storedCredentialType ? 3 : 2)
}

async function createCustom() {
  if (!canContinueCustom.value)
    return
  const succeeded = await chat.upsertCustomProvider({
    api: customForm.api as LocalCustomProvider['api'],
    baseUrl: customForm.baseUrl.trim(),
    description: customForm.description.trim() || undefined,
    displayName: customForm.displayName.trim(),
    enabled: selectedProvider.value?.enabled ?? false,
    id: customForm.id.trim(),
    models: [],
  })
  if (!succeeded)
    return
  selectedProviderId.value = customForm.id.trim()
  customIdEdited.value = true
  advanceToStep(2)
}

async function login(authType: 'api_key' | 'oauth') {
  const provider = selectedProvider.value
  if (!provider || !await chat.loginProvider(provider.id, authType))
    return
  advanceToStep(3)
}

async function saveManualModel(model: LocalCustomProviderModel) {
  const provider = selectedProvider.value
  if (!provider)
    return
  savingManualModel.value = true
  if (await chat.upsertManualModel(provider.id, model)) {
    manualFormKey.value += 1
    showManualModelDialog.value = false
  }
  savingManualModel.value = false
}

function openManualModelDialog() {
  manualFormKey.value += 1
  showManualModelDialog.value = true
}

async function toggleModel(modelId: string, enabled: boolean) {
  const provider = selectedProvider.value
  if (provider)
    await chat.setProviderModelEnabled(provider.id, modelId, enabled)
}

async function continueFromModels() {
  if (!canComplete.value)
    return
  if (requiresDefaultModel.value) {
    defaultModelId.value = `${enabledModels.value[0]!.providerId}:${enabledModels.value[0]!.modelId}`
    advanceToStep(4)
    return
  }
  await finish()
}

async function finish() {
  const provider = selectedProvider.value
  if (!provider || !canComplete.value)
    return
  if (!await chat.setProviderEnabled(provider.id, true))
    return
  if (requiresDefaultModel.value && !await chat.setDefaultModel(defaultModelId.value))
    return
  closeDialog()
}

function goToPreviousStep() {
  navigateToReachedStep(step.value - 1)
}

function advanceToStep(nextStep: number) {
  step.value = nextStep
  furthestStep.value = Math.max(furthestStep.value, nextStep)
}

function navigateToReachedStep(nextStep: number) {
  if (nextStep < 1 || nextStep > Math.min(furthestStep.value, stepCount.value))
    return
  chat.clearAgentError()
  if (nextStep === 1 && selectedProvider.value?.custom)
    populateCustomForm(selectedProvider.value)
  step.value = nextStep
}

function resetSteps(initialStep: number) {
  step.value = initialStep
  furthestStep.value = initialStep
}

function populateCustomForm(provider: LocalProvider) {
  customForm.api = provider.api as LocalCustomProvider['api']
  customForm.baseUrl = provider.baseUrl ?? ''
  customForm.description = provider.description ?? ''
  customForm.displayName = provider.displayName
  customForm.id = provider.id
  customIdEdited.value = true
}

function toProviderId(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function createCustomId(): string {
  return `custom-${crypto.randomUUID().slice(0, 8)}`
}

function resetNewProviderForm() {
  sourceTab.value = 'builtin'
  providerQuery.value = ''
  selectedProviderId.value = null
  customIdEdited.value = false
  customForm.api = desktopProviderApiOptions[0]!.value
  customForm.baseUrl = 'https://api.example.com/v1'
  customForm.description = ''
  customForm.displayName = ''
  customForm.id = createCustomId()
}
</script>

<template>
  <NModal
    v-model:show="show"
    :mask-closable="false"
  >
    <NCard
      class="desktop-provider-add-dialog"
      closable
      content-style="display: flex; flex-direction: column; min-height: 0; overflow: hidden;"
      :style="{ width: 'min(64rem, calc(100vw - 2rem))' }"
      @close="closeDialog"
    >
      <template #header>
        <div class="desktop-provider-add-dialog__title">
          <strong>{{ t('desktop.providers.addService') }}</strong>
          <span v-if="furthestStep > 1">{{ t('desktop.providers.stepProgress', { current: step, total: stepCount }) }}</span>
        </div>
      </template>

      <NSteps
        v-if="furthestStep > 1"
        :current="step"
        size="small"
        @update:current="navigateToReachedStep"
      >
        <NStep :title="t('desktop.providers.serviceStep')" />
        <NStep :disabled="furthestStep < 2" :title="t('desktop.providers.connectionStep')" />
        <NStep :disabled="furthestStep < 3" :title="t('desktop.providers.modelsStep')" />
        <NStep
          v-if="requiresDefaultModel"
          :disabled="furthestStep < 4"
          :title="t('desktop.providers.defaultModelStep')"
        />
      </NSteps>

      <div
        :key="step"
        class="desktop-provider-add-dialog__scroll"
        :class="{ 'is-model-step': step === 3 }"
      >
        <NAlert v-if="chat.agentError.value" type="error" :show-icon="false">
          {{ chat.agentError.value }}
        </NAlert>

        <div v-if="step === 1" class="desktop-provider-add-dialog__body">
          <NTabs v-model:value="sourceTab" type="line" animated>
            <NTabPane name="builtin" :tab="t('desktop.providers.builtinTab')">
              <div class="desktop-provider-add-dialog__catalog">
                <NInput v-model:value="providerQuery" :placeholder="t('desktop.providers.searchPlaceholder')" clearable />
                <div v-if="filteredProviders.length" class="desktop-provider-add-dialog__provider-list-frame">
                  <div class="desktop-provider-add-dialog__provider-list">
                    <div v-for="provider in filteredProviders" :key="provider.id" class="desktop-provider-add-dialog__provider-row">
                      <div>
                        <strong>{{ provider.displayName }}</strong>
                        <small>{{ provider.authTypes.map(type => type === 'api_key' ? 'API Key' : 'OAuth').join(' / ') }}</small>
                      </div>
                      <NButton size="small" :type="provider.added ? 'default' : 'primary'" @click="addBuiltin(provider)">
                        {{ provider.id === selectedProviderId && furthestStep > 1
                          ? t('desktop.providers.continue')
                          : provider.added ? t('desktop.providers.manage') : t('desktop.providers.add') }}
                      </NButton>
                    </div>
                  </div>
                </div>
                <NEmpty v-else :description="t('desktop.providers.noSearchResults')" />
              </div>
            </NTabPane>
            <NTabPane name="custom" :tab="t('desktop.providers.customTab')">
              <div class="desktop-provider-add-dialog__custom-form">
                <label>
                  <span>{{ t('desktop.providers.displayName') }}</span>
                  <NInput
                    :placeholder="t('desktop.providers.displayNamePlaceholder')"
                    :value="customForm.displayName"
                    @update:value="updateCustomName"
                  />
                </label>
                <label>
                  <span>{{ t('desktop.providers.apiType') }}</span>
                  <NSelect
                    v-model:value="customForm.api"
                    menu-size="small"
                    :options="desktopProviderApiOptions"
                  />
                </label>
                <label class="is-wide">
                  <span>{{ t('desktop.providers.customProviderDescription') }}</span>
                  <NInput
                    v-model:value="customForm.description"
                    :maxlength="200"
                    :placeholder="t('desktop.providers.customProviderDescriptionPlaceholder')"
                  />
                </label>
                <label class="is-wide">
                  <span>Base URL</span>
                  <NInput v-model:value="customForm.baseUrl" />
                </label>
                <NCollapse class="is-wide" arrow-placement="right">
                  <NCollapseItem :title="t('desktop.providers.advancedSettings')" name="advanced">
                    <label>
                      <span>{{ t('desktop.providers.identifier') }}</span>
                      <NInput
                        v-model:value="customForm.id"
                        :disabled="selectedProvider?.custom === true"
                        @update:value="customIdEdited = true"
                      />
                    </label>
                  </NCollapseItem>
                </NCollapse>
                <div class="desktop-provider-add-dialog__actions is-wide">
                  <NButton type="primary" :disabled="!canContinueCustom" @click="createCustom">
                    {{ t('desktop.providers.continue') }}
                  </NButton>
                </div>
              </div>
            </NTabPane>
          </NTabs>
        </div>

        <div v-else-if="step === 2" class="desktop-provider-add-dialog__step">
          <h3>{{ t('desktop.providers.configureConnection') }}</h3>
          <p>{{ selectedProvider?.displayName }}</p>
          <NSpace>
            <NButton
              v-for="authType in selectedProvider?.authTypes ?? []"
              :key="authType"
              type="primary"
              :disabled="chat.isAuthenticating.value"
              :loading="chat.isAuthenticating.value && !chat.authChallenge.value"
              @click="login(authType)"
            >
              {{ authType === 'api_key' ? t('desktop.providers.configureApiKey') : t('desktop.providers.useOAuth') }}
            </NButton>
          </NSpace>
        </div>

        <div v-else-if="step === 3" class="desktop-provider-add-dialog__step is-model-step">
          <div class="desktop-provider-add-dialog__step-heading">
            <div>
              <h3>{{ t('desktop.providers.configureModels') }}</h3>
              <p>
                {{ t(selectedProvider?.custom
                  ? 'desktop.providers.configureModelsDescription'
                  : 'desktop.providers.configureBuiltinModelsDescription') }}
              </p>
            </div>
            <div v-if="selectedProvider?.custom" class="desktop-provider-add-dialog__model-actions">
              <NTooltip :disabled="selectedProvider.canSyncModels">
                <template #trigger>
                  <span>
                    <NButton
                      size="small"
                      :disabled="!selectedProvider.canSyncModels"
                      :loading="chat.syncingProviderId.value === selectedProvider.id"
                      @click="chat.syncProviderModels(selectedProvider.id)"
                    >
                      {{ t('desktop.providers.syncModels') }}
                    </NButton>
                  </span>
                </template>
                {{ t(`desktop.providers.syncUnavailable.${selectedProvider.syncUnavailableReason ?? 'unsupported_api'}`) }}
              </NTooltip>
              <NButton
                class="buddy-icon-button desktop-provider-add-dialog__add-model"
                quaternary
                size="small"
                :aria-label="t('desktop.providers.addModelManually')"
                @click="openManualModelDialog"
              >
                <template #icon>
                  <NIcon :component="Add20Regular" />
                </template>
              </NButton>
            </div>
          </div>

          <div class="desktop-provider-add-dialog__models">
            <div class="desktop-provider-add-dialog__model-header">
              <span>{{ t('desktop.providers.modelColumn') }}</span>
              <span>{{ t('desktop.providers.enabledColumn') }}</span>
            </div>
            <div v-for="model in providerModels" :key="model.modelId" class="desktop-provider-add-dialog__model-row">
              <div>
                <strong>{{ model.displayName }}</strong>
                <small>{{ model.modelId }}</small>
              </div>
              <span v-if="!model.available">{{ t('desktop.providers.notFoundInLastSync') }}</span>
              <NSwitch
                :value="model.enabled"
                :disabled="!model.available"
                @update:value="toggleModel(model.modelId, $event)"
              />
            </div>
          </div>
        </div>

        <div v-else class="desktop-provider-add-dialog__step">
          <h3>{{ t('desktop.providers.chooseDefaultModel') }}</h3>
          <NSelect
            v-model:value="defaultModelId"
            :options="enabledModels.map(model => ({
              label: model.displayName,
              value: `${model.providerId}:${model.modelId}`,
            }))"
          />
        </div>
      </div>

      <div v-if="step > 1" class="desktop-provider-add-dialog__footer">
        <NButton @click="goToPreviousStep">
          {{ t('desktop.providers.previous') }}
        </NButton>
        <NButton
          v-if="step === 3"
          type="primary"
          :disabled="!canComplete"
          @click="continueFromModels"
        >
          {{ requiresDefaultModel ? t('desktop.providers.continue') : t('desktop.providers.finishAndEnable') }}
        </NButton>
        <NButton
          v-else-if="step === 4"
          type="primary"
          :disabled="!defaultModelId"
          @click="finish"
        >
          {{ t('desktop.providers.finishAndEnable') }}
        </NButton>
      </div>
    </NCard>
  </NModal>
  <DesktopManualModelDialog
    v-model:show="showManualModelDialog"
    :form-key="manualFormKey"
    :language="chat.language.value"
    :saving="savingManualModel"
    @save="saveManualModel"
  />
</template>

<style scoped>
.desktop-provider-add-dialog {
  width: min(64rem, calc(100vw - 2rem));
  max-height: min(46rem, calc(100dvh - 3rem));
  overflow: hidden;
}

.desktop-provider-add-dialog :deep(.n-card-content),
.desktop-provider-add-dialog :deep(.n-tabs),
.desktop-provider-add-dialog :deep(.n-tab-pane),
.desktop-provider-add-dialog :deep(.n-steps) {
  width: 100%;
  min-width: 0;
}

.desktop-provider-add-dialog :deep(.n-card-header) {
  flex: 0 0 auto;
}

.desktop-provider-add-dialog :deep(.n-step:last-child) {
  flex: 0 0 auto;
}

.desktop-provider-add-dialog :deep(.n-steps) {
  flex: 0 0 auto;
  margin-top: 1px;
}

.desktop-provider-add-dialog__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.desktop-provider-add-dialog__scroll.is-model-step {
  display: flex;
  overflow: hidden;
}

.desktop-provider-add-dialog__footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--buddy-border-light);
  margin-top: 0.8rem;
  padding-top: 0.8rem;
}

.desktop-provider-add-dialog__title,
.desktop-provider-add-dialog__step-heading,
.desktop-provider-add-dialog__model-actions,
.desktop-provider-add-dialog__provider-row,
.desktop-provider-add-dialog__model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.desktop-provider-add-dialog__title span,
.desktop-provider-add-dialog__provider-row small,
.desktop-provider-add-dialog__model-row small,
.desktop-provider-add-dialog__step p {
  color: var(--buddy-text-secondary);
  font-size: 0.72rem;
}

.desktop-provider-add-dialog__body,
.desktop-provider-add-dialog__step,
.desktop-provider-add-dialog__catalog {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}

.desktop-provider-add-dialog__step.is-model-step {
  width: 100%;
  min-height: 0;
  flex: 1;
  grid-template-rows: auto minmax(0, 1fr);
}

.desktop-provider-add-dialog__provider-list {
  max-height: 24rem;
  overflow: auto;
}

.desktop-provider-add-dialog__provider-list-frame,
.desktop-provider-add-dialog__models {
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.65rem;
}

.desktop-provider-add-dialog__provider-list-frame {
  overflow: hidden;
}

.desktop-provider-add-dialog__models {
  min-height: 0;
  overflow: auto;
}

.desktop-provider-add-dialog__model-header {
  position: sticky;
  z-index: 1;
  top: 0;
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--buddy-border-light);
  background: var(--buddy-bg-surface);
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.55rem 0.8rem;
}

.desktop-provider-add-dialog__provider-row,
.desktop-provider-add-dialog__model-row {
  min-height: 3.8rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0.65rem 0.8rem;
}

.desktop-provider-add-dialog__provider-row:last-child,
.desktop-provider-add-dialog__model-row:last-child {
  border-bottom: 0;
}

.desktop-provider-add-dialog__provider-row > div,
.desktop-provider-add-dialog__model-row > div {
  display: grid;
  min-width: 0;
  gap: 0.15rem;
}

.desktop-provider-add-dialog__custom-form {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  padding: 0.5rem 2px 2px;
}

.desktop-provider-add-dialog__catalog {
  box-sizing: border-box;
  padding: 2px;
}

.desktop-provider-add-dialog__custom-form label {
  display: grid;
  gap: 0.35rem;
}

.desktop-provider-add-dialog__custom-form :deep(.n-input),
.desktop-provider-add-dialog__custom-form :deep(.n-base-selection) {
  width: 100%;
}

.desktop-provider-add-dialog__custom-form label > span {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
}

.desktop-provider-add-dialog__custom-form .is-wide {
  grid-column: 1 / -1;
}

.desktop-provider-add-dialog__step h3,
.desktop-provider-add-dialog__step p,
.desktop-provider-add-dialog__step-heading h3,
.desktop-provider-add-dialog__step-heading p {
  margin: 0;
}

.desktop-provider-add-dialog__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 700px) {
  .desktop-provider-add-dialog__custom-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .desktop-provider-add-dialog__custom-form .is-wide {
    grid-column: auto;
  }
}
</style>
