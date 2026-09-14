<script setup lang="ts">
import type { Component } from 'vue'
import { NButton, NTooltip } from 'naive-ui'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

defineProps<{ icon: Component, label: string, active?: boolean, disabled?: boolean }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <NTooltip trigger="hover" :delay="350">
    <template #trigger>
      <NButton class="context-action buddy-icon-button" :class="{ 'is-active': active }" quaternary :disabled="disabled" :aria-label="label" :aria-pressed="active" @click="$emit('click')">
        <template #icon>
          <DesktopIcon :component="icon" />
        </template>
      </NButton>
    </template>
    {{ label }}
  </NTooltip>
</template>

<style scoped>
.context-action { width: 28px; height: 28px; flex: none; }
.context-action.is-active { background: var(--buddy-state-hover); color: var(--buddy-text-strong); }
</style>
