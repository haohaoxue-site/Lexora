<script setup lang="ts">
import type { LocalApproval } from '@buddy-electron/shared/localChatApi'
import type { ApprovalReviewPayload } from '@buddy-shared/approvalReviewPayload'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatApprovalDecision } from '@/workbenches/chat/state/useChatApprovals'
import { approvalReviewPayloadSchema } from '@buddy-shared/approvalReviewPayload'
import { ShieldError20Regular, Warning20Regular } from '@vicons/fluent'
import { NButton, NIcon, NPopconfirm } from 'naive-ui'
import { computed } from 'vue'
import {
  translateSystemAction,
  translateSystemInterruption,
  useBuddyI18n,
} from '@/i18n/buddyI18n'

const props = defineProps<{
  approval: LocalApproval
  language: BuddyLocale
  resolvingAction: ChatApprovalDecision | null
}>()
const emit = defineEmits<{ approve: [], approveTurn: [], deny: [] }>()
const { t } = useBuddyI18n(() => props.language)
const automationOperationKeys = {
  delete: 'desktop.chat.processToolAutomationDelete',
  pause: 'desktop.chat.processToolAutomationPause',
  resume: 'desktop.chat.processToolAutomationResume',
  run_now: 'desktop.chat.processToolAutomationRunNow',
  upsert: 'desktop.chat.processToolAutomationUpsert',
} as const
const review = computed<ApprovalReviewPayload | null>(() => {
  const parsed = approvalReviewPayloadSchema.safeParse(props.approval.payload)
  return parsed.success ? parsed.data : null
})
const systemEffect = computed(() => {
  if (review.value?.card !== 'system-action')
    return ''
  return translateSystemAction(props.language, review.value.action)
})
const systemInterruption = computed(() => {
  if (review.value?.card !== 'system-action')
    return ''
  return translateSystemInterruption(props.language, review.value.interruption)
})
const automationOperation = computed(() => {
  if (review.value?.card !== 'automation')
    return ''
  return t(automationOperationKeys[review.value.operation])
})
const approvalOperation = computed(() => (
  systemEffect.value || t(`desktop.approval.kind.${props.approval.kind}`)
))
const approvalTitle = computed(() => t('desktop.approval.title', {
  operation: approvalOperation.value,
}))
const approvalDescription = computed(() => (
  review.value?.card === 'shell'
    ? t('desktop.approval.currentWorkspace')
    : t('desktop.approval.scopeReview')
))
const headingId = computed(() => `desktop-approval-${props.approval.id}-title`)
const isResolving = computed(() => props.resolvingAction !== null)
const turnConfirmationButtonProps = { type: 'error' } as const
</script>

