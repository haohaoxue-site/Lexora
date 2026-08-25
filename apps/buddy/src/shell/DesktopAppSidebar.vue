<script setup lang="ts">
import type {
  LocalConversation,
  LocalNotification,
  LocalProject,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  Alert20Regular,
  Chat20Regular,
  PanelLeft20Regular,
  Search20Regular,
  Settings20Regular,
} from '@vicons/fluent'
import { NBadge, NButton, NIcon, NPopover } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopAccountAvatar from '@/shell/DesktopAccountAvatar.vue'
import DesktopAccountDialog from '@/shell/DesktopAccountDialog.vue'
import DesktopGlobalSearchDialog from '@/shell/DesktopGlobalSearchDialog.vue'
import DesktopNotificationCenter from '@/shell/DesktopNotificationCenter.vue'
import DesktopIcon from '@/ui/DesktopIcon.vue'

const props = defineProps<{
  appVersion: string | null
  conversations: ReadonlyArray<LocalConversation>
  language: BuddyLocale
  mode: 'automations' | 'chat' | 'settings'
  notificationItems: ReadonlyArray<LocalNotification>
  notificationLoading: boolean
  notificationUnseenCount: number
  projects: ReadonlyArray<LocalProject>
}>()
const emit = defineEmits<{
  navigateAutomations: []
  navigateChat: []
  navigateSettings: []
  markAllNotificationsSeen: []
  openNotification: [notification: LocalNotification]
  openConversation: [conversationId: string]
  openProject: [projectId: string]
  toggleSidebar: []
  refreshNotifications: []
}>()
const { t } = useBuddyI18n(() => props.language)
const versionLabel = computed(() => props.appVersion ? `v${props.appVersion}` : '')
const showAccountDialog = shallowRef(false)
const showGlobalSearchDialog = shallowRef(false)
const showNotifications = shallowRef(false)
const notificationPopoverThemeOverrides = { padding: '0' } as const

function updateNotificationVisibility(show: boolean) {
  showNotifications.value = show
  if (show)
    emit('refreshNotifications')
}

function openNotification(notification: LocalNotification) {
  showNotifications.value = false
  emit('openNotification', notification)
}

function openConversation(conversationId: string) {
  showGlobalSearchDialog.value = false
  emit('openConversation', conversationId)
}

function openProject(projectId: string) {
  showGlobalSearchDialog.value = false
  emit('openProject', projectId)
}
</script>

<template>
  <aside class="desktop-app-sidebar">
    <header class="desktop-app-sidebar__header">
      <div class="desktop-app-sidebar__identity">
        <strong>Lexora Buddy</strong>
        <span>{{ versionLabel }}</span>
      </div>
      <div class="desktop-app-sidebar__header-actions">
        <NButton
          class="buddy-icon-button desktop-app-sidebar__search-trigger"
          quaternary
          @click="showGlobalSearchDialog = true"
        >
          <template #icon>
            <NIcon :component="Search20Regular" />
          </template>
        </NButton>
        <NButton
          class="buddy-icon-button desktop-app-sidebar__collapse-trigger"
          quaternary
          @click="emit('toggleSidebar')"
        >
          <template #icon>
            <NIcon :component="PanelLeft20Regular" />
          </template>
        </NButton>
      </div>
    </header>

    <nav class="desktop-app-sidebar__primary">
      <button
        class="desktop-app-sidebar__nav-item"
        :class="{ 'is-active': mode === 'chat' }"
        :aria-current="mode === 'chat' ? 'page' : undefined"
        type="button"
        @click="emit('navigateChat')"
      >
        <NIcon :component="Chat20Regular" />
        <span>{{ t('desktop.navigation.chat') }}</span>
      </button>
      <button
        class="desktop-app-sidebar__nav-item"
        :class="{ 'is-active': mode === 'automations' }"
        :aria-current="mode === 'automations' ? 'page' : undefined"
        type="button"
        @click="emit('navigateAutomations')"
      >
        <DesktopIcon name="navigationAutomation" />
        <span>{{ t('desktop.navigation.automations') }}</span>
      </button>
      <button
        class="desktop-app-sidebar__nav-item"
        :class="{ 'is-active': mode === 'settings' }"
        :aria-current="mode === 'settings' ? 'page' : undefined"
        type="button"
        @click="emit('navigateSettings')"
      >
        <NIcon :component="Settings20Regular" />
        <span>{{ t('desktop.navigation.settings') }}</span>
      </button>
    </nav>

    <footer class="desktop-app-sidebar__footer">
      <div class="desktop-app-sidebar__account">
        <button
          class="desktop-app-sidebar__profile"
          type="button"
          @click="showAccountDialog = true"
        >
          <DesktopAccountAvatar />
          <strong>{{ t('desktop.account.signedOut') }}</strong>
        </button>
        <NPopover
          class="desktop-notification-popover"
          content-class="desktop-notification-popover__content"
          content-style="padding: 0"
          :show="showNotifications"
          trigger="click"
          placement="top-end"
          to=".buddy-app"
          :theme-overrides="notificationPopoverThemeOverrides"
          :width="320"
          @update:show="updateNotificationVisibility"
        >
          <template #trigger>
            <NBadge
              :show="notificationUnseenCount > 0"
              :value="notificationUnseenCount"
              :max="99"
              :offset="[-4, 5]"
            >
              <NButton
                class="buddy-icon-button desktop-app-sidebar__notification-trigger"
                quaternary
                :aria-label="t('desktop.notifications.open')"
              >
                <template #icon>
                  <NIcon :component="Alert20Regular" />
                </template>
              </NButton>
            </NBadge>
          </template>
          <DesktopNotificationCenter
            v-if="showNotifications"
            :items="notificationItems"
            :language="language"
            :loading="notificationLoading"
            :unseen-count="notificationUnseenCount"
            @mark-all-seen="emit('markAllNotificationsSeen')"
            @open="openNotification"
          />
        </NPopover>
      </div>
    </footer>

    <DesktopGlobalSearchDialog
      v-model:show="showGlobalSearchDialog"
      :conversations="conversations"
      :language="language"
      :projects="projects"
      @open-conversation="openConversation"
      @open-project="openProject"
    />
    <DesktopAccountDialog
      v-model:show="showAccountDialog"
      :language="language"
    />
  </aside>
