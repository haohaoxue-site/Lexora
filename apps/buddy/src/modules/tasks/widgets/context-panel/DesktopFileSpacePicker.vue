<script setup lang="ts">
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NModal } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSpaceIcon from '../space/DesktopSpaceIcon.vue'

const props = defineProps<{
  spaces: readonly LocalSpace[]
  language: BuddyLocale
}>()
const emit = defineEmits<{ select: [spaceId: string] }>()
const show = defineModel<boolean>('show', { required: true })
const { t } = useBuddyI18n(() => props.language)

function select(spaceId: string) {
  emit('select', spaceId)
  show.value = false
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
    :content-style="{ padding: '0 16px 16px' }"
  >
    <template #header>
      {{ t('desktop.context.selectFileSpace') }}
    </template>
    <div class="desktop-file-space-picker" data-testid="file-space-picker">
      <button
        v-for="space in spaces"
        :key="space.id"
        class="desktop-file-space-picker__space"
        type="button"
        @click="select(space.id)"
      >
        <DesktopSpaceIcon :icon="space.icon" :icon-color="space.iconColor" :size="20" />
        <span class="desktop-file-space-picker__copy">
          <span>{{ space.name }}</span>
          <span class="desktop-file-space-picker__directory">{{ space.primaryDirectory?.root }}</span>
        </span>
      </button>
      <div v-if="!spaces.length" class="desktop-file-space-picker__empty">
        {{ t('desktop.context.noFileSpaces') }}
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.desktop-file-space-picker {
  display: grid;
  max-height: min(24rem, 60vh);
  gap: 0.25rem;
  overflow-y: auto;
}

.desktop-file-space-picker__space {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  padding: 0.625rem 0.75rem;
  color: var(--buddy-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.desktop-file-space-picker__space:hover {
  background: var(--buddy-state-hover);
}

.desktop-file-space-picker__space:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-file-space-picker__copy {
  display: grid;
  min-width: 0;
  gap: 0.2rem;
  overflow-wrap: anywhere;
}

.desktop-file-space-picker__directory {
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}

.desktop-file-space-picker__empty {
  padding: 1rem 0.75rem;
  color: var(--buddy-text-secondary);
}
</style>
