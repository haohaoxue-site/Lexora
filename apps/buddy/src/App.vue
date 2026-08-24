<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { usePreferredDark } from '@vueuse/core'
import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  NConfigProvider,
  NMessageProvider,
  zhCN,
} from 'naive-ui'
import { computed, shallowRef } from 'vue'
import DesktopAppProvider from '@/app/DesktopAppProvider.vue'
import DesktopShell from '@/layouts/DesktopShell.vue'

type DesktopThemePreference = 'system' | 'light' | 'dark'

const systemPrefersDark = usePreferredDark()
const themePreference = shallowRef<DesktopThemePreference>('system')
const language = shallowRef<BuddyLocale>('zh-CN')
const prefersDark = computed(() =>
  themePreference.value === 'dark'
  || (themePreference.value === 'system' && systemPrefersDark.value),
)
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  Tooltip: {
    borderRadius: '6px',
    boxShadow: prefersDark.value
      ? '0 8px 24px rgb(0 0 0 / 32%), inset 0 0 0 1px #343731'
      : '0 8px 24px rgb(31 37 33 / 14%), inset 0 0 0 1px #e4e1db',
    color: prefersDark.value ? '#272925' : '#ffffff',
    padding: '7px 10px',
    textColor: prefersDark.value ? '#d6d8d2' : '#414843',
  },
  common: {
    fontFamily: 'var(--buddy-font-ui)',
    fontFamilyMono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
    primaryColor: prefersDark.value ? '#55a98e' : '#2f7d66',
    primaryColorHover: prefersDark.value ? '#68b99f' : '#3d8f76',
    primaryColorPressed: prefersDark.value ? '#428d75' : '#276b58',
    primaryColorSuppl: prefersDark.value ? '#68b99f' : '#3d8f76',
  },
}))
const naiveLocale = computed(() => language.value === 'en-US' ? enUS : zhCN)
const naiveDateLocale = computed(() => language.value === 'en-US' ? dateEnUS : dateZhCN)
</script>

<template>
  <NConfigProvider
    :date-locale="naiveDateLocale"
    :locale="naiveLocale"
    :theme="prefersDark ? darkTheme : null"
    :theme-overrides="themeOverrides"
  >
    <NMessageProvider placement="top">
      <div class="buddy-app" :class="{ 'is-dark': prefersDark }">
        <DesktopAppProvider
          @language-change="language = $event"
          @theme-change="themePreference = $event"
        >
          <DesktopShell />
        </DesktopAppProvider>
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>
