<script setup lang="ts">
import type { LocalConversationSummary } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  ApprovalsApp20Regular,
  Chat20Regular,
  Delete20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
  SpinnerIos20Regular,
} from '@vicons/fluent'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { NDropdown, NIcon } from 'naive-ui'
import { computed, h } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import 'dayjs/locale/zh-cn'

const props = defineProps<{
  active: boolean
  activity: LocalConversationSummary['activity']
  language: BuddyLocale
  now: number
  occurredAt: string
  projectConversation?: boolean
  title: string
}>()

const emit = defineEmits<{
  delete: []
  open: []
  rename: []
}>()

dayjs.extend(relativeTime)

const { t } = useBuddyI18n(() => props.language)
const relativeTimeLabel = computed(() => {
  const label = dayjs(props.occurredAt)
    .locale(props.language === 'zh-CN' ? 'zh-cn' : 'en')
    .from(props.now)
  return props.language === 'zh-CN' ? label.replaceAll(' ', '') : label
})
const activityIcon = computed(() => props.activity === 'awaiting_approval'
  ? ApprovalsApp20Regular
  : SpinnerIos20Regular)
const activityLabel = computed(() => props.activity === 'awaiting_approval'
  ? t('activity.approval')
  : t('run.status.running'))
const actions = computed(() => [
  { icon: () => hIcon(Edit20Regular), key: 'rename', label: t('chat.renameConversation') },
  { icon: () => hIcon(Delete20Regular), key: 'delete', label: t('chat.deleteConversation') },
])

function hIcon(component: typeof Edit20Regular) {
  return h(NIcon, { component })
}

function handleAction(action: string | number) {
  if (action === 'rename')
    emit('rename')
  if (action === 'delete')
    emit('delete')
}
</script>

<template>
  <div
    class="desktop-chat-conversation-row"
    :class="{ 'is-active': active }"
  >
    <div
      class="desktop-chat-conversation-row__surface"
      :class="{ 'is-active': active, 'is-project': projectConversation }"
    >
      <button
        class="desktop-chat-sidebar__conversation"
        :class="{ 'is-active': active }"
        type="button"
        @click="emit('open')"
      >
        <NIcon :component="Chat20Regular" />
        <span>{{ title }}</span>
      </button>
      <div class="desktop-chat-conversation-row__trailing">
        <time
          v-if="activity === 'idle'"
          class="desktop-chat-conversation-row__relative-time"
          :datetime="occurredAt"
        >{{ relativeTimeLabel }}</time>
        <span
          v-else
          class="desktop-chat-conversation-row__activity"
          :class="{
            'is-awaiting-approval': activity === 'awaiting_approval',
            'is-running': activity === 'running',
          }"
          role="status"
          :aria-label="activityLabel"
        >
          <NIcon :component="activityIcon" />
        </span>
        <div class="desktop-chat-conversation-row__actions">
          <NDropdown trigger="click" :options="actions" @select="handleAction">
            <button class="desktop-chat-sidebar__more" type="button">
              <NIcon :component="MoreHorizontal20Regular" />
            </button>
          </NDropdown>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.desktop-chat-conversation-row {
  height: var(--buddy-chat-sidebar-row-size, 2.5rem);
  min-width: 0;
  padding-right: var(--buddy-chat-sidebar-scrollbar-gutter, 0);
  padding-bottom: calc(var(--buddy-chat-sidebar-row-size, 2.5rem) - var(--buddy-chat-sidebar-row-height, 2.25rem));
}

.desktop-chat-conversation-row__surface {
  display: flex;
  height: 100%;
  min-width: 0;
  align-items: center;
  border-radius: var(--buddy-chat-sidebar-state-radius, 8px);
  color: var(--buddy-text-regular);

  &:hover,
  &:focus-within,
  &.is-active {
    background: var(--buddy-fill-base);
  }

  &.is-project {
    padding-left: 1.15rem;
  }
}

button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.desktop-chat-sidebar__conversation {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  color: var(--buddy-text-regular);
  font-size: var(--buddy-sidebar-item-font-size);
  font-weight: var(--buddy-sidebar-item-font-weight);
  line-height: 20px;
  padding: 0.46rem 0.5rem;
  text-align: left;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.is-active {
    color: var(--buddy-text-primary);
    font-weight: var(--buddy-sidebar-item-active-font-weight);
  }

  &:focus-visible {
    border-radius: 6px;
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}

.desktop-chat-sidebar__more {
  display: grid;
  width: var(--buddy-chat-sidebar-action-size, 1.75rem);
  height: var(--buddy-chat-sidebar-action-size, 1.75rem);
  flex: none;
  place-items: center;
  border-radius: var(--buddy-icon-button-radius);
  color: var(--buddy-text-placeholder);

  .n-icon {
    font-size: 16px;
  }

  &:hover {
    background: var(--buddy-nav-active-bg);
    color: var(--buddy-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}

.desktop-chat-conversation-row__trailing {
  display: grid;
  width: 3.35rem;
  flex: none;
  align-items: center;
  padding-right: var(--buddy-chat-sidebar-action-inset, 0.25rem);
}

.desktop-chat-conversation-row__relative-time,
.desktop-chat-conversation-row__activity,
.desktop-chat-conversation-row__actions {
  grid-area: 1 / 1;
  justify-self: end;
}

.desktop-chat-conversation-row__activity {
  display: grid;
  width: var(--buddy-chat-sidebar-action-size, 1.75rem);
  height: var(--buddy-chat-sidebar-action-size, 1.75rem);
  place-items: center;
  pointer-events: none;

  .n-icon {
    font-size: 16px;
  }

  &.is-running {
    color: var(--buddy-text-placeholder);

    .n-icon {
      animation: desktop-chat-conversation-row-spin 1s linear infinite;
    }
  }

  &.is-awaiting-approval {
    color: var(--buddy-accent-warning);
  }
}

.desktop-chat-conversation-row__relative-time {
  color: var(--buddy-text-placeholder);
  font-size: 0.75rem;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}

.desktop-chat-conversation-row__actions {
  display: flex;
  align-items: center;
  gap: var(--buddy-chat-sidebar-action-gap, 0.125rem);
  opacity: 0;
  pointer-events: none;
}

.desktop-chat-conversation-row:hover .desktop-chat-conversation-row__relative-time,
.desktop-chat-conversation-row:has(:focus-visible) .desktop-chat-conversation-row__relative-time,
.desktop-chat-conversation-row:hover .desktop-chat-conversation-row__activity,
.desktop-chat-conversation-row:has(:focus-visible) .desktop-chat-conversation-row__activity {
  opacity: 0;
}

.desktop-chat-conversation-row:hover .desktop-chat-conversation-row__actions,
.desktop-chat-conversation-row:has(:focus-visible) .desktop-chat-conversation-row__actions {
  opacity: 1;
  pointer-events: auto;
}

@keyframes desktop-chat-conversation-row-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-chat-conversation-row__activity.is-running .n-icon {
    animation: none;
  }
}
</style>
