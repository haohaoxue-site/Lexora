<script setup lang="ts">
import type {
  DesktopAppInfo,
  DesktopUpdateCheckResult,
  DesktopWindowState,
  LexoraDesktopApi,
} from '@buddy-electron/shared/desktopApi'
import type { DesktopCommandId } from '@buddy-electron/shared/desktopCommands'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { getDesktopCommand } from '@buddy-electron/shared/desktopCommands'
import { useMessage } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/ui/DesktopIcon.vue'
import DesktopAboutDialog from '@/window/DesktopAboutDialog.vue'
import DesktopFeedbackDialog from '@/window/DesktopFeedbackDialog.vue'
import DesktopUpdateDialog from '@/window/DesktopUpdateDialog.vue'
import DesktopWindowMenuBar from '@/window/DesktopWindowMenuBar.vue'

const props = defineProps<{
  appInfo: DesktopAppInfo | null
  language: BuddyLocale
}>()

const desktopApi = requireDesktopApi()
const isAlwaysOnTop = shallowRef(false)
const isMaximized = shallowRef(false)
const showAbout = shallowRef(false)
const showFeedback = shallowRef(false)
const showUpdate = shallowRef(false)
const updateResult = shallowRef<DesktopUpdateCheckResult | null>(null)
const { t } = useBuddyI18n(() => props.language)
const message = useMessage()
const platform = computed(() => props.appInfo?.platform ?? 'linux')
const maximizeLabel = computed(() => isMaximized.value
  ? t('desktop.window.restore')
  : t('desktop.window.maximize'))
const pinLabel = computed(() => isAlwaysOnTop.value
  ? t('desktop.window.unpin')
  : t('desktop.window.pin'))
let windowStateVersion = 0

const rendererCommandHandlers = {
  'app.about': () => showAbout.value = true,
  'app.checkUpdates': checkForUpdates,
  'help.feedback': () => showFeedback.value = true,
} satisfies Partial<Record<DesktopCommandId, () => void>>

const stopWindowState = desktopApi.window.onStateChanged((state) => {
  windowStateVersion += 1
  applyWindowState(state)
})

onMounted(async () => {
  const snapshotVersion = windowStateVersion
  try {
    const state = await desktopApi.window.getState()
    if (snapshotVersion === windowStateVersion)
      applyWindowState(state)
  }
  catch (error) {
    console.error('Lexora window state is unavailable', error)
  }
})

onBeforeUnmount(stopWindowState)

async function executeDesktopCommand(commandId: DesktopCommandId) {
  try {
    const command = getDesktopCommand(commandId)
    if (command.execution === 'main') {
      await desktopApi.commands.execute(commandId)
      return
    }
    const handler = rendererCommandHandlers[commandId as keyof typeof rendererCommandHandlers]
    if (!handler)
      throw new Error(`Desktop command has no renderer handler: ${commandId}`)
    await handler()
  }
  catch (error) {
    console.error(`Lexora Desktop command ${commandId} failed`, error)
    message.error(t('desktop.command.failed'))
  }
}

async function toggleAlwaysOnTop() {
  await runWindowAction(() => desktopApi.window.toggleAlwaysOnTop())
}

async function toggleMaximize() {
  await runWindowAction(() => desktopApi.window.toggleMaximize())
}

async function minimize() {
  try {
    await desktopApi.window.minimize()
  }
  catch (error) {
    console.error('Lexora window action failed', error)
  }
}

async function checkForUpdates() {
  try {
    updateResult.value = await desktopApi.app.checkForUpdates()
    showUpdate.value = true
  }
  catch (error) {
    console.error('Lexora Buddy update check failed', error)
    message.error(t('desktop.update.failed'))
  }
}

async function openFeedbackIssue(feedback: string) {
  try {
    await desktopApi.app.openFeedbackIssue(feedback)
    showFeedback.value = false
  }
  catch (error) {
    console.error('Lexora Buddy feedback page is unavailable', error)
    message.error(t('desktop.command.failed'))
  }
}

