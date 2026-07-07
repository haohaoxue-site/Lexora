<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { BuddyApprovalViewRow } from '@/panel/approvalView'
import { Checkmark16Regular, Dismiss16Regular } from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  isResolvingApproval: boolean
  language: BuddyLocale
  rows: ReadonlyArray<BuddyApprovalViewRow>
}>()

const emit = defineEmits<{
  approveApproval: [approvalId: string, approvalKind: string]
  denyApproval: [approvalId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const canResolve = computed(() => !props.isResolvingApproval)
</script>

<template>
  <Transition name="buddy-chat-approval">
    <section
      v-if="rows.length > 0"
      aria-live="polite"
      class="buddy-chat-approval"
    >
      <ul class="buddy-chat-approval__list">
        <li
          v-for="row in rows"
          :key="row.id"
          class="buddy-chat-approval__item"
        >
          <div class="buddy-chat-approval__main">
            <div class="buddy-chat-approval__heading">
              <span class="buddy-chat-approval__title">{{ t('approval.queue') }}</span>
              <span class="buddy-chat-approval__method">{{ row.methodLabel }}</span>
              <span class="buddy-chat-approval__status">{{ row.statusLabel }}</span>
            </div>

            <p class="buddy-chat-approval__prompt">
              {{ row.promptPreview }}
            </p>

            <div class="buddy-chat-approval__meta">
              <span>{{ row.scopeStatusLabel }}</span>
              <span>{{ row.targetLabel }}</span>
            </div>
          </div>

          <div class="buddy-chat-approval__actions">
            <NButton
              class="buddy-chat-approval__button"
              secondary
              size="small"
              native-type="button"
              :disabled="!canResolve || !row.canDeny"
              @click="emit('denyApproval', row.id)"
            >
              <template #icon>
                <NIcon :component="Dismiss16Regular" />
              </template>
              {{ t('approvalAction.deny') }}
            </NButton>

            <NButton
              class="buddy-chat-approval__button buddy-chat-approval__button--primary"
              size="small"
              type="primary"
              native-type="button"
              :disabled="!canResolve || !row.canApprove"
              @click="emit('approveApproval', row.id, row.kind)"
            >
              <template #icon>
                <NIcon :component="Checkmark16Regular" />
              </template>
              {{ row.approveLabel }}
            </NButton>
          </div>
        </li>
      </ul>
    </section>
  </Transition>
</template>

<style scoped lang="scss">
.buddy-chat-approval {
  position: relative;
  z-index: 4;
  overflow: hidden auto;
  max-height: min(210px, 28vh);
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 24%, var(--buddy-border-light));
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgb(255 252 244 / 94%) 0%, rgb(245 252 249 / 90%) 100%),
    var(--buddy-bg-surface);
  box-shadow: 0 14px 30px rgb(24 38 32 / 14%);
  padding: 10px;
}

.buddy-chat-approval__list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
}

.buddy-chat-approval__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  list-style: none;
}

.buddy-chat-approval__main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.buddy-chat-approval__heading,
.buddy-chat-approval__meta,
.buddy-chat-approval__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.buddy-chat-approval__heading {
  gap: 7px;
}

.buddy-chat-approval__title {
  color: var(--buddy-text-primary);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
}

.buddy-chat-approval__method,
.buddy-chat-approval__status,
.buddy-chat-approval__meta {
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.buddy-chat-approval__method,
.buddy-chat-approval__status {
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 18%, var(--buddy-border-light));
  border-radius: 6px;
  background: color-mix(in srgb, var(--buddy-bg-surface) 72%, transparent);
  padding: 2px 6px;
}

.buddy-chat-approval__prompt {
  margin: 0;
  color: var(--buddy-text-primary);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.buddy-chat-approval__meta {
  gap: 8px;
  overflow-wrap: anywhere;
}

.buddy-chat-approval__actions {
  justify-content: flex-end;
  gap: 8px;
}

.buddy-chat-approval__button {
  --n-border-radius: 7px;
}

.buddy-chat-approval__button--primary {
  --n-color: #07132b;
  --n-color-hover: #102451;
  --n-color-pressed: #030a18;
  --n-color-focus: #102451;
  --n-text-color: #fffaf0;
  --n-text-color-hover: #fffaf0;
  --n-text-color-pressed: #fffaf0;
  --n-text-color-focus: #fffaf0;
}

.buddy-chat-approval-enter-active,
.buddy-chat-approval-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.buddy-chat-approval-enter-from,
.buddy-chat-approval-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 560px) {
  .buddy-chat-approval__item {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
