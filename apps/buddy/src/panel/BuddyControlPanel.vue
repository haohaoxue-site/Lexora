<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  BuddyApproval,
  BuddyAppSettings,
  BuddyClaudeRuntimeStatus,
  BuddyCodexRuntimeStatus,
  BuddyLocalStateStatus,
  BuddyRun,
  BuddyRunEventCount,
  BuddyRunEventSummary,
  BuddyRuntime,
  BuddyRuntimeDiagnostics,
  BuddyRuntimeStatus,
  BuddyUsageRecord,
  BuddyUsageSnapshot,
  BuddyUsageTotals,
  BuddyUsageWindow,
  BuddyWindowResizeDirection,
  UpdateBuddyAppSettingsRequest,
} from '@/lib/tauriRuntime'
import {
  Dismiss20Regular,
  Maximize20Regular,
  Settings20Regular,
  SquareMultiple20Regular,
  Subtract20Regular,
} from '@vicons/fluent'
import { NIcon, NProgress, NSwitch, NTag, NTooltip } from 'naive-ui'
import { computed, defineComponent, h, onMounted, shallowRef, watch } from 'vue'
import claudeIconUrl from '@/assets/brand/claude.svg'
import codexIconUrl from '@/assets/brand/codex.svg'
import { useBuddyWindowFrame } from '@/chat/useBuddyWindowFrame'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createApprovalViewRows } from '@/panel/approvalView'
import BuddyApprovalQueue from '@/panel/BuddyApprovalQueue.vue'
import BuddyConversationLog from '@/panel/BuddyConversationLog.vue'
import BuddySettingsRows from '@/panel/BuddySettingsRows.vue'
import BuddyUsagePanel from '@/panel/BuddyUsagePanel.vue'
import { createConversationLogRunRows } from '@/panel/runEventView'
import { createRuntimeDiagnosticRows } from '@/panel/runtimeDiagnosticsView'

type BuddyPanelPage = BuddyRuntime | 'usage' | 'logs' | 'settings'

const props = defineProps<{
  appSettings: BuddyAppSettings
  approvals: ReadonlyArray<BuddyApproval>
  runtimeDiagnostics: BuddyRuntimeDiagnostics
  claudeRuntimeStatus: BuddyClaudeRuntimeStatus
  codexRuntimeStatus: BuddyCodexRuntimeStatus
  errorMessage: string | null
  isLoading: boolean
  isLoadingRunEventSummaries: boolean
  isResolvingApproval: boolean
  isUpdatingAppSettings: boolean
  language: BuddyLocale
  localState: BuddyLocalStateStatus
  runEventCounts: ReadonlyArray<BuddyRunEventCount>
  runEventSummaries: ReadonlyArray<BuddyRunEventSummary>
  runs: ReadonlyArray<BuddyRun>
  runtimeStatus: BuddyRuntimeStatus
  usageSnapshot: BuddyUsageSnapshot
}>()

const emit = defineEmits<{
  approveApproval: [approvalId: string, approvalKind: string]
  denyApproval: [approvalId: string]
  selectLogRun: [runId: string]
  updateAppSettings: [request: UpdateBuddyAppSettingsRequest]
}>()

const appIconUrl = new URL('../../src-tauri/icons/128x128.png', import.meta.url).href
const AccountBadgeIcon = defineComponent({
  name: 'AccountBadgeIcon',
  setup() {
    const strokeAttrs = {
      'stroke': 'currentColor',
      'stroke-width': '2',
      'stroke-linejoin': 'round',
    }

    return () => h('svg', {
      'aria-hidden': 'true',
      'class': 'buddy-control__account-token',
      'fill': 'none',
      'viewBox': '0 0 48 48',
      'xmlns': 'http://www.w3.org/2000/svg',
    }, [
      h('rect', {
        ...strokeAttrs,
        height: '32',
        rx: '2',
        width: '40',
        x: '4',
        y: '8',
      }),
      h('path', {
        ...strokeAttrs,
        d: 'M17 25C19.2091 25 21 23.2091 21 21C21 18.7909 19.2091 17 17 17C14.7909 17 13 18.7909 13 21C13 23.2091 14.7909 25 17 25Z',
      }),
      h('path', {
        ...strokeAttrs,
        'd': 'M23 31C23 27.6863 20.3137 25 17 25C13.6863 25 11 27.6863 11 31',
        'stroke-linecap': 'round',
      }),
      h('path', {
        ...strokeAttrs,
        'd': 'M28 20H36',
        'stroke-linecap': 'round',
      }),
      h('path', {
        ...strokeAttrs,
        'd': 'M30 28H36',
        'stroke-linecap': 'round',
      }),
    ])
  },
})
const activePage = shallowRef<BuddyPanelPage>('codex')
const selectedLogRunId = shallowRef<string | null>(null)
const missingValueLabel = '-'
const { languageOptions, t } = useBuddyI18n(() => props.language)
const resizeHandles: ReadonlyArray<{
  direction: BuddyWindowResizeDirection
  placement: string
}> = [
  { direction: 'North', placement: 'north' },
  { direction: 'South', placement: 'south' },
  { direction: 'West', placement: 'west' },
  { direction: 'East', placement: 'east' },
  { direction: 'NorthWest', placement: 'north-west' },
  { direction: 'NorthEast', placement: 'north-east' },
  { direction: 'SouthWest', placement: 'south-west' },
  { direction: 'SouthEast', placement: 'south-east' },
]

