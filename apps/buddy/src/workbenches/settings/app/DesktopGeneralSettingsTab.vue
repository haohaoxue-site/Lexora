<script setup lang="ts">
import type { DesktopAppInfo, LexoraConfigPatch } from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import { NSelect, NSpin, NSwitch } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopNotificationsSettings from '@/workbenches/settings/app/DesktopNotificationsSettings.vue'

type GeneralSettingField = 'language' | 'theme' | 'autostart'

const props = defineProps<{
  appInfo: DesktopAppInfo | null
  settings: ApplicationSettingsStore
}>()

const settings = props.settings
const { languageOptions, t } = useBuddyI18n(settings.language)
const pendingFields = shallowRef<ReadonlySet<GeneralSettingField>>(new Set())
const failedField = shallowRef<GeneralSettingField | null>(null)
const themeOptions = computed(() => [
  { label: t('desktop.settings.themeSystem'), value: 'system' },
  { label: t('desktop.settings.themeLight'), value: 'light' },
  { label: t('desktop.settings.themeDark'), value: 'dark' },
])

async function updateSetting(field: GeneralSettingField, patch: LexoraConfigPatch) {
  pendingFields.value = new Set([...pendingFields.value, field])
  const succeeded = await settings.updateSettings(patch)
  pendingFields.value = new Set([...pendingFields.value].filter(item => item !== field))
  failedField.value = succeeded ? null : field
}
</script>

<template>
  <section v-if="settings.config.value" class="desktop-general-settings">
    <section class="desktop-general-settings__section">
      <h2>{{ t('desktop.settings.appearance') }}</h2>
      <div class="desktop-general-settings__group">
        <div class="desktop-settings-row">
          <div>
            <strong>{{ t('settings.language') }}</strong>
          </div>
          <div class="desktop-settings-row__control">
            <NSelect
              :options="languageOptions"
              :value="settings.config.value.desktop.language"
              @update:value="updateSetting('language', { desktop: { language: $event } })"
            />
            <NSpin v-if="pendingFields.has('language')" size="small" />
            <small v-else-if="failedField === 'language'" class="is-error">
              {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
            </small>
          </div>
        </div>
        <div class="desktop-settings-row">
          <div>
            <strong>{{ t('desktop.settings.theme') }}</strong>
          </div>
          <div class="desktop-settings-row__control">
            <NSelect
              :options="themeOptions"
              :value="settings.config.value.desktop.theme"
              @update:value="updateSetting('theme', { desktop: { theme: $event } })"
            />
            <NSpin v-if="pendingFields.has('theme')" size="small" />
            <small v-else-if="failedField === 'theme'" class="is-error">
              {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
            </small>
          </div>
        </div>
      </div>
    </section>

    <DesktopNotificationsSettings :settings="settings" />

    <section class="desktop-general-settings__section">
      <h2>{{ t('desktop.settings.system') }}</h2>
      <div class="desktop-general-settings__group">
        <div class="desktop-settings-row">
          <div>
            <strong>{{ t('settings.autostart') }}</strong>
            <small>{{ t('desktop.settings.autostartDescription') }}</small>
          </div>
          <div class="desktop-settings-row__control is-compact">
            <NSwitch
              :value="settings.config.value.desktop.launchAtLogin"
              @update:value="updateSetting('autostart', { desktop: { launchAtLogin: $event } })"
            />
            <NSpin v-if="pendingFields.has('autostart')" size="small" />
            <small v-else-if="failedField === 'autostart'" class="is-error">
              {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
            </small>
          </div>
        </div>
        <div class="desktop-settings-row">
          <div>
            <strong>{{ t('settings.appVersion') }}</strong>
          </div>
          <div class="desktop-settings-row__value">
            {{ appInfo?.version ?? '-' }}
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped lang="scss">
.desktop-general-settings {
  display: grid;
  gap: 1.8rem;
}

.desktop-general-settings__section {
  display: grid;
  gap: 0.8rem;
}

.desktop-general-settings__section h2 {
  margin: 0;
  font-size: 0.92rem;
}

.desktop-general-settings__group {
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
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
}

.desktop-settings-row__control.is-compact {
  grid-template-columns: auto auto;
  justify-content: end;
}

.desktop-settings-row__control .is-error {
  grid-column: 1 / -1;
  color: var(--buddy-accent-danger);
  text-align: right;
}

.desktop-settings-row__value {
  color: var(--buddy-text-secondary);
  font-family: var(--buddy-font-mono);
  font-size: 0.75rem;
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
