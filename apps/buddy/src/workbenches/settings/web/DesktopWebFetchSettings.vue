<script setup lang="ts">
import type { WebSettings } from '@buddy-shared/webProtocol'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NSwitch } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopWebSpecializedReading from './DesktopWebSpecializedReading.vue'

const props = defineProps<{
  settings: Readonly<WebSettings['fetch']>
  tavilyKeyConfigured: boolean
  disabled: boolean
  language: BuddyLocale
}>()
const emit = defineEmits<{ toggle: [name: keyof WebSettings['fetch'], enabled: boolean] }>()
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <section class="desktop-web-fetch">
    <header class="desktop-web-fetch__header">
      <h2 class="desktop-web-fetch__title">
        {{ t('desktop.web.fetch') }}
      </h2>
      <p class="desktop-web-fetch__description">
        {{ t('desktop.web.fetchDescription') }}
      </p>
    </header>
    <section class="desktop-web-fetch__general">
      <h3 class="desktop-web-fetch__subtitle">
        {{ t('desktop.web.generalReading') }}
      </h3>
      <div class="desktop-web-fetch__group">
        <div class="desktop-web-fetch__row">
          <div class="desktop-web-fetch__copy">
            <strong id="web-fetch-render">{{ t('desktop.web.render') }}</strong>
            <p>{{ t('desktop.web.renderDescription') }}</p>
          </div>
          <NSwitch aria-labelledby="web-fetch-render" :value="settings.render" :disabled="disabled" @update:value="emit('toggle', 'render', $event)" />
        </div>
        <div class="desktop-web-fetch__row">
          <div class="desktop-web-fetch__copy">
            <strong id="web-fetch-remote">{{ t('desktop.web.remote') }}</strong>
            <p>{{ t(tavilyKeyConfigured ? 'desktop.web.remoteDescription' : 'desktop.web.remoteUnavailable') }}</p>
          </div>
          <NSwitch aria-labelledby="web-fetch-remote" :value="tavilyKeyConfigured && settings.remote" :disabled="disabled || !tavilyKeyConfigured" @update:value="emit('toggle', 'remote', $event)" />
        </div>
      </div>
    </section>
    <DesktopWebSpecializedReading :language="language" />
  </section>
</template>

<style scoped lang="scss">
.desktop-web-fetch { display: grid; gap: 1.25rem; }
.desktop-web-fetch__general { display: grid; gap: 0.65rem; }
.desktop-web-fetch__subtitle { margin: 0; font-size: 0.82rem; font-weight: 600; }
.desktop-web-fetch__header { display: grid; gap: 0.3rem; }
.desktop-web-fetch__title { margin: 0; font-size: 0.92rem; font-weight: 600; }
.desktop-web-fetch__description, .desktop-web-fetch__copy p { margin: 0; color: var(--buddy-text-secondary); font-size: 0.75rem; line-height: 1.65; }
.desktop-web-fetch__group { overflow: hidden; border: 1px solid var(--buddy-border-subtle); border-radius: 0.65rem; }
.desktop-web-fetch__row { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; padding: 0.85rem 1rem; border-bottom: 1px solid var(--buddy-border-subtle); }
.desktop-web-fetch__row:last-child { border-bottom: 0; }
.desktop-web-fetch__copy { min-width: 0; }
.desktop-web-fetch__copy strong { font-size: 0.8rem; font-weight: 500; }
.desktop-web-fetch__copy p { margin-top: 0.25rem; }
</style>