const {
  hide,
  isMaximized,
  minimize,
  refreshWindowState,
  startDragging,
  startResizing,
  toggleMaximize,
} = useBuddyWindowFrame()

const maximizeLabel = computed(() => isMaximized.value ? t('window.restore') : t('window.maximize'))
const visibleResizeHandles = computed(() => isMaximized.value ? [] : resizeHandles)

const conversationLogRows = computed(() =>
  createConversationLogRunRows(props.runs, props.runEventCounts, t),
)
const approvalRows = computed(() => createApprovalViewRows(props.approvals))

const activeLogRunId = computed(() => {
  if (
    selectedLogRunId.value
    && conversationLogRows.value.some(row => row.id === selectedLogRunId.value)
  ) {
    return selectedLogRunId.value
  }

  return conversationLogRows.value[0]?.id ?? null
})
const activeLogRunEventCount = computed(() =>
  activeLogRunId.value
    ? conversationLogRows.value.find(row => row.id === activeLogRunId.value)?.eventCount ?? null
    : null,
)

const activeTitle = computed(() => {
  if (activePage.value === 'codex')
    return 'Codex'

  if (activePage.value === 'claude')
    return 'Claude'

  if (activePage.value === 'usage')
    return t('page.usage')

  if (activePage.value === 'logs')
    return t('log.title')

  return t('page.settings')
})

const codexReady = computed(() =>
  props.codexRuntimeStatus.cliAvailable
  && props.codexRuntimeStatus.activeProtocol !== 'unavailable',
)

const claudeReady = computed(() =>
  props.claudeRuntimeStatus.cliAvailable
  && isClaudeAccountLoggedIn()
  && props.claudeRuntimeStatus.executionEnabled,
)

const codexStatus = computed(() =>
  createRuntimeDisplayStatus({
    ready: codexReady.value,
    unavailableLabel: props.codexRuntimeStatus.cliAvailable
      ? t('common.unavailable')
      : t('common.undetected'),
  }),
)

const claudeStatus = computed(() =>
  createRuntimeDisplayStatus({
    ready: claudeReady.value,
    unavailableLabel: props.claudeRuntimeStatus.cliAvailable
      ? t('common.unavailable')
      : t('common.undetected'),
  }),
)

const codexDetailRows = computed(() => [
  {
    label: t('runtime.codexCli'),
    value: props.codexRuntimeStatus.cliAvailable
      ? resolveDetectedLabel(props.codexRuntimeStatus.version)
      : t('common.undetected'),
  },
  {
    label: t('runtime.loginStatus'),
    value: resolveLoginStatusLabel(props.codexRuntimeStatus.loginStatus),
  },
  {
    label: t('runtime.appServer'),
    value: props.codexRuntimeStatus.appServerAvailable
      ? t('common.available')
      : t('common.unavailable'),
  },
  {
    label: t('runtime.interactiveProtocol'),
    value: props.codexRuntimeStatus.execJsonAvailable
      ? 'exec --json'
      : t('common.unavailable'),
  },
  {
    label: t('runtime.execution'),
    value: resolveCodexProtocolLabel(props.codexRuntimeStatus.activeProtocol),
  },
])

const claudeDetailRows = computed(() => [
  {
    label: t('runtime.claudeCli'),
    value: props.claudeRuntimeStatus.cliAvailable
      ? resolveDetectedLabel(props.claudeRuntimeStatus.version)
      : t('common.undetected'),
  },
  {
    label: t('runtime.loginStatus'),
    value: resolveClaudeLoginStatusLabel(props.claudeRuntimeStatus.loginStatus),
  },
  {
    label: t('runtime.authProvider'),
    value: resolveClaudeAuthProviderLabel(props.claudeRuntimeStatus),
  },
  {
    label: t('runtime.interactiveProtocol'),
    value: props.claudeRuntimeStatus.printModeAvailable
      && props.claudeRuntimeStatus.streamJsonAvailable
      ? 'print + stream-json'
      : t('common.unavailable'),
  },
  {
    label: t('runtime.execution'),
    value: props.claudeRuntimeStatus.executionEnabled
      ? resolveClaudeActiveProtocolLabel(props.claudeRuntimeStatus.activeProtocol)
      : t('common.unavailable'),
  },
])

