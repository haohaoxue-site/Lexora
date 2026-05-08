<script setup lang="ts">
import type { SidebarPanelBrand, SidebarPanelItem } from './typing'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import SidebarPanel from './SidebarPanel.vue'

const props = defineProps<{
  navigationItems: SidebarPanelItem[]
  isCollapsed: boolean
}>()

defineEmits<{
  toggle: []
}>()

const workspaceSidebarBrand: SidebarPanelBrand = {
  label: '同页',
  to: '/home',
  iconCategory: SvgIconCategory.NAV,
  icon: 'workspace',
}
</script>

<template>
  <SidebarPanel
    :brand="workspaceSidebarBrand"
    :items="props.navigationItems"
    :is-collapsed="props.isCollapsed"
    show-toggle
    @toggle="$emit('toggle')"
  />
</template>
