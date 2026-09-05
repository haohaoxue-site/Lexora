<script setup lang="ts">
import type {
  BrowserToolbarBusyAction,
  BrowserToolbarMenuActionKey,
} from './browserToolbarMenu'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { Pause16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef, toRef, useTemplateRef, watch } from 'vue'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopBrowserToolbar from './DesktopBrowserToolbar.vue'
import { useBrowserContextSurface } from './useBrowserContextSurface'

const props = defineProps<{
  conversationId: string
  language: BuddyLocale
}>()

const { browser, browserGuests } = useDesktopApp()
const { t } = useBuddyI18n(() => props.language)
const surfaceElement = useTemplateRef<HTMLElement>('surfaceElement')
const address = shallowRef('')
const isAddressDirty = shallowRef(false)
const {
  captureScreenshot,
  goBack,
  goForward,
  isCapturingScreenshot,
  isOpeningExternal,
  isShowingFileInFolder,
  isSwitchingProfile,
  isTakingControl,
  navigate,
  openExternal,
  reload,
  setProfileMode,
  showFileInFolder,
  state,
  stop,
  takeControl,
} = useBrowserContextSurface({
  api: browser,
  conversationId: toRef(() => props.conversationId),
  guestHost: browserGuests,
  surfaceElement,
})
const busyAction = computed<BrowserToolbarBusyAction | null>(() => {
  if (isSwitchingProfile.value)
    return 'profile'
  if (isCapturingScreenshot.value)
    return 'screenshot'
  if (isOpeningExternal.value)
    return 'external'
  if (isShowingFileInFolder.value)
    return 'folder'
  return null
})
const controlAnnouncementKey = shallowRef<BuddyI18nKey | null>(null)
const controlAnnouncement = computed(() => controlAnnouncementKey.value
  ? t(controlAnnouncementKey.value)
  : '')

watch(
  [() => state.value?.sessionId, () => state.value?.url],
  ([sessionId, url], [previousSessionId]) => {
    if (sessionId !== previousSessionId) {
      isAddressDirty.value = false
      address.value = url && url !== 'about:blank' ? url : ''
      return
    }
    if (url && url !== 'about:blank' && !isAddressDirty.value)
      address.value = url
  },
)

watch(
  () => state.value?.controller,
  (controller, previousController) => {
    if (controller === 'agent') {
      controlAnnouncementKey.value = 'desktop.context.browserAgentControlling'
      return
    }
    if (previousController === 'agent')
      controlAnnouncementKey.value = 'desktop.context.browserAgentPaused'
  },
)

async function openAddress(): Promise<void> {
  const opened = await navigate(address.value)
  if (!opened)
    return
  isAddressDirty.value = false
  const url = state.value?.url
  address.value = url && url !== 'about:blank' ? url : address.value
}

function updateAddress(value: string): void {
  address.value = value
  isAddressDirty.value = true
}

function handleMenuAction(action: BrowserToolbarMenuActionKey): void {
  switch (action) {
    case 'capture-screenshot':
      void captureScreenshot()
      break
    case 'enter-incognito':
      void setProfileMode('incognito')
      break
    case 'exit-incognito':
      void setProfileMode('default')
      break
    case 'open-external':
      void openExternal()
      break
    case 'show-file-in-folder':
      void showFileInFolder()
      break
  }
}
</script>

<template>
  <section class="desktop-browser-context-surface" data-testid="browser-context-surface">
    <DesktopBrowserToolbar
      :address="address"
      :busy-action="busyAction"
      :language="language"
      :state="state"
      @back="goBack"
      @forward="goForward"
      @menu="handleMenuAction"
      @navigate="openAddress"
      @reload="reload"
      @stop="stop"
      @update:address="updateAddress"
    />
    <div
      v-if="state?.controller === 'agent'"
      class="desktop-browser-context-surface__control"
      data-testid="browser-agent-control"
    >
      <span class="desktop-browser-context-surface__control-state">
        <span class="desktop-browser-context-surface__control-indicator" aria-hidden="true" />
        {{ t('desktop.context.browserAgentControlling') }}
      </span>
      <button
        class="desktop-browser-context-surface__take-control"
        data-testid="browser-take-control"
        type="button"
        :aria-label="t(isTakingControl
          ? 'desktop.context.browserTakingControl'
          : 'desktop.context.browserTakeControl')"
        :aria-busy="isTakingControl"
        :disabled="isTakingControl"
        @click="takeControl"
      >
        <NIcon aria-hidden="true" :component="Pause16Regular" />
        <span>
          {{ t(isTakingControl
            ? 'desktop.context.browserTakingControl'
            : 'desktop.context.browserTakeControl') }}
        </span>
      </button>
    </div>
    <span
      class="desktop-browser-context-surface__announcement"
      data-testid="browser-control-announcement"
      aria-atomic="true"
      aria-live="polite"
      role="status"
    >
      {{ controlAnnouncement }}
    </span>
    <div
      ref="surfaceElement"
      class="desktop-browser-context-surface__viewport"
      data-testid="browser-guest-surface"
      role="group"
      :aria-label="t('desktop.context.browserViewport')"
    />
  </section>
</template>

<style scoped>
.desktop-browser-context-surface {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--buddy-surface-base);
}

.desktop-browser-context-surface__control {
  position: relative;
  z-index: 2;
  display: flex;
  min-width: 0;
  min-height: 2.375rem;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-accent-border);
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-accent-on-surface);
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
}

.desktop-browser-context-surface__control-state {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.desktop-browser-context-surface__control-indicator {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border-radius: 50%;
  background: var(--buddy-accent-solid);
}

.desktop-browser-context-surface__take-control {
  display: flex;
  min-height: 1.875rem;
  flex: none;
  align-items: center;
  gap: 0.375rem;
  border: 0;
  border-radius: 0.375rem;
  background: var(--buddy-accent-solid);
  color: var(--buddy-text-on-accent);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
}

.desktop-browser-context-surface__take-control:not(:disabled):hover {
  background: var(--buddy-accent-solid-hover);
}

.desktop-browser-context-surface__take-control:not(:disabled):active {
  background: var(--buddy-accent-solid-pressed);
}

.desktop-browser-context-surface__take-control:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
}

.desktop-browser-context-surface__take-control:disabled {
  cursor: wait;
  opacity: 0.72;
}

.desktop-browser-context-surface__announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.desktop-browser-context-surface__viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: var(--buddy-surface-base);
}
</style>
