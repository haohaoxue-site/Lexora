<script setup lang="ts">
import type { LexoraConfigPatch } from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import { NSpin, NSwitch } from 'naive-ui'
import { shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

type PetSettingField = 'alwaysOnTop' | 'enabled' | 'rememberPosition'

const props = defineProps<{
  settings: ApplicationSettingsStore
}>()

const settings = props.settings
const { t } = useBuddyI18n(settings.language)
const pendingFields = shallowRef<ReadonlySet<PetSettingField>>(new Set())
const failedField = shallowRef<PetSettingField | null>(null)

async function updateSetting(field: PetSettingField, patch: LexoraConfigPatch) {
  pendingFields.value = new Set([...pendingFields.value, field])
  const succeeded = await settings.updateSettings(patch)
  pendingFields.value = new Set([...pendingFields.value].filter(item => item !== field))
  failedField.value = succeeded ? null : field
}
</script>

<template>
  <section v-if="settings.config.value" class="desktop-pet-settings">
    <h2>{{ t('desktop.settings.pet.behavior') }}</h2>
    <div class="desktop-pet-settings__group">
      <div class="desktop-settings-row">
        <div>
          <strong>{{ t('desktop.settings.pet.enabled') }}</strong>
          <small>{{ t('desktop.settings.pet.enabledDescription') }}</small>
        </div>
        <div class="desktop-settings-row__control">
          <NSwitch
            :value="settings.config.value.pet.enabled"
            @update:value="updateSetting('enabled', { pet: { enabled: $event } })"
          />
          <NSpin v-if="pendingFields.has('enabled')" size="small" />
          <small v-else-if="failedField === 'enabled'" class="is-error">
            {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
          </small>
        </div>
      </div>
      <div class="desktop-settings-row">
        <div>
          <strong>{{ t('desktop.settings.pet.alwaysOnTop') }}</strong>
          <small>{{ t('desktop.settings.pet.alwaysOnTopDescription') }}</small>
        </div>
        <div class="desktop-settings-row__control">
          <NSwitch
            :value="settings.config.value.pet.alwaysOnTop"
            @update:value="updateSetting('alwaysOnTop', { pet: { alwaysOnTop: $event } })"
          />
          <NSpin v-if="pendingFields.has('alwaysOnTop')" size="small" />
          <small v-else-if="failedField === 'alwaysOnTop'" class="is-error">
            {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
          </small>
        </div>
      </div>
      <div class="desktop-settings-row">
        <div>
          <strong>{{ t('desktop.settings.pet.rememberPosition') }}</strong>
          <small>{{ t('desktop.settings.pet.rememberPositionDescription') }}</small>
        </div>
        <div class="desktop-settings-row__control">
          <NSwitch
            :value="settings.config.value.pet.rememberPosition"
            @update:value="updateSetting('rememberPosition', { pet: { rememberPosition: $event } })"
          />
          <NSpin v-if="pendingFields.has('rememberPosition')" size="small" />
          <small v-else-if="failedField === 'rememberPosition'" class="is-error">
            {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
          </small>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-pet-settings {
  display: grid;
  gap: 0.8rem;
}

.desktop-pet-settings h2 {
  margin: 0;
  font-size: 0.92rem;
}

.desktop-pet-settings__group {
  overflow: hidden;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.65rem;
  background: var(--buddy-bg-surface);
}

.desktop-settings-row {
  display: grid;
  min-height: 4rem;
  grid-template-columns: minmax(9rem, 1fr) minmax(13rem, 19rem);
  align-items: center;
  gap: 2rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0.75rem 0.9rem;
}

.desktop-settings-row:last-child {
  border-bottom: 0;
}

.desktop-settings-row > div:first-child {
  display: grid;
  gap: 0.25rem;
}

.desktop-settings-row strong {
  color: var(--buddy-text-regular);
  font-size: 0.8rem;
  font-weight: 600;
}

.desktop-settings-row small {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  line-height: 1.5;
}

.desktop-settings-row__control {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  justify-content: end;
  gap: 0.55rem;
}

.desktop-settings-row__control .is-error {
  grid-column: 1 / -1;
  color: var(--buddy-accent-danger);
  text-align: right;
}

@media (max-width: 760px) {
  .desktop-settings-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.7rem;
    padding: 0.9rem 0;
  }
}
</style>
