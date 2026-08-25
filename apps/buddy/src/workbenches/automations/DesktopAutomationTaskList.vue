<script setup lang="ts">
import type { LocalAutomationTask } from '@buddy-electron/shared/localChatApi'
import type { DropdownOption } from 'naive-ui'
import type { HTMLAttributes } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  Delete20Regular,
  MoreHorizontal20Regular,
  Pause20Regular,
  Play20Regular,
} from '@vicons/fluent'
import { NButton, NDropdown, NEmpty, NIcon, NModal } from 'naive-ui'
import { computed, h, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  automationBlockedDescriptionKey,
  formatAutomationInstant,
  formatAutomationSchedule,
} from './automationPresentation'

const props = defineProps<{
  automations: ReadonlyArray<LocalAutomationTask>
  language: BuddyLocale
  pendingAutomationIds: ReadonlySet<string>
}>()
const emit = defineEmits<{
  create: []
  delete: [automation: LocalAutomationTask]
  edit: [automation: LocalAutomationTask]
  pause: [automation: LocalAutomationTask]
  resume: [automation: LocalAutomationTask]
  runNow: [automation: LocalAutomationTask]
}>()
const { t } = useBuddyI18n(() => props.language)
const deleteTarget = shallowRef<LocalAutomationTask | null>(null)
const dropdownItemProps: HTMLAttributes = { role: 'menuitem' }
const deletePending = computed(() => (
  deleteTarget.value !== null && props.pendingAutomationIds.has(deleteTarget.value.id)
))
const deleteMessage = computed(() => t('desktop.automations.deleteMessage', {
  name: deleteTarget.value?.name ?? '',
}))

function actionOptions(automation: LocalAutomationTask): DropdownOption[] {
  const lifecycleAction = automation.status === 'active'
    ? {
        icon: () => h(NIcon, { component: Pause20Regular }),
        key: 'pause',
        label: t('desktop.automations.action.pause'),
        props: dropdownItemProps,
      }
    : automation.status === 'paused' || automation.status === 'blocked'
      ? {
          icon: () => h(NIcon, { component: Play20Regular }),
          key: 'resume',
          label: t('desktop.automations.action.resume'),
          props: dropdownItemProps,
        }
      : null
  return [
    ...(lifecycleAction ? [lifecycleAction] : []),
    {
      icon: () => h(NIcon, { component: Delete20Regular }),
      key: 'delete',
      label: t('desktop.automations.action.delete'),
      props: dropdownItemProps,
    },
  ]
}

function handleAction(automation: LocalAutomationTask, action: string | number): void {
  if (action === 'pause')
    emit('pause', automation)
  if (action === 'resume')
    emit('resume', automation)
  if (action === 'delete')
    deleteTarget.value = automation
}

function confirmDelete(): void {
  if (!deleteTarget.value)
    return
  emit('delete', deleteTarget.value)
  deleteTarget.value = null
}

function isPending(automation: LocalAutomationTask): boolean {
  return props.pendingAutomationIds.has(automation.id)
}
</script>

