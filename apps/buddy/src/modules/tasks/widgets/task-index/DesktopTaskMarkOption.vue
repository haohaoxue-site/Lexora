<script setup lang="ts">
import { Checkmark16Regular } from '@vicons/fluent'
import { NEllipsis } from 'naive-ui'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

defineProps<{ name: string, selected: boolean }>()
</script>

<template>
  <span class="desktop-task-mark-option">
    <NEllipsis class="desktop-task-mark-option__name" :tooltip="{ placement: 'right', width: 260 }">{{ name }}</NEllipsis>
    <span class="desktop-task-mark-option__selection">
      <DesktopIcon v-if="selected" :component="Checkmark16Regular" :size="16" />
    </span>
  </span>
</template>

<style scoped>
.desktop-task-mark-option {
  display: flex;
  width: 140px;
  align-items: center;
  gap: 8px;
}

.desktop-task-mark-option__name {
  min-width: 0;
  flex: 1;
}

.desktop-task-mark-option__selection {
  display: grid;
  width: 16px;
  flex: none;
  place-items: center;
}
</style>
