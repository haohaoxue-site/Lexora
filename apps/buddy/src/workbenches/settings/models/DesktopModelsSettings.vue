<script setup lang="ts">
import type { LocalProvider } from '@buddy-electron/shared/localChatApi'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import { Add20Regular } from '@vicons/fluent'
import { NAlert, NButton, NEmpty, NIcon, NPopconfirm, NSwitch } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopProviderAddDialog from '@/workbenches/settings/models/DesktopProviderAddDialog.vue'
import DesktopProviderAuthDialog from '@/workbenches/settings/models/DesktopProviderAuthDialog.vue'

const props = defineProps<{ providerSettings: ModelProvidersStore }>()
const emit = defineEmits<{
  manageProvider: [providerId: string]
}>()
const providerSettings = props.providerSettings
const { t } = useBuddyI18n(providerSettings.language)
const showAddDialog = shallowRef(false)
const resumeProviderId = shallowRef<string | null>(null)

const addedProviders = computed(() => providerSettings.providers.value.filter(provider => provider.added))

function openAddDialog(providerId: string | null = null) {
  providerSettings.clearModelProviderError()
  resumeProviderId.value = providerId
  showAddDialog.value = true
}

function manageProvider(providerId: string) {
  emit('manageProvider', providerId)
}

function providerAuthenticationLabel(type: NonNullable<LocalProvider['storedCredentialType']>) {
  return type === 'api_key' ? 'API Key' : 'OAuth'
}
</script>

<template>
  <div class="desktop-models-settings">
    <NAlert
      v-if="providerSettings.modelProviderError.value && !showAddDialog"
      type="error"
      :show-icon="false"
    >
      {{ providerSettings.modelProviderError.value }}
    </NAlert>

    <section class="desktop-models-settings__section">
      <div class="desktop-models-settings__heading">
        <div>
          <h2>{{ t('desktop.providers.addedServices') }}</h2>
          <p>{{ t('desktop.providers.addedServicesDescription') }}</p>
        </div>
        <NButton size="small" type="primary" @click="openAddDialog()">
          <template #icon>
            <NIcon :component="Add20Regular" />
          </template>
          {{ t('desktop.providers.addService') }}
        </NButton>
      </div>

      <div v-if="addedProviders.length" class="desktop-models-settings__group">
        <article
          v-for="provider in addedProviders"
          :key="provider.id"
          class="desktop-models-settings__provider-row"
        >
          <div class="desktop-models-settings__provider-copy">
            <div class="desktop-models-settings__provider-title">
              <strong class="desktop-models-settings__provider-name">
                {{ provider.displayName }}
              </strong>
              <span
                v-if="provider.storedCredentialType"
                class="desktop-models-settings__provider-auth"
              >
                {{ providerAuthenticationLabel(provider.storedCredentialType) }}
              </span>
            </div>
            <div class="desktop-models-settings__provider-summary">
              <span class="desktop-models-settings__provider-models">
                {{ provider.modelCount
                  ? t('desktop.providers.enabledModelSummary', {
                    enabled: provider.enabledModelCount,
                    total: provider.modelCount,
                  })
                  : t('desktop.providers.noModels') }}
              </span>
              <template v-if="provider.description">
                <span class="desktop-models-settings__provider-separator">|</span>
                <span class="desktop-models-settings__provider-description">
                  {{ provider.description }}
                </span>
              </template>
            </div>
          </div>
          <template v-if="!provider.setupComplete">
            <NButton size="small" @click="openAddDialog(provider.id)">
              {{ t('desktop.providers.continueSetup') }}
            </NButton>
            <NPopconfirm
              :negative-text="t('common.cancel')"
              :positive-text="t('common.confirm')"
              @positive-click="providerSettings.removeProvider(provider.id)"
            >
              <template #trigger>
                <NButton type="error" size="small" :disabled="provider.activeRunCount > 0">
                  {{ t('common.delete') }}
                </NButton>
              </template>
              {{ t('desktop.providers.removeServiceConfirmation') }}
            </NPopconfirm>
          </template>
          <template v-else>
            <NButton size="small" @click="manageProvider(provider.id)">
              {{ t('desktop.providers.manage') }}
            </NButton>
            <NSwitch
              :value="provider.enabled"
              :disabled="provider.activeRunCount > 0"
              @update:value="providerSettings.setProviderEnabled(provider.id, $event)"
            />
          </template>
        </article>
      </div>
      <div v-else class="desktop-models-settings__empty">
        <NEmpty :description="t('desktop.providers.noAddedServices')">
          <template #extra>
            <NButton type="primary" @click="openAddDialog()">
              {{ t('desktop.providers.addService') }}
            </NButton>
          </template>
        </NEmpty>
      </div>
    </section>

    <DesktopProviderAddDialog
      v-model:show="showAddDialog"
      :provider-settings="providerSettings"
      :resume-provider-id="resumeProviderId"
      @manage="manageProvider"
    />
    <DesktopProviderAuthDialog
      :challenge="providerSettings.authChallenge.value"
      :language="providerSettings.language.value"
      @cancel="providerSettings.cancelAuth"
      @submit="providerSettings.respondToAuth"
    />
  </div>
</template>

<style scoped>
.desktop-models-settings,
.desktop-models-settings__section {
  display: grid;
  gap: 0.8rem;
}

.desktop-models-settings {
  gap: 1.8rem;
}

.desktop-models-settings__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.desktop-models-settings__heading h2,
.desktop-models-settings__heading p {
  margin: 0;
}

.desktop-models-settings__heading h2 {
  font-size: 0.92rem;
}

.desktop-models-settings__heading p {
  max-width: 42rem;
  margin-top: 0.25rem;
  color: var(--buddy-text-secondary);
  font-size: 0.72rem;
  line-height: 1.5;
}

.desktop-models-settings__group,
.desktop-models-settings__empty {
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
  background: var(--buddy-surface-base);
}

.desktop-models-settings__empty {
  padding: 0.9rem;
}

.desktop-models-settings__empty {
  padding: 2.6rem 1rem;
}

.desktop-models-settings__provider-row {
  display: flex;
  min-height: 4.2rem;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.7rem 0.9rem;
}

.desktop-models-settings__provider-row:last-child {
  border-bottom: 0;
}

.desktop-models-settings__provider-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.25rem;
}

.desktop-models-settings__provider-title {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.45rem;
}

.desktop-models-settings__provider-name {
  overflow: hidden;
  min-width: 0;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-models-settings__provider-auth {
  flex: none;
  color: var(--buddy-accent-text);
  font-size: 0.66rem;
  font-weight: 600;
}

.desktop-models-settings__provider-summary {
  display: flex;
  overflow: hidden;
  min-width: 0;
  align-items: center;
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
}

.desktop-models-settings__provider-models,
.desktop-models-settings__provider-separator {
  flex: none;
}

.desktop-models-settings__provider-separator {
  margin: 0 0.35rem;
  color: var(--buddy-text-muted);
}

.desktop-models-settings__provider-description {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