<template>
  <article
    class="desktop-approval-card"
    :aria-busy="isResolving"
    :aria-labelledby="headingId"
  >
    <header class="desktop-approval-card__header">
      <NIcon class="desktop-approval-card__pending-icon" :component="Warning20Regular" />
      <div class="desktop-approval-card__heading">
        <strong :id="headingId" class="desktop-approval-card__title">
          {{ approvalTitle }}
        </strong>
        <span class="desktop-approval-card__description">
          {{ approvalDescription }}
        </span>
      </div>
    </header>
    <section
      v-if="review?.card === 'automation'"
      class="desktop-approval-card__details desktop-approval-card__review"
    >
      <dl>
        <div>
          <dt>{{ t('desktop.approval.automation.operation') }}</dt>
          <dd>{{ automationOperation }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.automation.name') }}</dt>
          <dd>{{ review.name }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.automation.schedule') }}</dt>
          <dd>{{ review.scheduleSummary }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.automation.timezone') }}</dt>
          <dd>{{ review.timezone }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.automation.prompt') }}</dt>
          <dd>{{ review.promptSummary }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.automation.project') }}</dt>
          <dd>{{ review.projectId ?? t('desktop.approval.automation.noProject') }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.automation.model') }}</dt>
          <dd>{{ review.modelMode }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.automation.executionProfile') }}</dt>
          <dd>
            {{ t(review.executionProfile === 'full_access'
              ? 'desktop.chat.executionProfileFull'
              : 'desktop.chat.executionProfileDefault') }}
          </dd>
        </div>
      </dl>
    </section>
    <section
      v-else-if="review?.card === 'system-action'"
      class="desktop-approval-card__details desktop-approval-card__review"
    >
      <dl>
        <div>
          <dt>{{ t('desktop.approval.target') }}</dt>
          <dd>{{ review.target.displayName }}</dd>
        </div>
        <div v-if="review.target.pid">
          <dt>PID</dt>
          <dd>{{ review.target.pid }}</dd>
        </div>
        <div v-if="review.target.unit">
          <dt>{{ t('desktop.approval.systemUnit') }}</dt>
          <dd>{{ review.target.unit }}</dd>
        </div>
        <div v-if="review.target.startedAt">
          <dt>{{ t('desktop.approval.processStartedAt') }}</dt>
          <dd>{{ review.target.startedAt }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.effect') }}</dt>
          <dd>{{ systemEffect }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.reason') }}</dt>
          <dd>{{ review.reason }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.interruption') }}</dt>
          <dd>{{ systemInterruption }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.approval.expiresAt') }}</dt>
          <dd>{{ review.expiresAt }}</dd>
        </div>
      </dl>
    </section>
    <pre v-else-if="review?.card === 'shell'" class="desktop-approval-card__review">{{ review.command }}</pre>
    <ul v-else-if="review?.card === 'paths'" class="desktop-approval-card__review">
      <li v-for="path in review.targetPaths" :key="path">
        <code>{{ path }}</code>
      </li>
    </ul>
    <p v-else-if="review?.card === 'arguments'" class="desktop-approval-card__review">
      {{ review.argumentNames.join(', ') }}
    </p>
    <p v-else class="desktop-approval-card__review">
      {{ t('desktop.approval.unsupported') }}
    </p>
    <footer class="desktop-approval-card__footer">
      <NButton
        size="small"
        :disabled="isResolving"
        :loading="resolvingAction === 'deny'"
        @click="emit('deny')"
      >
        {{ t('approvalAction.deny') }}
      </NButton>
      <div class="desktop-approval-card__actions">
        <NPopconfirm
          v-if="review?.allowForTurn"
          :disabled="isResolving"
          :negative-text="t('common.cancel')"
          placement="top-end"
          :positive-button-props="turnConfirmationButtonProps"
          :positive-text="t('desktop.approval.turnConfirmAction')"
          @positive-click="emit('approveTurn')"
        >
          <template #icon>
            <NIcon
              class="desktop-approval-card__turn-confirmation-icon"
              :component="ShieldError20Regular"
            />
          </template>
          <template #trigger>
            <NButton
              class="desktop-approval-card__turn-button"
              secondary
              size="small"
              type="error"
              :disabled="isResolving"
              :loading="resolvingAction === 'approveForTurn'"
            >
              <template #icon>
                <NIcon :component="ShieldError20Regular" />
              </template>
              {{ t('approvalAction.approveForTurn') }}
            </NButton>
          </template>
          <div class="desktop-approval-card__turn-confirmation-copy">
            <strong class="desktop-approval-card__turn-confirmation-title">
              {{ t('desktop.approval.turnConfirmTitle') }}
            </strong>
            <span class="desktop-approval-card__turn-confirmation-description">
              {{ t('desktop.approval.turnConfirmDescription') }}
            </span>
          </div>
        </NPopconfirm>
        <NButton
          class="desktop-approval-card__approve-button"
          size="small"
          type="primary"
          :disabled="isResolving"
          :loading="resolvingAction === 'approve'"
          @click="emit('approve')"
        >
          {{ t('approvalAction.approve') }}
        </NButton>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.desktop-approval-card {
  display: grid;
  gap: 0.7rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
  background: var(--buddy-surface-raised);
  padding: 0.8rem 0.85rem;
}

.desktop-approval-card__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.6rem;
}

.desktop-approval-card__pending-icon {
  align-self: start;
  color: var(--buddy-status-warning-text);
  font-size: 1.05rem;
  margin-top: 0.05rem;
}

.desktop-approval-card__heading {
  display: grid;
  gap: 0.12rem;
}

.desktop-approval-card__title {
  color: var(--buddy-text-strong);
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.4;
}

.desktop-approval-card__description {
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-caption-line-height);
}

.desktop-approval-card__review {
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.5rem;
  background: var(--buddy-surface-subtle);
  padding: 0.65rem 0.7rem;
}

.desktop-approval-card pre {
  max-height: 9rem;
  margin: 0;
  overflow: auto;
  color: var(--buddy-chat-code-color);
  font-family: var(--buddy-font-mono);
  font-size: var(--buddy-chat-code-font-size);
  line-height: var(--buddy-chat-code-line-height);
  white-space: pre-wrap;
}

.desktop-approval-card__details dl {
  display: grid;
  gap: 0.45rem;
  margin: 0;
}

.desktop-approval-card__details dl > div {
  display: grid;
  grid-template-columns: minmax(5rem, 0.35fr) minmax(0, 1fr);
  gap: 0.6rem;
}

.desktop-approval-card__details dt {
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-caption-line-height);
}

.desktop-approval-card__details dd {
  min-width: 0;
  margin: 0;
  color: var(--buddy-text-primary);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-caption-line-height);
  overflow-wrap: anywhere;
}

.desktop-approval-card ul,
.desktop-approval-card p {
  margin: 0;
}

.desktop-approval-card ul {
  padding-left: 1.8rem;
}

.desktop-approval-card code {
  color: var(--buddy-chat-code-color);
  font-family: var(--buddy-font-mono);
  font-size: var(--buddy-chat-code-font-size);
}

.desktop-approval-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.desktop-approval-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.desktop-approval-card__turn-confirmation-icon {
  color: var(--buddy-status-danger-text);
}

.desktop-approval-card__turn-confirmation-copy {
  display: grid;
  max-width: 18rem;
  gap: 0.2rem;
}

.desktop-approval-card__turn-confirmation-title {
  color: var(--buddy-text-strong);
  font-size: 0.78rem;
  line-height: 1.4;
}

.desktop-approval-card__turn-confirmation-description {
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: 1.5;
}

@media (max-width: 560px) {
  .desktop-approval-card__footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .desktop-approval-card__footer > .n-button {
    align-self: flex-start;
  }
}
</style>