</template>

<style scoped lang="scss">
.desktop-app-sidebar {
  display: flex;
  width: var(--buddy-app-sidebar-width);
  height: 100%;
  min-height: 0;
  flex: none;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--buddy-border-light);
  background: var(--buddy-bg-app-sidebar);
}

.desktop-app-sidebar__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0 0.75rem 0 0.9rem;
}

.desktop-app-sidebar__identity {
  display: grid;
  min-width: 0;
  gap: 0.05rem;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--buddy-text-primary);
    font-size: var(--buddy-sidebar-header-font-size);
    font-weight: var(--buddy-sidebar-header-font-weight);
  }

  span {
    min-height: 1em;
    color: var(--buddy-text-placeholder);
    font-size: 0.66rem;
  }
}

.desktop-app-sidebar__header-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.08rem;
}

.desktop-app-sidebar__primary {
  display: grid;
  min-height: 0;
  flex: 1;
  align-content: start;
  gap: 0.15rem;
  padding: 0.8rem 0.75rem;
}

.desktop-app-sidebar__nav-item {
  display: flex;
  width: 100%;
  min-height: 2.55rem;
  align-items: center;
  gap: 0.7rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--buddy-text-regular);
  cursor: pointer;
  font-size: var(--buddy-sidebar-item-font-size);
  font-weight: var(--buddy-sidebar-section-font-weight);
  padding: 0.55rem 0.7rem;
  text-align: left;

  &:hover {
    background: var(--buddy-nav-active-bg);
    color: var(--buddy-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }

  &.is-active {
    background: var(--buddy-nav-active-bg);
    color: var(--buddy-text-primary);
  }
}

.desktop-app-sidebar__footer {
  display: grid;
  gap: 0.65rem;
  border-top: 1px solid var(--buddy-border-light);
  padding: 0.75rem;
}

.desktop-app-sidebar__account {
  display: flex;
  min-width: 0;
  min-height: 2.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.desktop-app-sidebar__profile {
  display: flex;
  min-width: 0;
  min-height: 44px;
  flex: 1;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  padding: 4px 8px;
  text-align: left;

  &:hover {
    background: var(--buddy-nav-active-bg);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }

  strong {
    overflow: hidden;
    color: var(--buddy-text-regular);
    font-size: var(--buddy-sidebar-account-font-size);
    font-weight: var(--buddy-sidebar-account-font-weight);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-app-sidebar :deep(.buddy-icon-button.n-button:hover) {
  background: var(--buddy-nav-active-bg);
}

.desktop-app-sidebar__notification-trigger {
  color: var(--buddy-text-regular);
}

:global(.desktop-notification-popover.n-popover) {
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  box-shadow: var(--buddy-shadow-raised);
}

:global(.desktop-notification-popover__content.n-popover__content) {
  overflow: hidden;
  border-radius: 7px;
  padding: 0;
}
</style>
