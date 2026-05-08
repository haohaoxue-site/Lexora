<script setup lang="ts">
import type { SidebarPanelBrand, SidebarPanelItem } from './typing'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import SidebarPanel from './SidebarPanel.vue'

const props = defineProps<{
  items: SidebarPanelItem[]
}>()

const adminSidebarBrand: SidebarPanelBrand = {
  label: '同页',
  meta: '系统后台',
  to: '/admin',
  iconCategory: SvgIconCategory.NAV,
  icon: 'workspace',
}
</script>

<template>
  <SidebarPanel
    :brand="adminSidebarBrand"
    :items="props.items"
  />
</template>
