<script setup lang="ts">
import type { NotificationListFilter } from '@haohaoxue/samepage-contracts'
import type { SessionNotificationPanelProps } from '../typing'
import type {
  SessionNotificationInvitationItem,
  SessionNotificationItem,
} from '@/layouts/components/session-notification-bell/useSessionNotificationBell'
import { NOTIFICATION_LIST_FILTER, NOTIFICATION_SOURCE_KIND } from '@haohaoxue/samepage-contracts/notification'
import { computed, shallowRef, watch } from 'vue'
import EntityAvatar from '@/components/entity-avatar'

const props = defineProps<SessionNotificationPanelProps>()
const emits = defineEmits<{
  filterChange: [filter: NotificationListFilter]
  markAllRead: []
  loadMore: []
  view: [invitation: SessionNotificationInvitationItem]
  accept: [invitation: SessionNotificationInvitationItem]
  decline: [invitation: SessionNotificationInvitationItem]
}>()

const ROW_HEIGHT = 148
const OVERSCAN = 4
const scrollContainerRef = shallowRef<HTMLElement | null>(null)
const scrollTop = shallowRef(0)
const pendingLoadMoreItemCount = shallowRef<number | null>(null)
const filterOptions = computed(() => [
  { label: '全部', value: NOTIFICATION_LIST_FILTER.ALL },
  { label: `未读 ${props.unreadCount > 0 ? props.unreadCount : ''}`.trim(), value: NOTIFICATION_LIST_FILTER.UNREAD },
])
const canLoadMore = computed(() =>
  props.hasMore
  && !props.isLoading
  && !props.isLoadingMore
  && props.notificationItems.length > 0,
)

const virtualStart = computed(() => Math.max(Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN, 0))
const virtualEnd = computed(() => Math.min(virtualStart.value + 12 + OVERSCAN * 2, props.notificationItems.length))
const virtualItems = computed(() =>
  props.notificationItems.slice(virtualStart.value, virtualEnd.value).map((item, offset) => ({
    item,
    index: virtualStart.value + offset,
    top: (virtualStart.value + offset) * ROW_HEIGHT,
  })),
)
const totalHeight = computed(() => props.notificationItems.length * ROW_HEIGHT)

watch(() => [props.activeFilter, props.notificationItems.length] as const, () => {
  pendingLoadMoreItemCount.value = null
})

watch(() => props.isLoadingMore, (isLoadingMore, wasLoadingMore) => {
  if (!isLoadingMore && wasLoadingMore) {
    pendingLoadMoreItemCount.value = null
  }
})

function handleScroll(event: Event) {
  const target = event.currentTarget as HTMLElement

  scrollTop.value = target.scrollTop

  if (target.scrollTop + target.clientHeight >= target.scrollHeight - ROW_HEIGHT) {
    requestLoadMore()
  }
}

function handleFilterChange(value: string | number | boolean | undefined) {
  if (value !== NOTIFICATION_LIST_FILTER.ALL && value !== NOTIFICATION_LIST_FILTER.UNREAD) {
    return
  }

  scrollTop.value = 0
  scrollContainerRef.value?.scrollTo({ top: 0 })
  emits('filterChange', value)
}

function requestLoadMore() {
  if (!canLoadMore.value || pendingLoadMoreItemCount.value === props.notificationItems.length) {
    return
  }

  pendingLoadMoreItemCount.value = props.notificationItems.length
  emits('loadMore')
}

function isInvite(item: SessionNotificationItem) {
  return item.kind === NOTIFICATION_SOURCE_KIND.DOCUMENT_COLLABORATION_USER_INVITE && item.documentInviteItem
}
</script>