<template>
  <div v-if="automations.length" class="desktop-automation-task-list">
    <article
      v-for="automation in automations"
      :key="automation.id"
      class="desktop-automation-task"
      :class="`is-${automation.status}`"
    >
      <button
        class="desktop-automation-task__body"
        type="button"
        @click="emit('edit', automation)"
      >
        <span class="desktop-automation-task__summary">
          <strong class="desktop-automation-task__name">{{ automation.name }}</strong>
          <span class="desktop-automation-task__schedule">
            {{ formatAutomationSchedule(automation, language, t) }}
          </span>
        </span>
        <span
          v-if="automation.status === 'blocked'"
          class="desktop-automation-task__blocked"
        >
          {{ t(automationBlockedDescriptionKey(automation)) }}
        </span>
      </button>

      <div class="desktop-automation-task__trailing">
        <span class="desktop-automation-task__timing">
          {{ automation.nextRunAt
            ? t('desktop.automations.meta.nextRun', {
              time: formatAutomationInstant(automation.nextRunAt, language, automation.timing.timezone),
            })
            : t('desktop.automations.meta.noNextRun') }}
        </span>
        <div class="desktop-automation-task__actions">
          <NButton
            quaternary
            circle
            size="small"
            :aria-label="t('desktop.automations.action.runNow')"
            :loading="isPending(automation)"
            @click.stop="emit('runNow', automation)"
          >
            <template #icon>
              <NIcon :component="Play20Regular" />
            </template>
          </NButton>
          <NDropdown
            trigger="click"
            :options="actionOptions(automation)"
            @select="handleAction(automation, $event)"
          >
            <NButton
              quaternary
              circle
              size="small"
              :aria-label="t('desktop.automations.action.more')"
              :disabled="isPending(automation)"
            >
              <template #icon>
                <NIcon :component="MoreHorizontal20Regular" />
              </template>
            </NButton>
          </NDropdown>
        </div>
      </div>
    </article>
  </div>

  <NEmpty v-else class="desktop-automation-task-list__empty">
    <template #default>
      <strong>{{ t('desktop.automations.empty') }}</strong>
      <p>{{ t('desktop.automations.emptyDescription') }}</p>
      <NButton type="primary" @click="emit('create')">
        {{ t('desktop.automations.add') }}
      </NButton>
    </template>
  </NEmpty>

  <NModal
    :show="deleteTarget !== null"
    preset="dialog"
    type="warning"
    :title="t('desktop.automations.deleteTitle')"
    @update:show="!$event && (deleteTarget = null)"
  >
    {{ deleteMessage }}
    <template #action>
      <NButton @click="deleteTarget = null">
        {{ t('desktop.automations.editor.cancel') }}
      </NButton>
      <NButton type="error" :loading="deletePending" @click="confirmDelete">
        {{ t('desktop.automations.action.delete') }}
      </NButton>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.desktop-automation-task-list {
  display: grid;
  gap: 2px;
}

.desktop-automation-task {
  display: grid;
  min-height: 46px;
  grid-template-columns: minmax(0, 1fr) minmax(150px, auto);
  align-items: center;
  gap: 18px;
  border-radius: var(--buddy-radius-micro);
  padding: 0 12px;

  &:hover,
  &:focus-within {
    background: var(--buddy-fill-light);
  }
}

.desktop-automation-task__body {
  display: grid;
  min-width: 0;
  gap: 3px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 6px 0;
  text-align: left;

  &:focus-visible {
    border-radius: var(--n-border-radius, 3px);
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: 2px;
  }
}

.desktop-automation-task__summary {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 10px;
}

.desktop-automation-task__name {
  overflow: hidden;
  flex: none;
  color: var(--buddy-text-primary);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-automation-task__schedule,
.desktop-automation-task__timing,
.desktop-automation-task__blocked {
  overflow: hidden;
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-automation-task__blocked {
  color: var(--buddy-accent-warning);
}

.desktop-automation-task__trailing {
  position: relative;
  display: flex;
  min-width: 150px;
  min-height: 34px;
  align-items: center;
  justify-content: flex-end;
}

.desktop-automation-task__timing {
  transition: opacity 120ms ease;
}

.desktop-automation-task__actions {
  position: absolute;
  right: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.desktop-automation-task:hover .desktop-automation-task__timing,
.desktop-automation-task:focus-within .desktop-automation-task__timing {
  opacity: 0;
}

.desktop-automation-task:hover .desktop-automation-task__actions,
.desktop-automation-task:focus-within .desktop-automation-task__actions {
  opacity: 1;
  pointer-events: auto;
}

.desktop-automation-task-list__empty {
  min-height: 360px;
  margin: 0;
  padding-top: clamp(72px, 14vh, 132px);

  :deep(.n-empty__description) {
    display: grid;
    max-width: 420px;
    justify-items: center;
    gap: 10px;
    text-align: center;
  }

  strong {
    color: var(--buddy-text-primary);
    font-size: 16px;
  }

  p {
    margin: 0 0 6px;
    line-height: 1.6;
  }
}

@media (max-width: 760px) {
  .desktop-automation-task {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .desktop-automation-task__schedule {
    display: none;
  }

  .desktop-automation-task__trailing {
    min-width: 76px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-automation-task__timing,
  .desktop-automation-task__actions {
    transition: none;
  }
}
</style>
