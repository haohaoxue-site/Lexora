<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui'
import { NConfigProvider } from 'naive-ui'
import { defineAsyncComponent } from 'vue'
import { createBuddyShellSurfacePlan, resolveBuddyShellSurface } from '@/shell/buddyShellSurface'

const BuddyChatShell = defineAsyncComponent(() => import('@/shell/BuddyChatShell.vue'))
const BuddyControlShell = defineAsyncComponent(() => import('@/shell/BuddyControlShell.vue'))
const surfacePlan = createBuddyShellSurfacePlan(resolveBuddyShellSurface(window.location.pathname))

const themeOverrides: GlobalThemeOverrides = {
  common: {
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    primaryColor: '#347f69',
    primaryColorHover: '#3b8e76',
    primaryColorPressed: '#2b6b58',
    primaryColorSuppl: '#3b8e76',
  },
}
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <BuddyChatShell v-if="surfacePlan.mountsChatRuntime" />
    <BuddyControlShell v-else-if="surfacePlan.mountsControlRuntime" />
  </NConfigProvider>
</template>
