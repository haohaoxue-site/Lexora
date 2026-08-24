<script setup lang="ts">
import type { LocalApproval } from '@buddy-electron/shared/localChatApi'
import type { ApprovalReviewPayload } from '@buddy-shared/approvalReviewPayload'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { approvalReviewPayloadSchema } from '@buddy-shared/approvalReviewPayload'
import { computed } from 'vue'
import {
  translateSystemAction,
  translateSystemInterruption,
  useBuddyI18n,
} from '@/i18n/buddyI18n'

const props = defineProps<{
  approval: LocalApproval
  language: BuddyLocale
  resolving: boolean
}>()
const emit = defineEmits<{ approve: [], deny: [] }>()
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
</script>

<template>
  <article class="desktop-approval-card">
    <div>
      <strong>{{ review?.card === 'system-action' ? systemEffect : approval.summary }}</strong>
      <span>{{ t(`desktop.approval.kind.${approval.kind}`) }}</span>
    </div>
    <section v-if="review?.card === 'automation'" class="desktop-approval-card__details">
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
    <section v-else-if="review?.card === 'system-action'" class="desktop-approval-card__details">
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
    <pre v-else-if="review?.card === 'shell'">{{ review.command }}</pre>
    <ul v-else-if="review?.card === 'paths'">
      <li v-for="path in review.targetPaths" :key="path">
        <code>{{ path }}</code>
      </li>
    </ul>
    <p v-else-if="review?.card === 'arguments'">
      {{ review.argumentNames.join(', ') }}
    </p>
    <p v-else>
      {{ t('desktop.approval.unsupported') }}
    </p>
    <footer>
      <button type="button" :disabled="resolving" @click="emit('deny')">
        {{ t('approvalAction.deny') }}
      </button>
      <button class="is-primary" type="button" :disabled="resolving" @click="emit('approve')">
        {{ resolving ? t('desktop.approval.processing') : t('approvalAction.approve') }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.desktop-approval-card {
  display: grid;
  gap: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-warning) 34%, var(--buddy-border-light));
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--buddy-accent-warning) 7%, var(--buddy-bg-surface-raised));
  padding: 0.75rem;
}

.desktop-approval-card > div {
  display: grid;
  gap: 0.15rem;
}

.desktop-approval-card span {
  color: var(--buddy-text-secondary);
  font-size: 0.72rem;
}

.desktop-approval-card pre {
  max-height: 9rem;
  margin: 0;
  overflow: auto;
  border-radius: 0.55rem;
  background: var(--buddy-bg-surface);
  font-family: var(--buddy-font-mono);
  font-size: 0.7rem;
  padding: 0.6rem;
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
}

.desktop-approval-card__details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.desktop-approval-card ul,
.desktop-approval-card p {
  margin: 0;
}

.desktop-approval-card footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.desktop-approval-card button {
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.5rem;
  background: var(--buddy-bg-surface);
  color: var(--buddy-text-regular);
  cursor: pointer;
  padding: 0.4rem 0.7rem;
}

.desktop-approval-card button.is-primary {
  border-color: var(--buddy-accent-primary);
  background: var(--buddy-accent-primary);
  color: white;
}
</style>
