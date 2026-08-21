<script setup lang="ts">
import type { DesktopIconName } from '@/assets/icons/desktopIcons'
import { computed } from 'vue'
import { DESKTOP_ICON_URLS } from '@/assets/icons/desktopIcons'

const props = defineProps<{
  name: DesktopIconName
}>()

const maskStyle = computed(() => ({
  '--desktop-icon-mask': `url("${DESKTOP_ICON_URLS[props.name]}")`,
}))
</script>

<template>
  <span class="desktop-icon" :style="maskStyle" aria-hidden="true" />
</template>

<style scoped>
.desktop-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex: none;
  background-color: currentColor;
  mask: var(--desktop-icon-mask) center / contain no-repeat;
  mask-mode: alpha;
  -webkit-mask: var(--desktop-icon-mask) center / contain no-repeat;
}
</style>