const codexRows = computed(() => [
  ...codexDetailRows.value,
  ...createRuntimeDiagnosticRows(props.runtimeDiagnostics, 'codex', t),
])

const claudeRows = computed(() => [
  ...claudeDetailRows.value,
  ...createRuntimeDiagnosticRows(props.runtimeDiagnostics, 'claude', t),
])

const pathRows = computed(() => [
  {
    label: t('settings.configDir'),
    value: resolveDirectoryPath(
      props.appSettings.configPath || props.localState.paths.configPath,
    ) || missingValueLabel,
  },
  {
    label: t('settings.dataDir'),
    value: props.localState.paths.dataDir || missingValueLabel,
  },
  {
    label: t('settings.conversationsDir'),
    value: props.localState.paths.conversationsDir || missingValueLabel,
  },
  {
    label: t('settings.runsDir'),
    value: props.localState.paths.runsDir || missingValueLabel,
  },
  {
    label: t('settings.memoriesDir'),
    value: props.localState.paths.memoriesDir || missingValueLabel,
  },
  {
    label: t('settings.sqliteDir'),
    value: props.localState.paths.sqliteDir || missingValueLabel,
  },
  {
    label: t('settings.logDir'),
    value: props.localState.paths.logDir || missingValueLabel,
  },
])

const usageGroups = computed(() => [
  createUsageWindowGroup('codex'),
  createUsageWindowGroup('claude'),
])

onMounted(() => {
  void refreshWindowState()
})

watch(
  () => [activePage.value, activeLogRunId.value, activeLogRunEventCount.value] as const,
  ([page, runId]) => {
    if (page === 'logs' && runId)
      emit('selectLogRun', runId)
  },
  { immediate: true },
)

function dragWindow(event: MouseEvent) {
  if (event.button !== 0)
    return

  void startDragging()
}

function resizeWindow(event: PointerEvent, direction: BuddyWindowResizeDirection) {
  if (event.button !== 0)
    return

  event.preventDefault()
  event.stopPropagation()
  void startResizing(direction)
}

function openPage(page: BuddyPanelPage) {
  activePage.value = page
}

function selectLogRun(runId: string) {
  selectedLogRunId.value = runId
}

function updateRuntimeVisibility(runtime: BuddyRuntime, enabled: boolean) {
  activePage.value = runtime
  emit('updateAppSettings', {
    runtimeDialogVisibility: {
      ...props.appSettings.runtimeDialogVisibility,
      [runtime]: enabled,
    },
  })
}

function updateNativeContextMenu(enabled: boolean) {
  emit('updateAppSettings', { allowNativeContextMenu: enabled })
}

function updateLanguage(language: string) {
  emit('updateAppSettings', { language })
}

function createUsageWindowGroup(runtime: BuddyRuntime) {
  const records = props.usageSnapshot.records.filter(record => record.runtime === runtime)
  const totals = summarizeUsageRecords(records)
  return {
    runtime,
    isLoggedIn: resolveRuntimeLoggedIn(runtime),
    label: runtime === 'codex' ? 'Codex' : 'Claude',
    totals,
    windows: props.usageSnapshot.windows.filter(window => window.runtime === runtime),
  }
}

function summarizeUsageRecords(records: ReadonlyArray<BuddyUsageRecord>): BuddyUsageTotals {
  return records.reduce<BuddyUsageTotals>((totals, record) => {
    totals.inputTokens += record.inputTokens
    totals.outputTokens += record.outputTokens
    totals.cacheCreationTokens += record.cacheCreationTokens
    totals.cacheReadTokens += record.cacheReadTokens
    totals.totalTokens += record.totalTokens
    totals.recordCount += 1

    return totals
  }, {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    recordCount: 0,
    totalTokens: 0,
  })
}

function resolveUsageWindowLabel(window: BuddyUsageWindow) {
  if (window.key === 'codex_5h_limit' || window.key === 'claude_5h_limit')
    return t('usage.limit5hShort')

  if (window.key === 'codex_weekly_limit' || window.key === 'claude_weekly_limit')
    return t('usage.weeklyLimitShort')

  return missingValueLabel
}

function resolveUsageWindowPercentage(window: BuddyUsageWindow) {
  if (window.percentage !== null)
    return 100 - clampPercentage(window.percentage)

  return 0
}