async function openReleasePage(url: string) {
  try {
    await desktopApi.app.openReleasePage(url)
  }
  catch (error) {
    console.error('Lexora Buddy release page is unavailable', error)
    message.error(t('desktop.command.failed'))
  }
}

async function runWindowAction(action: () => Promise<DesktopWindowState>) {
  try {
    applyWindowState(await action())
  }
  catch (error) {
    console.error('Lexora window action failed', error)
  }
}

function applyWindowState(state: DesktopWindowState) {
  isAlwaysOnTop.value = state.isAlwaysOnTop
  isMaximized.value = state.isMaximized
}

function requireDesktopApi(): LexoraDesktopApi {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('Lexora Desktop API is unavailable')
  return api
}
</script>

<template>
  <header class="desktop-title-bar" @dblclick="toggleMaximize">
    <div class="desktop-title-bar__safe-area">
      <DesktopWindowMenuBar
        :language="language"
        :platform="platform"
        @command="executeDesktopCommand"
      />

      <div
        class="desktop-title-bar__controls"
        @dblclick.stop
        @mousedown.stop
        @pointerdown.stop
      >
        <button
          :aria-label="pinLabel"
          :aria-pressed="isAlwaysOnTop"
          class="desktop-title-bar__control"
          :class="{ 'is-active': isAlwaysOnTop }"
          type="button"
          @click="toggleAlwaysOnTop"
        >
          <DesktopIcon data-window-control-icon="pin" name="windowPin" />
        </button>
        <button
          :aria-label="t('desktop.window.minimize')"
          class="desktop-title-bar__control"
          type="button"
          @click="minimize"
        >
          <DesktopIcon data-window-control-icon="minimize" name="windowMinimize" />
        </button>
        <button
          :aria-label="maximizeLabel"
          class="desktop-title-bar__control"
          type="button"
          @click="toggleMaximize"
        >
          <DesktopIcon
            v-if="isMaximized"
            data-window-control-icon="restore"
            name="windowRestore"
          />
          <DesktopIcon
            v-else
            data-window-control-icon="maximize"
            name="windowMaximize"
          />
        </button>
        <button
          :aria-label="t('desktop.command.window.close')"
          class="desktop-title-bar__control is-close"
          type="button"
          @click="executeDesktopCommand('window.close')"
        >
          <DesktopIcon data-window-control-icon="close" name="windowClose" />
        </button>
      </div>
    </div>

    <DesktopAboutDialog
      v-model:show="showAbout"
      :app-info="appInfo"
      :language="language"
    />
    <DesktopFeedbackDialog
      v-model:show="showFeedback"
      :language="language"
      @open-github-issue="openFeedbackIssue"
    />
    <DesktopUpdateDialog
      v-model:show="showUpdate"
      :language="language"
      :result="updateResult"
      @open-release="openReleasePage"
    />
  </header>
</template>

<style scoped>
.desktop-title-bar {
  position: relative;
  height: var(--buddy-titlebar-height);
  flex: none;
  border-bottom: 1px solid var(--buddy-border-light);
  background: var(--buddy-bg-body);
  color: var(--buddy-text-primary);
  user-select: none;
  -webkit-app-region: drag;
}

.desktop-title-bar__safe-area {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.desktop-title-bar__controls {
  display: flex;
  height: var(--buddy-titlebar-height);
  flex: none;
  align-self: center;
  -webkit-app-region: no-drag;
}

.desktop-title-bar__control {
  display: grid;
  width: var(--buddy-titlebar-height);
  height: var(--buddy-titlebar-height);
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: default;

  &:hover {
    background: var(--buddy-fill-base);
    color: var(--buddy-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }

  &.is-active {
    color: var(--buddy-accent-primary);
  }

  &.is-close:hover {
    background: var(--buddy-accent-danger);
    color: var(--buddy-text-on-accent);
  }

  .desktop-icon {
    width: 1rem;
    height: 1rem;
  }
}
</style>
