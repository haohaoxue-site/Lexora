<script setup lang="ts">
import type { LexoraConfigPatch } from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import { NSpin, NSwitch } from 'naive-ui'
import { shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

type NotificationSettingField = 'notifications' | 'notifyWhenFocused'

const props = defineProps<{
  settings: ApplicationSettingsStore
}>()

const settings = props.settings
const { t } = useBuddyI18n(settings.language)
const pendingFields = shallowRef<ReadonlySet<NotificationSettingField>>(new Set())
const failedField = shallowRef<NotificationSettingField | null>(null)

async function updateSetting(field: NotificationSettingField, patch: LexoraConfigPatch) {
  pendingFields.value = new Set([...pendingFields.value, field])
  const succeeded = await settings.updateSettings(patch)
  pendingFields.value = new Set([...pendingFields.value].filter(item => item !== field))
  failedField.value = succeeded ? null : field
}
</script>

<template>
  <section v-if="settings.config.value" class="desktop-notifications-settings">
    <h2 class="desktop-notifications-settings__title">
      {{ t('desktop.notifications.title') }}
    </h2>
    <div class="desktop-notifications-settings__group">
      <div class="desktop-settings-row">
        <div>
          <strong>{{ t('desktop.settings.notifications') }}</strong>
          <small>{{ t('desktop.settings.notificationsDescription') }}</small>
        </div>
        <div class="desktop-settings-row__control">
          <NSwitch
            :value="settings.config.value.desktop.notificationsEnabled"
            @update:value="updateSetting('notifications', { desktop: { notificationsEnabled: $event } })"
          />
          <NSpin v-if="pendingFields.has('notifications')" size="small" />
          <small v-else-if="failedField === 'notifications'" class="is-error">
            {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
          </small>
        </div>
      </div>
      <div v-if="settings.config.value.desktop.notificationsEnabled" class="desktop-settings-row">
        <div>
          <strong>{{ t('desktop.settings.notifyWhenFocused') }}</strong>
          <small>{{ t('desktop.settings.notifyWhenFocusedDescription') }}</small>
        </div>
        <div class="desktop-settings-row__control">
          <NSwitch
            :value="settings.config.value.desktop.notifyWhenFocused"
            @update:value="updateSetting('notifyWhenFocused', { desktop: { notifyWhenFocused: $event } })"
          />
          <NSpin v-if="pendingFields.has('notifyWhenFocused')" size="small" />
          <small v-else-if="failedField === 'notifyWhenFocused'" class="is-error">
            {{ settings.settingsError.value ?? t('desktop.settings.saveFailed') }}
          </small>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-notifications-settings {
  display: grid;
  gap: 0.8rem;
}

.desktop-notifications-settings__title {
  margin: 0;
  font-size: 0.92rem;
}

.desktop-notifications-settings__group {
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
  background: var(--buddy-surface-base);
}

.desktop-settings-row {
  display: grid;
  min-height: 4rem;
  grid-template-columns: minmax(9rem, 1fr) minmax(13rem, 19rem);
  align-items: center;
  gap: 2rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
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
  color: var(--buddy-text-primary);
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
  color: var(--buddy-status-danger-text);
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
