<script setup lang="ts">
import type { SpaceIcon, SpaceIconColor } from '@buddy-shared/spaces/spaceAppearance'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { spaceIconComponents } from './spaceIcons'

withDefaults(defineProps<{
  icon?: SpaceIcon
  iconColor?: SpaceIconColor
  size?: number | string
}>(), {
  icon: 'folder',
  iconColor: 'default',
})
</script>

<template>
  <DesktopIcon
    class="desktop-space-icon"
    :component="spaceIconComponents[icon]"
    :color="iconColor === 'default' ? undefined : `var(--buddy-space-icon-${iconColor})`"
    :size="size"
    aria-hidden="true"
  />
</template>
