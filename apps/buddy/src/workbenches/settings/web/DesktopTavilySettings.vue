<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Eye20Regular, EyeOff20Regular } from '@vicons/fluent'
import { NButton, NIcon, NInput } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { useWebCredentialInput } from './useWebCredentialInput'

const props = defineProps<{
  configured: boolean
  disabled: boolean
  language: BuddyLocale
  saveCredential: (key: string | null) => Promise<boolean>
  revealCredential: () => Promise<string | null>
}>()
const { t } = useBuddyI18n(() => props.language)
const credential = useWebCredentialInput({ configured: () => props.configured, reveal: () => props.revealCredential(), save: key => props.saveCredential(key) })

function prepareEdit(event: Event) {
  if (credential.masked.value && event.target instanceof HTMLInputElement)
    event.target.select()
}
</script>

<template>
  <div class="desktop-tavily-settings">
    <header class="desktop-tavily-settings__heading">
      <h3 class="desktop-tavily-settings__title">
        Tavily
      </h3>
    </header>
    <p class="desktop-tavily-settings__description">
      {{ t('desktop.web.tavilyDescription') }}
    </p>
    <form class="desktop-tavily-settings__credentials" @submit.prevent="credential.save">
      <NInput
        :value="credential.value.value"
        :type="credential.visible.value ? 'text' : 'password'"
        autocomplete="off"
        clearable
        :aria-label="t('desktop.web.apiKey')"
        :placeholder="t('desktop.web.apiKey')"
        :disabled="disabled"
        @beforeinput="prepareEdit"
        @update:value="credential.update"
      >
        <template #suffix>
          <NButton class="desktop-tavily-settings__reveal" quaternary :aria-label="t(credential.visible.value ? 'desktop.web.hideKey' : 'desktop.web.showKey')" :aria-pressed="credential.visible.value" :disabled="disabled || credential.revealing.value" :loading="credential.revealing.value" @mousedown.prevent @click="credential.toggleVisibility">
            <NIcon :component="credential.visible.value ? Eye20Regular : EyeOff20Regular" />
          </NButton>
        </template>
      </NInput>
      <NButton attr-type="submit" :disabled="!credential.canSave.value || disabled">
        {{ t('common.save') }}
      </NButton>
    </form>
    <p v-if="credential.revealFailed.value" class="desktop-tavily-settings__error">
      {{ t('desktop.web.revealFailed') }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.desktop-tavily-settings { display: grid; gap: 0.7rem; }
.desktop-tavily-settings__heading, .desktop-tavily-settings__credentials { display: flex; align-items: center; gap: 0.65rem; }
.desktop-tavily-settings__title { margin: 0; font-size: 0.82rem; font-weight: 600; }
.desktop-tavily-settings__description { margin: 0; color: var(--buddy-text-secondary); font-size: 0.75rem; line-height: 1.65; }
.desktop-tavily-settings__error { margin: 0; color: var(--buddy-status-danger-text); font-size: 0.75rem; }
.desktop-tavily-settings__reveal { width: 1.5rem; height: 1.5rem; padding: 0; color: var(--buddy-text-secondary); border-radius: 6px; }
.desktop-tavily-settings__credentials > .n-input { min-width: 0; flex: 1; }
@media (max-width: 900px) {
  .desktop-tavily-settings__credentials { flex-wrap: wrap; }
  .desktop-tavily-settings__credentials > .n-input { flex-basis: 100%; }
}
</style>