function resolveUsageWindowPercentLabel(window: BuddyUsageWindow) {
  if (window.percentage !== null)
    return `${resolveUsageWindowPercentage(window)}%`

  return missingValueLabel
}

function resolveUsageWindowValueLabel(window: BuddyUsageWindow) {
  if (window.usedTokens !== null)
    return `已用 ${formatShortTokenCount(window.usedTokens)}`

  return missingValueLabel
}

function resolveUsageWindowResetLabel(window: BuddyUsageWindow) {
  if (!window.resetsAt)
    return missingValueLabel

  return formatUsageDateTime(window.resetsAt)
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, value))
}

function formatExactTokenCount(value: number | null | undefined) {
  if (value === null || value === undefined)
    return missingValueLabel

  return `${new Intl.NumberFormat(props.language).format(Math.max(0, Math.round(value)))} tokens`
}

function formatShortTokenCount(value: number) {
  if (value >= 1_000_000)
    return `${formatCompactNumber(value / 1_000_000)}M`

  if (value >= 1_000)
    return `${formatCompactNumber(value / 1_000)}K`

  return new Intl.NumberFormat(props.language).format(value)
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(props.language, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)
}

function formatUsageDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value

  if (props.language === 'zh-CN') {
    const parts = new Intl.DateTimeFormat(props.language, {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
    })
      .formatToParts(date)
      .reduce((parts, part) => {
        if (part.type !== 'literal')
          parts[part.type] = part.value

        return parts
      }, {} as Record<string, string>)

    return `${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: 'short',
  })
    .formatToParts(date)
    .reduce((parts, part) => {
      if (part.type !== 'literal')
        parts[part.type] = part.value

      return parts
    }, {} as Record<string, string>)

  return `${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`
}

function createSwitchRailStyle(options: { checked: boolean }) {
  if (options.checked) {
    return {
      background: 'var(--buddy-accent-primary)',
      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--buddy-accent-primary) 76%, #10251d)',
    }
  }

  return {
    background: 'var(--buddy-fill-base)',
    boxShadow: 'inset 0 0 0 1px var(--buddy-border-base)',
  }
}

function createRuntimeDisplayStatus(options: {
  ready: boolean
  unavailableLabel: string
}) {
  if (options.ready) {
    return {
      label: t('common.available'),
      type: 'success' as const,
    }
  }

  return {
    label: options.unavailableLabel,
    type: 'warning' as const,
  }
}

function resolveCodexProtocolLabel(protocol: BuddyCodexRuntimeStatus['activeProtocol']) {
  if (protocol === 'codex_app_server')
    return 'app-server'

  if (protocol === 'codex_exec_json_fallback')
    return 'exec --json'

  return t('common.unavailable')
}

function resolveClaudeLoginStatusLabel(status: BuddyClaudeRuntimeStatus['loginStatus']) {
  return resolveLoginStatusLabel(status)
}

function resolveLoginStatusLabel(status: BuddyClaudeRuntimeStatus['loginStatus']) {
  if (status === 'logged_in')
    return t('common.loggedIn')

  if (status === 'logged_out')
    return t('common.loggedOut')

  if (status === 'unavailable')
    return t('common.unavailable')

  return t('common.unavailable')
}

function resolveRuntimeLoggedIn(runtime: BuddyRuntime) {
  return runtime === 'codex'
    ? props.codexRuntimeStatus.loginStatus === 'logged_in'
    : isClaudeAccountLoggedIn()
}

function isClaudeAccountLoggedIn() {
  return props.claudeRuntimeStatus.loginStatus === 'logged_in'
    && props.claudeRuntimeStatus.apiProvider === 'firstParty'
    && props.claudeRuntimeStatus.executionEnabled
}

function resolveClaudeAuthProviderLabel(status: BuddyClaudeRuntimeStatus) {
  if (status.apiProvider && status.authMethod)
    return `${status.apiProvider} / ${status.authMethod}`

  return status.apiProvider || status.authMethod || missingValueLabel
}

function resolveClaudeActiveProtocolLabel(protocol: BuddyClaudeRuntimeStatus['activeProtocol']) {
  if (protocol === 'status_only')
    return t('common.unavailable')

  return t('common.unavailable')
}

function resolveDetectedLabel(version: string | null) {
  return version
    ? t('common.detectedVersion', { version })
    : t('common.detected')
}

function resolveDirectoryPath(path: string) {
  const normalizedPath = path.trim()
  if (!normalizedPath)
    return ''

  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  if (lastSlashIndex <= 0)
    return normalizedPath

  return normalizedPath.slice(0, lastSlashIndex)
}
</script>

<template>
  <section class="buddy-control">
    <span
      v-for="handle in visibleResizeHandles"
      :key="handle.direction"
      aria-hidden="true"
      class="buddy-control__resize-handle"
      :class="`is-${handle.placement}`"
      @pointerdown="resizeWindow($event, handle.direction)"
    />

    <aside class="buddy-control__sidebar">
      <header
        data-tauri-drag-region
        class="buddy-control__brandbar"
        @mousedown="dragWindow"
      >
        <div
          data-tauri-drag-region
          class="buddy-control__brand"
        >
          <img
            data-tauri-drag-region
            :src="appIconUrl"
            alt=""
            draggable="false"
          >
          <strong data-tauri-drag-region>Lexora</strong>
        </div>

        <button
          :aria-label="t('window.settings')"
          class="buddy-control__settings-button"
          :class="{ 'is-active': activePage === 'settings' }"
          type="button"
          @click="openPage('settings')"
          @mousedown.stop
        >
          <NIcon
            :component="Settings20Regular"
            :size="20"
          />
        </button>
      </header>

      <div class="buddy-control__runtime-grid">
        <article
          class="buddy-control__runtime-card"
          :class="{ 'is-active': activePage === 'codex' }"
          tabindex="0"
          @click="openPage('codex')"
          @keydown.enter="openPage('codex')"
          @keydown.space.prevent="openPage('codex')"
        >
          <span class="buddy-control__runtime-head">
            <span class="buddy-control__runtime-mark is-codex">
              <img
                :src="codexIconUrl"
                alt=""
                draggable="false"
              >
            </span>
            <NSwitch
              size="medium"
              :rail-style="createSwitchRailStyle"
              :value="appSettings.runtimeDialogVisibility.codex"
              @click.stop
              @update:value="updateRuntimeVisibility('codex', $event)"
            />
          </span>
          <span class="buddy-control__runtime-title">
            <strong>Codex</strong>
            <NTooltip v-if="codexRuntimeStatus.loginStatus === 'logged_in'">
              <template #trigger>
                <AccountBadgeIcon />
              </template>
              {{ t('common.loggedIn') }}
            </NTooltip>
          </span>
        </article>

        <article
          class="buddy-control__runtime-card"
          :class="{ 'is-active': activePage === 'claude' }"
          tabindex="0"
          @click="openPage('claude')"
          @keydown.enter="openPage('claude')"
          @keydown.space.prevent="openPage('claude')"
        >
          <span class="buddy-control__runtime-head">
            <span class="buddy-control__runtime-mark is-claude">
              <img
                :src="claudeIconUrl"
                alt=""
                draggable="false"
              >
            </span>
            <NSwitch
              size="medium"
              :rail-style="createSwitchRailStyle"
              :value="appSettings.runtimeDialogVisibility.claude"
              @click.stop
              @update:value="updateRuntimeVisibility('claude', $event)"
            />
          </span>
          <span class="buddy-control__runtime-title">
            <strong>Claude</strong>
            <NTooltip v-if="isClaudeAccountLoggedIn()">
              <template #trigger>
                <AccountBadgeIcon />
              </template>
              {{ t('common.loggedIn') }}
            </NTooltip>
          </span>
        </article>
      </div>

      <article
        :aria-label="t('page.usage')"
        class="buddy-control__usage-card"
        :class="{ 'is-active': activePage === 'usage' }"
        tabindex="0"
        @click="openPage('usage')"
        @keydown.enter="openPage('usage')"
        @keydown.space.prevent="openPage('usage')"
      >
        <div class="buddy-control__usage-stack">
          <section
            v-for="group in usageGroups"
            :key="group.runtime"
            class="buddy-control__usage-group"
          >
            <header>
              <strong>{{ group.label }}</strong>
            </header>

            <div
              v-if="group.isLoggedIn"
              class="buddy-control__usage-window-stack"
            >
              <section
                v-for="window in group.windows"
                :key="window.key"
                class="buddy-control__usage-window"
              >
                <span>
                  <strong>{{ resolveUsageWindowLabel(window) }}</strong>
                  <small>
                    {{ resolveUsageWindowPercentLabel(window) }}
                    /
                    {{ resolveUsageWindowResetLabel(window) }}
                  </small>
                </span>
                <NProgress
                  type="line"
                  :percentage="resolveUsageWindowPercentage(window)"
                  :show-indicator="false"
                  :height="7"
                  color="var(--buddy-accent-primary)"
                  rail-color="#d7e2da"
                />
                <em v-if="window.usedTokens !== null">
                  {{ resolveUsageWindowValueLabel(window) }}
                </em>
              </section>
            </div>

            <div
              v-else
              class="buddy-control__usage-total-shell"
            >
              <NTooltip>
                <template #trigger>
                  <div class="buddy-control__usage-total">
                    <span>{{ t('usage.totalTokens') }}</span>
                    <strong>{{ formatShortTokenCount(group.totals.totalTokens) }}</strong>
                  </div>
                </template>
                {{ formatExactTokenCount(group.totals.totalTokens) }}
              </NTooltip>
            </div>
          </section>
        </div>
      </article>

      <article
        class="buddy-control__log-card"
        :class="{ 'is-active': activePage === 'logs' }"
        tabindex="0"
        @click="openPage('logs')"
        @keydown.enter="openPage('logs')"
        @keydown.space.prevent="openPage('logs')"
      >
        <strong>{{ t('log.title') }}</strong>
        <small>
          {{ conversationLogRows.length > 0
            ? t('control.logCount', { count: conversationLogRows.length })
            : t('control.noRecords') }}
        </small>
      </article>
    </aside>

    <main class="buddy-control__main">
      <header
        data-tauri-drag-region
        class="buddy-control__topbar"
        @dblclick="toggleMaximize"
        @mousedown="dragWindow"
      >
        <h1 data-tauri-drag-region>
          {{ activeTitle }}
        </h1>

        <div
          class="buddy-control__window-controls"
          @dblclick.stop
          @mousedown.stop
          @pointerdown.stop
        >
          <button
            :aria-label="t('window.minimize')"
            class="buddy-control__window-button"
            type="button"
            @click="minimize"
          >
            <NIcon :component="Subtract20Regular" />
          </button>
          <button
            :aria-label="maximizeLabel"
            class="buddy-control__window-button"
            type="button"
            @click="toggleMaximize"
          >
            <NIcon :component="isMaximized ? SquareMultiple20Regular : Maximize20Regular" />
          </button>
          <button
            :aria-label="t('window.close')"
            class="buddy-control__window-button is-close"
            type="button"
            @click="hide"
          >
            <NIcon :component="Dismiss20Regular" />
          </button>
        </div>
      </header>

      <div class="buddy-control__content">
        <p
          v-if="errorMessage"
          class="buddy-control__error"
        >
          {{ errorMessage }}
        </p>

        <section
          v-if="activePage === 'codex'"
          class="buddy-control__page"
        >
          <BuddyApprovalQueue
            :is-loading="isLoading"
            :is-resolving-approval="isResolvingApproval"
            :rows="approvalRows"
            @approve-approval="(approvalId, approvalKind) => emit('approveApproval', approvalId, approvalKind)"
            @deny-approval="emit('denyApproval', $event)"
          />

          <div class="buddy-control__detail-panel">
            <header class="buddy-control__detail-head">
              <div>
                <strong>Codex</strong>
                <p>{{ t('runtime.codexDescription') }}</p>
              </div>
              <NTag
                round
                size="small"
                :type="codexStatus.type"
              >
                {{ codexStatus.label }}
              </NTag>
            </header>

            <dl class="buddy-control__rows">
              <div
                v-for="row in codexRows"
                :key="row.label"
              >
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          v-else-if="activePage === 'claude'"
          class="buddy-control__page"
        >
          <div class="buddy-control__detail-panel">
            <header class="buddy-control__detail-head">
              <div>
                <strong>Claude</strong>
                <p>{{ t('runtime.claudeDescription') }}</p>
              </div>
              <NTag
                round
                size="small"
                :type="claudeStatus.type"
              >
                {{ claudeStatus.label }}
              </NTag>
            </header>

            <dl class="buddy-control__rows">
              <div
                v-for="row in claudeRows"
                :key="row.label"
              >
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          v-else-if="activePage === 'usage'"
          class="buddy-control__page"
        >
          <BuddyUsagePanel
            :language="language"
            :t="t"
            :usage-snapshot="usageSnapshot"
          />
        </section>

        <section
          v-else-if="activePage === 'logs'"
          class="buddy-control__page buddy-control__page--logs"
        >
          <BuddyConversationLog
            :active-run-id="activeLogRunId"
            :event-summaries="runEventSummaries"
            :is-loading-events="isLoadingRunEventSummaries"
            :language="language"
            :rows="conversationLogRows"
            @select-run="selectLogRun"
          />
        </section>

        <section
          v-else
          class="buddy-control__page"
        >
          <BuddySettingsRows
            :allow-native-context-menu="appSettings.allowNativeContextMenu"
            :is-updating="isUpdatingAppSettings"
            :language-options="languageOptions"
            :language-value="appSettings.language"
            :path-rows="pathRows"
            :t="t"
            :version="runtimeStatus.version"
            @update-language="updateLanguage"
            @update-native-context-menu="updateNativeContextMenu"
          />
        </section>
      </div>
    </main>
  </section>
</template>

<style scoped lang="scss">
.buddy-control {
  position: relative;
  display: grid;
  grid-template-columns: 360px minmax(620px, 1fr);
  min-width: 0;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--buddy-window-border);
  border-radius: 4px;
  background: var(--buddy-bg-body);
  box-shadow: var(--buddy-shadow-window);
  color: var(--buddy-text-primary);
}

.buddy-control__resize-handle {
  position: absolute;
  z-index: 30;
  display: block;
  -webkit-app-region: no-drag;
}

.buddy-control__resize-handle.is-north,
.buddy-control__resize-handle.is-south {
  right: 12px;
  left: 12px;
  height: 8px;
  cursor: ns-resize;
}

.buddy-control__resize-handle.is-north {
  top: 0;
}

.buddy-control__resize-handle.is-south {
  bottom: 0;
}

.buddy-control__resize-handle.is-west,
.buddy-control__resize-handle.is-east {
  top: 12px;
  bottom: 12px;
  width: 8px;
  cursor: ew-resize;
}

.buddy-control__resize-handle.is-west {
  left: 0;
}

.buddy-control__resize-handle.is-east {
  right: 0;
}

.buddy-control__resize-handle.is-north-west,
.buddy-control__resize-handle.is-north-east,
.buddy-control__resize-handle.is-south-west,
.buddy-control__resize-handle.is-south-east {
  width: 14px;
  height: 14px;
}

.buddy-control__resize-handle.is-north-west {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.buddy-control__resize-handle.is-north-east {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.buddy-control__resize-handle.is-south-west {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}

.buddy-control__resize-handle.is-south-east {
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
}

.buddy-control__sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border-right: 1px solid var(--buddy-border-light);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 66%) 0%, transparent 34%),
    var(--buddy-bg-body);
  padding: 0 12px 16px;
}

.buddy-control__brandbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 74px;
  gap: 14px;
  min-width: 0;
  user-select: none;
  -webkit-app-region: drag;
}

.buddy-control__brand {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.buddy-control__brand img {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.buddy-control__brand strong {
  overflow: hidden;
  color: var(--buddy-text-primary);
  font-size: 25px;
  font-weight: 700;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-control__settings-button,
.buddy-control__window-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  padding: 0;
}

.buddy-control__settings-button {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  -webkit-app-region: no-drag;
}

.buddy-control__settings-button:hover,
.buddy-control__settings-button.is-active {
  background: color-mix(in srgb, var(--buddy-accent-primary) 10%, #ffffff);
  color: var(--buddy-accent-primary);
}

.buddy-control__settings-button :deep(svg) {
  width: 20px;
  height: 20px;
}

.buddy-control__settings-button :deep(.n-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  font-size: 20px;
  line-height: 1;
}

.buddy-control__runtime-grid {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.buddy-control__runtime-card,
.buddy-control__usage-card,
.buddy-control__log-card,
.buddy-control__detail-panel {
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: var(--buddy-bg-surface);
  box-shadow: 0 10px 26px rgb(23 33 28 / 6%);
}

.buddy-control__runtime-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  min-height: 126px;
  color: var(--buddy-text-primary);
  cursor: pointer;
  padding: 16px;
  text-align: left;
}

.buddy-control__runtime-card:hover,
.buddy-control__runtime-card.is-active,
.buddy-control__usage-card:hover,
.buddy-control__usage-card.is-active,
.buddy-control__log-card:hover,
.buddy-control__log-card.is-active {
  border-color: color-mix(in srgb, var(--buddy-accent-primary) 52%, var(--buddy-border-light));
  box-shadow: 0 14px 34px rgb(31 86 67 / 10%);
}

.buddy-control__runtime-card.is-active,
.buddy-control__usage-card.is-active,
.buddy-control__log-card.is-active {
  background: color-mix(in srgb, var(--buddy-accent-primary) 9%, var(--buddy-bg-surface));
  color: var(--buddy-text-primary);
}

.buddy-control__runtime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.buddy-control__runtime-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--buddy-fill-light) 82%, #ffffff);
  color: var(--buddy-text-primary);
}

.buddy-control__runtime-mark.is-codex {
  background: #111827;
}

.buddy-control__runtime-mark.is-claude {
  background: #fff1e8;
}

.buddy-control__runtime-mark img {
  width: 22px;
  height: 22px;
}

.buddy-control__runtime-title {
  display: flex;
  align-self: end;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.buddy-control__runtime-card strong {
  align-self: end;
  font-size: 21px;
  font-weight: 600;
  line-height: 1.1;
}

.buddy-control__account-token {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  color: var(--buddy-accent-primary);
}

.buddy-control__usage-card {
  display: grid;
  align-content: start;
  flex: 0 0 auto;
  gap: 14px;
  min-height: 148px;
  color: var(--buddy-text-primary);
  cursor: pointer;
  padding: 16px 18px;
  text-align: left;
}

.buddy-control__usage-group small,
.buddy-control__usage-window small {
  color: inherit;
  font-size: 12px;
  line-height: 1.35;
  opacity: 0.68;
}

.buddy-control__usage-stack {
  display: grid;
  gap: 14px;
  min-width: 0;
  width: 100%;
}

.buddy-control__usage-group {
  display: grid;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.buddy-control__usage-group header,
.buddy-control__usage-window span:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.buddy-control__usage-group header strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.buddy-control__usage-window-stack {
  display: grid;
  gap: 9px;
}

.buddy-control__usage-window {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.buddy-control__usage-window strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.buddy-control__usage-window small,
.buddy-control__usage-window em {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.buddy-control__usage-window em {
  color: var(--buddy-text-secondary);
  font-size: 11px;
  font-style: normal;
  line-height: 1.2;
}

.buddy-control__usage-total-shell {
  display: block;
  min-width: 0;
  width: 100%;
}

.buddy-control__usage-total {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  width: 100%;
  border-radius: 7px;
  background: color-mix(in srgb, var(--buddy-fill-light) 78%, #ffffff);
  padding: 9px 10px;
}

.buddy-control__usage-total span {
  min-width: 0;
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.buddy-control__usage-total strong {
  color: var(--buddy-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}

.buddy-control__detail-head p,
.buddy-control__rows dt {
  color: var(--buddy-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.buddy-control__log-card {
  display: grid;
  flex: 0 0 auto;
  gap: 8px;
  color: var(--buddy-text-primary);
  cursor: pointer;
  padding: 16px;
}

.buddy-control__log-card strong {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
}

.buddy-control__log-card small {
  color: inherit;
  font-size: 13px;
  line-height: 1.35;
  opacity: 0.72;
}

.buddy-control__main {
  display: grid;
  grid-template-rows: 74px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--buddy-bg-surface-raised);
}

.buddy-control__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;
  border-bottom: 1px solid var(--buddy-border-light);
  background: linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--buddy-bg-surface-raised) 88%, var(--buddy-bg-body)) 100%);
  user-select: none;
  -webkit-app-region: drag;
  padding: 0 10px 0 28px;
}

.buddy-control__topbar h1 {
  margin: 0;
  color: var(--buddy-text-primary);
  font-size: 25px;
  font-weight: 600;
  line-height: 1.1;
}

.buddy-control__window-controls {
  position: relative;
  z-index: 40;
  display: grid;
  grid-template-columns: repeat(3, 36px);
  gap: 2px;
  -webkit-app-region: no-drag;
}

.buddy-control__window-button {
  width: 36px;
  height: 32px;
  border-radius: 8px;
  color: var(--buddy-text-regular);
}

.buddy-control__window-button:hover {
  background: color-mix(in srgb, var(--buddy-fill-base) 78%, transparent);
}

.buddy-control__window-button.is-close:hover {
  background: color-mix(in srgb, var(--buddy-accent-danger) 16%, #ffffff);
  color: var(--buddy-accent-danger);
}

.buddy-control__window-button :deep(svg) {
  width: 15px;
  height: 15px;
}

.buddy-control__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--buddy-bg-surface-raised);
  padding: 16px 28px 28px;
}

.buddy-control__page {
  display: grid;
  flex: 1 1 auto;
  gap: 18px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.buddy-control__page--logs {
  overflow: hidden;
}

.buddy-control__detail-panel {
  display: grid;
  gap: 18px;
  padding: 20px;
}

.buddy-control__detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.buddy-control__detail-head strong {
  color: var(--buddy-text-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.buddy-control__detail-head p {
  margin: 6px 0 0;
}

.buddy-control__rows {
  display: grid;
  margin: 0;
}

.buddy-control__rows div {
  display: grid;
  grid-template-columns: minmax(120px, 220px) minmax(0, 1fr);
  align-items: center;
  gap: 20px;
  min-height: 54px;
  border-top: 1px solid var(--buddy-border-light);
}

.buddy-control__rows dd {
  min-width: 0;
  margin: 0;
  color: var(--buddy-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  text-align: right;
}

.buddy-control__error {
  margin: 0 0 16px;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-danger) 28%, var(--buddy-border-light));
  border-radius: 8px;
  background: color-mix(in srgb, var(--buddy-accent-danger) 8%, var(--buddy-bg-surface));
  color: var(--buddy-accent-danger);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
}
</style>
