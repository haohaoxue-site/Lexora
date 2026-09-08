<script setup lang="ts">
import type { ModelProvidersStore } from '@/modules/models/state/typing'
import { Add20Regular } from '@vicons/fluent'
import { NAlert, NButton, NPopconfirm, NSpace, NSwitch, NTag, NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopManualModelDialog from '@/modules/models/widgets/providers/DesktopManualModelDialog.vue'
import DesktopModelDetailDialog from '@/modules/models/widgets/providers/DesktopModelDetailDialog.vue'
import DesktopProviderConnectionDialog from '@/modules/models/widgets/providers/DesktopProviderConnectionDialog.vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { useProviderDetail } from './useProviderDetail'

const props = defineProps<{
  providerSettings: ModelProvidersStore
  providerId: string
}>()
const emit = defineEmits<{
  back: []
  continueSetup: [providerId: string]
}>()
const language = computed(() => props.providerSettings.language.value)
const { t } = useBuddyI18n(language)
const {
  provider,
  models,
  selectedModel,
  modelActions,
  connectionActions,
  connectionSummary,
  savingManualModel,
  manualFormKey,
  showManualModelDialog,
  showModelDetailDialog,
  showConnectionDialog,
  saveManualModel,
  openManualModelDialog,
  openModelDetail,
  formatTokens,
  removeProvider,
} = useProviderDetail(() => props.providerSettings, () => props.providerId, () => emit('back'))
</script>

<template>
  <div v-if="provider" class="desktop-provider-detail">
    <NAlert v-if="providerSettings.modelProviderError.value && !showConnectionDialog" type="error" :show-icon="false">
      {{ providerSettings.modelProviderError.value }}
    </NAlert>

    <section v-if="!provider.setupComplete" class="desktop-provider-detail__notice">
      <div>
        <strong>{{ t('desktop.providers.setupIncomplete') }}</strong>
        <span>{{ t('desktop.providers.setupIncompleteDescription') }}</span>
      </div>
      <NButton type="primary" size="small" @click="emit('continueSetup', provider.id)">
        {{ t('desktop.providers.continueSetup') }}
      </NButton>
    </section>

    <section class="desktop-provider-detail__section">
      <h3>{{ t('desktop.providers.connectionStep') }}</h3>
      <div class="desktop-provider-detail__group">
        <div class="desktop-provider-detail__row">
          <div class="desktop-provider-detail__row-copy">
            <strong>{{ t('desktop.providers.authenticationStatus') }}</strong>
            <small>{{ provider.storedCredentialType
              ? (provider.storedCredentialType === 'api_key' ? 'API Key' : 'OAuth')
              : t('desktop.providers.authenticationNotConfigured') }}</small>
          </div>
          <NSpace v-if="!provider.storedCredentialType">
            <NButton
              v-for="authType in provider.authTypes"
              :key="authType"
              size="small"
              :disabled="providerSettings.isAuthenticating.value"
              :loading="providerSettings.isAuthenticating.value && !providerSettings.authChallenge.value"
              @click="providerSettings.loginProvider(provider.id, authType)"
            >
              {{ authType === 'api_key' ? t('desktop.providers.configureApiKey') : t('desktop.providers.useOAuth') }}
            </NButton>
          </NSpace>
          <NPopconfirm
            v-else
            :negative-text="t('common.cancel')"
            :positive-text="t('common.confirm')"
            @positive-click="providerSettings.clearProviderCredential(provider.id)"
          >
            <template #trigger>
              <NButton size="small" :disabled="provider.activeRunCount > 0">
                {{ t('desktop.providers.clearAuthentication') }}
              </NButton>
            </template>
            {{ t('desktop.providers.clearAuthenticationConfirmation') }}
          </NPopconfirm>
        </div>
        <div v-if="provider.custom" class="desktop-provider-detail__row">
          <div class="desktop-provider-detail__row-copy">
            <strong>{{ t('desktop.providers.connectionSettings') }}</strong>
            <small>{{ connectionSummary }}</small>
          </div>
          <NButton size="small" @click="showConnectionDialog = true">
            {{ t('common.edit') }}
          </NButton>
        </div>
      </div>
    </section>

    <section class="desktop-provider-detail__section">
      <div class="desktop-provider-detail__section-heading">
        <div class="desktop-provider-detail__section-copy">
          <h3>{{ t('desktop.providers.models') }}</h3>
          <p>{{ t('desktop.providers.modelsDescription') }}</p>
        </div>
        <div v-if="provider.custom" class="desktop-provider-detail__section-actions">
          <NTooltip :disabled="provider.canSyncModels">
            <template #trigger>
              <span>
                <NButton
                  size="small"
                  :disabled="!provider.canSyncModels"
                  :loading="providerSettings.syncingProviderId.value === provider.id"
                  @click="providerSettings.syncProviderModels(provider.id)"
                >
                  {{ t('desktop.providers.syncModels') }}
                </NButton>
              </span>
            </template>
            {{ t(`desktop.providers.syncUnavailable.${provider.syncUnavailableReason ?? 'unsupported_api'}`) }}
          </NTooltip>
          <NButton
            class="buddy-icon-button desktop-provider-detail__add-model"
            quaternary
            size="small"
            :aria-label="t('desktop.providers.addModelManually')"
            @click="openManualModelDialog"
          >
            <template #icon>
              <DesktopIcon :component="Add20Regular" />
            </template>
          </NButton>
        </div>
      </div>
      <div class="desktop-provider-detail__group">
        <div
          v-for="model in models"
          :key="model.modelId"
          class="desktop-provider-detail__row desktop-provider-detail__model-row"
          role="button"
          tabindex="0"
          @click="openModelDetail(model.modelId)"
          @keydown.enter="openModelDetail(model.modelId)"
          @keydown.space.prevent="openModelDetail(model.modelId)"
        >
          <div class="desktop-provider-detail__row-copy">
            <strong>{{ model.displayName }}</strong>
            <small>{{ model.modelId }} · {{ t(`desktop.providers.modelSource.${model.source}`) }}</small>
            <small class="desktop-provider-detail__model-parameters">
              {{ t('desktop.providers.compactParameters', {
                contextWindow: formatTokens(model.contextWindow),
                maxTokens: formatTokens(model.maxTokens),
              }) }}
            </small>
          </div>
          <div class="desktop-provider-detail__model-tags">
            <NTag v-if="model.hasParameterOverride" size="small" type="info" :bordered="false">
              {{ t('desktop.providers.customParameters') }}
            </NTag>
            <NTag v-if="model.sourceParametersUpdated" size="small" type="warning" :bordered="false">
              {{ t('desktop.providers.sourceParametersUpdated') }}
            </NTag>
            <span v-if="!model.available" class="desktop-provider-detail__warning">
              {{ t('desktop.providers.notFoundInLastSync') }}
            </span>
          </div>
          <NSwitch
            class="desktop-provider-detail__model-switch"
            :value="model.enabled"
            :disabled="provider.activeRunCount > 0 || !model.available"
            @click.stop
            @update:value="providerSettings.setProviderModelEnabled(provider.id, model.modelId, $event)"
          />
        </div>
      </div>
    </section>

    <section class="desktop-provider-detail__section">
      <h3>{{ t('desktop.providers.serviceActions') }}</h3>
      <div class="desktop-provider-detail__group">
        <div class="desktop-provider-detail__row">
          <div class="desktop-provider-detail__row-copy">
            <strong>{{ t('desktop.providers.removeService') }}</strong>
            <small>{{ t('desktop.providers.removeServiceDescription') }}</small>
          </div>
          <NPopconfirm
            :negative-text="t('common.cancel')"
            :positive-text="t('common.confirm')"
            @positive-click="removeProvider"
          >
            <template #trigger>
              <NButton type="error" size="small" :disabled="provider.activeRunCount > 0">
                {{ t('desktop.providers.removeService') }}
              </NButton>
            </template>
            {{ t('desktop.providers.removeServiceConfirmation') }}
          </NPopconfirm>
        </div>
      </div>
    </section>
  </div>
  <DesktopManualModelDialog
    v-model:show="showManualModelDialog"
    :form-key="manualFormKey"
    :language="language"
    :saving="savingManualModel"
    @save="saveManualModel"
  />
  <DesktopModelDetailDialog
    v-model:show="showModelDetailDialog"
    :actions="modelActions"
    :language="language"
    :model="selectedModel"
    :saving="providerSettings.mutatingProviderId.value === providerId"
  />
  <DesktopProviderConnectionDialog
    v-if="provider?.custom"
    v-model:show="showConnectionDialog"
    :actions="connectionActions"
    :error="providerSettings.modelProviderError.value"
    :language="language"
    :provider="provider"
  />
</template>

<style scoped>
.desktop-provider-detail,
.desktop-provider-detail__section {
  display: grid;
  gap: 0.8rem;
}

.desktop-provider-detail {
  gap: 1.8rem;
}

.desktop-provider-detail__notice,
.desktop-provider-detail__row,
.desktop-provider-detail__section-heading {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.desktop-provider-detail__row-copy,
.desktop-provider-detail__notice > div,
.desktop-provider-detail__section-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.2rem;
}

.desktop-provider-detail__model-switch {
  flex: none;
  margin-left: auto;
}

.desktop-provider-detail__model-row {
  cursor: pointer;
}

.desktop-provider-detail__model-row:hover,
.desktop-provider-detail__model-row:focus-visible {
  background: var(--buddy-state-selected);
}

.desktop-provider-detail__model-row:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-provider-detail__model-parameters {
  font-variant-numeric: tabular-nums;
}

.desktop-provider-detail__model-tags {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
}

.desktop-provider-detail__section-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
}

.desktop-provider-detail__section h3,
.desktop-provider-detail__section-heading p {
  margin: 0;
}

.desktop-provider-detail__section h3 {
  font-size: 0.92rem;
}

.desktop-provider-detail__row small,
.desktop-provider-detail__notice span,
.desktop-provider-detail__section-heading p {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
}

.desktop-provider-detail__notice {
  justify-content: space-between;
  border: 1px solid var(--buddy-border-strong);
  border-radius: 0.65rem;
  background: var(--buddy-surface-subtle);
  padding: 0.8rem 0.9rem;
}

.desktop-provider-detail__group {
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
}

.desktop-provider-detail__row {
  min-height: 4rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.7rem 0.9rem;
}

.desktop-provider-detail__row:last-child {
  border-bottom: 0;
}

.desktop-provider-detail__warning {
  color: var(--buddy-status-warning-text);
  font-size: 0.68rem;
}

.desktop-provider-detail__section-heading {
  align-items: flex-start;
  justify-content: space-between;
}
</style>
