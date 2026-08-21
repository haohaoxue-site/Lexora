<script setup lang="ts">
import type { LocalNotification } from '../../electron/shared/localChatApi'
import type { DesktopNotificationFilter } from './useDesktopNotifications'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Alert20Regular, CheckmarkCircle20Regular } from '@vicons/fluent'
import { NButton, NIcon, NSpin, NVirtualList } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopNotificationItem from './DesktopNotificationItem.vue'
import { filterDesktopNotifications } from './useDesktopNotifications'

const props = defineProps<{
  items: ReadonlyArray<LocalNotification>
  language: BuddyLocale
  loading: boolean
  unseenCount: number
}>()
const emit = defineEmits<{
  markAllSeen: []
  open: [notification: LocalNotification]
}>()
const NOTIFICATION_ROW_SIZE = 72

const { t } = useBuddyI18n(() => props.language)
const activeFilter = shallowRef<DesktopNotificationFilter>('all')
const filteredItems = computed(() => filterDesktopNotifications(props.items, activeFilter.value))
const virtualItems = computed(() => [...filteredItems.value])
const hasNotifications = computed(() => props.items.length > 0)
const hasVisibleNotifications = computed(() => virtualItems.value.length > 0)
const isUnseenEmpty = computed(() => (
  activeFilter.value === 'unseen'
  && hasNotifications.value
  && !hasVisibleNotifications.value
))
const emptyIcon = computed(() => isUnseenEmpty.value
  ? CheckmarkCircle20Regular
  : Alert20Regular)
const emptyTitle = computed(() => t(isUnseenEmpty.value
  ? 'desktop.notifications.unseenEmptyTitle'
  : 'desktop.notifications.emptyTitle'))
</script>

<template>
  <section class="desktop-notification-center">
    <header class="desktop-notification-center__header">
      <strong>{{ t('desktop.notifications.title') }}</strong>

      <div class="desktop-notification-center__header-actions">
        <div
          v-if="hasNotifications"
          class="desktop-notification-center__filters"
          role="group"
          :aria-label="t('desktop.notifications.filterLabel')"
        >
          <button
            class="desktop-notification-center__filter"
            :class="{ 'is-active': activeFilter === 'all' }"
            type="button"
            :aria-pressed="activeFilter === 'all'"
            @click="activeFilter = 'all'"
          >
            {{ t('desktop.notifications.filterAll') }}
          </button>
          <button
            class="desktop-notification-center__filter"
            :class="{ 'is-active': activeFilter === 'unseen' }"
            type="button"
            :aria-pressed="activeFilter === 'unseen'"
            @click="activeFilter = 'unseen'"
          >
            {{ t('desktop.notifications.filterUnseen') }}
            <span v-if="unseenCount > 0">{{ unseenCount }}</span>
          </button>
        </div>

        <NButton
          v-if="unseenCount > 0"
          class="desktop-notification-center__mark-all"
          size="tiny"
          text
          @click="emit('markAllSeen')"
        >
          {{ t('desktop.notifications.markAllSeen') }}
        </NButton>
      </div>
    </header>

    <div v-if="loading && items.length === 0" class="desktop-notification-center__loading">
      <NSpin size="small" />
    </div>
    <div
      v-else-if="!hasVisibleNotifications"
      class="desktop-notification-center__empty"
      aria-live="polite"
    >
      <span class="desktop-notification-center__empty-icon" aria-hidden="true">
        <NIcon :component="emptyIcon" />
      </span>
      <b>{{ emptyTitle }}</b>
    </div>
    <NVirtualList
      v-else
      :key="activeFilter"
      class="desktop-notification-center__list"
      :item-size="NOTIFICATION_ROW_SIZE"
      :items="virtualItems"
      key-field="id"
    >
      <template #default="{ item: notification }">
        <DesktopNotificationItem
          :language="language"
          :notification="notification"
          @open="emit('open', $event)"
        />
      </template>
    </NVirtualList>
  </section>
</template>

<style scoped>
.desktop-notification-center {
  display: grid;
  height: min(332px, calc(100dvh - 88px));
  grid-template-rows: 44px minmax(0, 1fr);
  overflow: hidden;
  background: var(--buddy-bg-surface-raised);
}

.desktop-notification-center__header {
  display: flex;
  height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0 12px;
}

.desktop-notification-center__header > strong {
  flex: none;
  color: var(--buddy-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.desktop-notification-center__header-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
}

.desktop-notification-center__filters {
  display: flex;
  height: 44px;
  align-items: center;
  gap: 1px;
}

.desktop-notification-center__filter {
  position: relative;
  display: flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font-size: 11px;
  padding: 0 5px;
}

.desktop-notification-center__filter:hover {
  color: var(--buddy-text-primary);
}

.desktop-notification-center__filter:focus-visible {
  outline: 2px solid var(--buddy-accent-primary);
  outline-offset: 1px;
}

.desktop-notification-center__filter.is-active {
  color: var(--buddy-accent-primary);
  font-weight: 600;
}

.desktop-notification-center__filter.is-active::after {
  position: absolute;
  right: 5px;
  bottom: -8px;
  left: 5px;
  height: 2px;
  border-radius: 1px;
  background: var(--buddy-accent-primary);
  content: '';
}

.desktop-notification-center__filter span {
  color: var(--buddy-accent-primary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.desktop-notification-center__mark-all {
  flex: none;
  color: var(--buddy-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.desktop-notification-center__mark-all:hover {
  color: var(--buddy-accent-primary);
}

.desktop-notification-center__loading,
.desktop-notification-center__empty {
  display: grid;
  min-height: 0;
  place-items: center;
}

.desktop-notification-center__empty {
  align-content: center;
  gap: 9px;
  padding: 16px;
  text-align: center;
}

.desktop-notification-center__empty-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  background: var(--buddy-fill-light);
  color: var(--buddy-text-secondary);
  font-size: 16px;
}

.desktop-notification-center__empty b {
  color: var(--buddy-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.desktop-notification-center__list {
  height: 100%;
  min-height: 0;
  overscroll-behavior: contain;
}
</style>
