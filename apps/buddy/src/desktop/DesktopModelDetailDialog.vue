<script setup lang="ts">
import type { DesktopChatController } from './useDesktopChat'
import { NCard, NModal } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopManualModelInfoPanel from './DesktopManualModelInfoPanel.vue'
import DesktopModelParametersPanel from './DesktopModelParametersPanel.vue'

const props = defineProps<{
  chat: DesktopChatController
  modelId: string | null
  providerId: string
  show: boolean
}>()
const emit = defineEmits<{
  'update:show': [show: boolean]
}>()
const chat = props.chat
const { t } = useBuddyI18n(chat.language)
const model = computed(() => chat.registeredModels.value.find(item => (
  item.providerId === props.providerId && item.modelId === props.modelId
)) ?? null)
const modelSourceSummary = computed(() => (
  model.value ? t(`desktop.providers.modelSourceSummary.${model.value.source}`) : ''
))
</script>

<template>
  <NModal :show="show" @update:show="emit('update:show', $event)">
    <NCard
      v-if="model"
      class="desktop-model-detail-dialog"
      closable
      content-style="min-height: 0; overflow: auto;"
      :style="{ width: 'min(40rem, calc(100vw - 2rem))' }"
      @close="emit('update:show', false)"
    >
      <template #header>
        <div class="desktop-model-detail-dialog__title">
          <strong>{{ model.displayName }}</strong>
          <span>{{ model.modelId }} · {{ modelSourceSummary }}</span>
        </div>
      </template>

      <div class="desktop-model-detail-dialog__body">
        <DesktopManualModelInfoPanel
          v-if="model.source === 'manual'"
          :chat="chat"
          :model="model"
          :show="show"
        />
        <DesktopModelParametersPanel :chat="chat" :model="model" :show="show" />
      </div>
    </NCard>
  </NModal>
</template>

<style scoped>
.desktop-model-detail-dialog {
  max-height: min(42rem, calc(100dvh - 3rem));
  overflow: hidden;
}

.desktop-model-detail-dialog__title {
  display: grid;
  min-width: 0;
  gap: 0.12rem;
}

.desktop-model-detail-dialog__title strong,
.desktop-model-detail-dialog__title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-model-detail-dialog__title span {
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
  font-weight: 400;
}

.desktop-model-detail-dialog__body {
  display: grid;
  gap: 0.85rem;
}
</style>
