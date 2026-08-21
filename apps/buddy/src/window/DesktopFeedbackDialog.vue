<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Open20Regular } from '@vicons/fluent'
import { NButton, NIcon, NInput, NModal } from 'naive-ui'
import { shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  show: boolean
}>()
const emit = defineEmits<{
  'openGithubIssue': [feedback: string]
  'update:show': [show: boolean]
}>()

const feedback = shallowRef('')
const { t } = useBuddyI18n(() => props.language)

watch(() => props.show, (show) => {
  if (show)
    feedback.value = ''
})
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="desktop-feedback-dialog"
    :style="{ width: 'min(31rem, calc(100vw - 2rem))' }"
    :title="t('desktop.feedback.title')"
    @update:show="emit('update:show', $event)"
  >
    <div class="desktop-feedback-dialog__channels">
      <span aria-current="page">{{ t('desktop.feedback.write') }}</span>
      <NButton text type="primary" @click="emit('openGithubIssue', '')">
        {{ t('desktop.feedback.githubIssue') }}
        <template #icon>
          <NIcon :component="Open20Regular" />
        </template>
      </NButton>
    </div>
    <p>{{ t('desktop.feedback.description') }}</p>
    <NInput
      v-model:value="feedback"
      type="textarea"
      :autosize="{ minRows: 6, maxRows: 10 }"
      :placeholder="t('desktop.feedback.placeholder')"
    />
    <template #footer>
      <div class="desktop-feedback-dialog__actions">
        <NButton @click="emit('update:show', false)">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="primary" @click="emit('openGithubIssue', feedback)">
          {{ t('desktop.feedback.continueInGithub') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.desktop-feedback-dialog__channels {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding-bottom: 0.55rem;
}

.desktop-feedback-dialog__channels > span {
  color: var(--buddy-text-primary);
  font-size: 0.78rem;
  font-weight: 600;
}

.desktop-feedback-dialog p {
  margin: 0 0 0.9rem;
  color: var(--buddy-text-secondary);
  font-size: 0.82rem;
  line-height: 1.6;
}

.desktop-feedback-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