<template>
  <div class="session-user-menu-subpanel session-notification-panel absolute bottom-0 left-[calc(100%+12px)] z-[8] w-[24rem] p-2">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h3 class="m-0 text-sm font-semibold leading-5 text-main">
          站内信
        </h3>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <ElTooltip content="全部标记为已读" effect="dark" placement="top">
          <ElButton
            text
            size="small"
            class="session-notification-panel__mark-read-button !h-7 !w-7 !p-0"
            :disabled="!props.unreadCount || props.isMarkingAllRead"
            :loading="props.isMarkingAllRead"
            aria-label="全部标记为已读"
            @click="emits('markAllRead')"
          >
            <SvgIcon v-if="!props.isMarkingAllRead" category="ui" icon="check" size="15px" />
          </ElButton>
        </ElTooltip>
      </div>
    </div>

    <ElSegmented
      :model-value="props.activeFilter"
      :options="filterOptions"
      block
      class="session-notification-panel__filters mb-2 w-full"
      @change="handleFilterChange"
    />

    <p v-if="props.loadErrorMessage" class="session-notification-panel__state m-0 rounded-lg bg-danger-light px-3 py-2 text-xs leading-5 text-danger">
      {{ props.loadErrorMessage }}
    </p>

    <div v-else-if="props.isLoading && !props.hasLoadedList" class="session-notification-panel__state rounded-lg bg-fill-light px-3 py-8 text-center text-sm text-secondary">
      正在加载站内信...
    </div>

    <div v-else-if="!props.notificationItems.length" class="session-notification-panel__state rounded-lg bg-fill-light px-3 py-8 text-center text-sm text-secondary">
      暂无站内信。
    </div>

    <div
      v-else
      ref="scrollContainerRef"
      class="session-notification-panel__list relative min-h-0 flex-1 overflow-y-auto rounded-lg border border-base bg-fill-lighter"
      @scroll="handleScroll"
    >
      <div class="relative" :style="{ height: `${totalHeight}px` }">
        <article
          v-for="{ item, index, top } in virtualItems"
          :key="item.id"
          class="session-notification-panel__item absolute left-0 right-0 flex gap-3 border-b border-base bg-surface p-3"
          :class="{ 'is-unread': item.isUnread }"
          :style="{ height: `${ROW_HEIGHT}px`, transform: `translateY(${top}px)` }"
        >
          <EntityAvatar
            :name="item.senderLabel"
            :src="item.sender.avatarUrl"
            :alt="`${item.senderLabel} 的头像`"
            :size="36"
            shape="circle"
            kind="workspace"
          />

          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center justify-between gap-3">
              <div class="min-w-0 flex items-center gap-2">
                <span class="truncate text-sm font-semibold leading-5 text-main">{{ item.senderLabel }}</span>
                <span v-if="item.isUnread" class="h-1.75 w-1.75 shrink-0 rounded-full bg-primary" />
              </div>
              <time class="shrink-0 text-xs leading-5 text-tertiary">{{ item.receivedLabel }}</time>
            </div>

            <p class="m-0 mt-1 truncate text-sm font-medium leading-5 text-main">
              {{ item.title }}
            </p>

            <p class="session-notification-panel__content m-0 mt-1 text-xs leading-5 text-secondary">
              {{ item.contentText }}
            </p>

            <div v-if="isInvite(item) && item.documentInviteItem" class="mt-2 flex items-center justify-end">
              <ElButton
                size="small"
                plain
                :disabled="Boolean(props.actingInvitationId)"
                @click="emits('view', item.documentInviteItem)"
              >
                查看
              </ElButton>
              <ElButton
                size="small"
                plain
                :disabled="Boolean(props.actingInvitationId)"
                :loading="props.actingInvitationId === item.documentInviteItem.id && props.actingInvitationAction === 'decline'"
                @click="emits('decline', item.documentInviteItem)"
              >
                拒绝
              </ElButton>
              <ElButton
                size="small"
                type="primary"
                :disabled="Boolean(props.actingInvitationId)"
                :loading="props.actingInvitationId === item.documentInviteItem.id && props.actingInvitationAction === 'accept'"
                @click="emits('accept', item.documentInviteItem)"
              >
                接受
              </ElButton>
            </div>
          </div>

          <span class="sr-only">{{ index + 1 }}</span>
        </article>
      </div>

      <div v-if="props.isLoadingMore" class="session-notification-panel__loading-more sticky bottom-0 bg-surface/95 px-3 py-2 text-center text-xs text-secondary">
        正在加载...
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.session-user-menu-subpanel {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 82%, transparent);
  border-radius: 8px;
  background: var(--brand-bg-surface);
  box-shadow: var(--brand-shadow-hairline);
}

.session-notification-panel {
  display: flex;
  flex-direction: column;
  height: min(30rem, calc(100vh - 1.5rem));
  overflow: hidden;

  &__state {
    display: flex;
    flex: 1;
    min-height: 0;
    align-items: center;
    justify-content: center;
  }

  &__mark-read-button {
    --el-button-text-color: var(--brand-text-secondary);
    --el-fill-color-light: color-mix(in srgb, var(--brand-fill-light) 70%, var(--brand-bg-surface));

    border-radius: 0.375rem;

    &:hover:not(.is-disabled) {
      --el-button-text-color: var(--brand-primary);
      --el-fill-color-light: color-mix(in srgb, var(--brand-primary) 8%, var(--brand-bg-surface));
    }
  }

  &__item {
    transition: background-color 0.16s ease;

    &.is-unread {
      background: color-mix(in srgb, var(--brand-primary) 5%, var(--brand-bg-surface));
    }
  }

  &__content {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}
</style>
