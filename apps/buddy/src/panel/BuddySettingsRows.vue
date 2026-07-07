<script setup lang="ts">
import type { SelectOption } from 'naive-ui'
import type { BuddyTranslate } from '@/i18n/buddyI18n'
import { NSelect, NSwitch } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{
  allowNativeContextMenu: boolean
  isUpdating: boolean
  languageOptions: ReadonlyArray<SelectOption>
  languageValue: string
  pathRows: ReadonlyArray<{
    label: string
    value: string
  }>
  t: BuddyTranslate
  version: string
}>()

const emit = defineEmits<{
  updateLanguage: [language: string]
  updateNativeContextMenu: [enabled: boolean]
}>()

const normalizedLanguageOptions = computed(() => [...props.languageOptions])
const t = props.t

function createSettingsSwitchRailStyle(options: { checked: boolean }) {
  if (options.checked) {
    return {
      background: 'var(--buddy-accent-primary)',
      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--buddy-accent-primary) 76%, #10251d)',
    }
  }

  return {
    background: 'var(--buddy-fill-base)',
    boxShadow: 'inset 0 0 0 1px var(--buddy-border-base)',
  }
}

function updateLanguage(value: string | number) {
  if (value === 'zh-CN' || value === 'en-US')
    emit('updateLanguage', value)
}
</script>

<template>
  <section class="buddy-settings-rows">
    <div class="buddy-settings-rows__line">
      <span>{{ t('settings.language') }}</span>
      <NSelect
        class="buddy-settings-rows__control"
        :options="normalizedLanguageOptions"
        :value="languageValue"
        @update:value="updateLanguage"
      />
    </div>

    <div class="buddy-settings-rows__line">
      <span>{{ t('settings.autostart') }}</span>
      <NSwitch
        class="buddy-settings-rows__switch"
        disabled
        :rail-style="createSettingsSwitchRailStyle"
      />
    </div>

    <div class="buddy-settings-rows__line">
      <span>{{ t('settings.allowNativeContextMenu') }}</span>
      <NSwitch
        class="buddy-settings-rows__switch"
        :loading="isUpdating"
        :rail-style="createSettingsSwitchRailStyle"
        :value="allowNativeContextMenu"
        @update:value="emit('updateNativeContextMenu', $event)"
      />
    </div>

    <div class="buddy-settings-rows__line">
      <span>{{ t('settings.appVersion') }}</span>
      <strong>{{ version }}</strong>
    </div>

    <div class="buddy-settings-rows__gap" />

    <div
      v-for="row in pathRows"
      :key="row.label"
      class="buddy-settings-rows__line buddy-settings-rows__line--path"
    >
      <span>{{ row.label }}</span>
      <code>{{ row.value }}</code>
    </div>
  </section>
</template>

<style scoped lang="scss">
.buddy-settings-rows {
  display: grid;
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: var(--buddy-bg-surface);
  padding: 0 20px;
}

.buddy-settings-rows__line {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto;
  align-items: center;
  gap: 20px;
  min-height: 66px;
  border-bottom: 1px solid var(--buddy-border-light);
}

.buddy-settings-rows__line:last-child {
  border-bottom: 0;
}

.buddy-settings-rows__line span {
  color: var(--buddy-text-primary);
  font-size: 15px;
  font-weight: 500;
}

.buddy-settings-rows__line strong,
.buddy-settings-rows__line code {
  justify-self: end;
  min-width: 0;
  color: var(--buddy-text-regular);
  font-size: 14px;
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}

.buddy-settings-rows__line code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.buddy-settings-rows__line--path {
  grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
}

.buddy-settings-rows__control {
  justify-self: end;
  width: 180px;
}

.buddy-settings-rows__switch {
  justify-self: end;
  width: max-content;
}

.buddy-settings-rows__gap {
  height: 18px;
  border-bottom: 1px solid var(--buddy-border-light);
}

@media (max-width: 760px) {
  .buddy-settings-rows__line,
  .buddy-settings-rows__line--path {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    padding: 14px 0;
  }

  .buddy-settings-rows__line strong,
  .buddy-settings-rows__line code {
    text-align: left;
  }
}
</style>
