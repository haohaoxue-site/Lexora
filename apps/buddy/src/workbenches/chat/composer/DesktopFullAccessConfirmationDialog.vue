<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NCheckbox, NModal } from 'naive-ui'
import { shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  show: boolean
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const acknowledged = shallowRef(false)
const { t } = useBuddyI18n(() => props.language)

watch(() => props.show, (show) => {
  if (show)
    acknowledged.value = false
})

function cancel() {
  emit('cancel')
}

function confirm() {
  if (acknowledged.value)
    emit('confirm')
}
</script>

<template>
  <NModal
    :show="show"
    preset="dialog"
    type="error"
    class="desktop-full-access-confirmation"
    :style="{ width: 'min(31rem, calc(100vw - 2rem))' }"
    :closable="false"
    :mask-closable="false"
    :title="t('desktop.chat.executionProfileFullConfirmTitle')"
    @update:show="!$event && cancel()"
  >
    <p class="desktop-full-access-confirmation__description">
      {{ t('desktop.chat.executionProfileFullConfirmDescription') }}
    </p>
    <NCheckbox v-model:checked="acknowledged" class="desktop-full-access-confirmation__acknowledgement">
      {{ t('desktop.chat.executionProfileFullConfirmAcknowledgement') }}
    </NCheckbox>

    <template #action>
      <div class="desktop-full-access-confirmation__actions">
        <NButton @click="cancel">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="error" :disabled="!acknowledged" @click="confirm">
          {{ t('desktop.chat.executionProfileAllowFull') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.desktop-full-access-confirmation__description {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: 0.86rem;
  line-height: 1.7;
}

.desktop-full-access-confirmation__acknowledgement {
  margin-top: 1rem;
  color: var(--buddy-text-regular);
  font-size: 0.84rem;
}

.desktop-full-access-confirmation__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
