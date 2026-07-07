<script setup lang="ts">
import { dateEnUS, dateZhCN, enUS, NConfigProvider, zhCN } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyControlPanel from '@/panel/BuddyControlPanel.vue'
import { useBuddyContextMenuGuard } from '@/shell/useBuddyContextMenuGuard'
import { useBuddyRuntimeStatus } from '@/shell/useBuddyRuntimeStatus'

const {
  appSettings,
  approvals,
  approveApproval,
  runtimeDiagnostics,
  claudeRuntimeStatus,
  codexRuntimeStatus,
  denyApproval,
  errorMessage,
  isLoading,
  isLoadingRunEventSummaries,
  isResolvingApproval,
  isUpdatingAppSettings,
  localState,
  loadRunEventSummaries,
  runEventCounts,
  runEventSummaries,
  runs,
  status,
  updateAppSettings,
  usageSnapshot,
} = useBuddyRuntimeStatus()

const { locale } = useBuddyI18n(() => appSettings.value.language)
const naiveLocale = computed(() => locale.value === 'zh-CN' ? zhCN : enUS)
const naiveDateLocale = computed(() => locale.value === 'zh-CN' ? dateZhCN : dateEnUS)

useBuddyContextMenuGuard(() => appSettings.value.allowNativeContextMenu)
</script>

<template>
  <NConfigProvider
    :date-locale="naiveDateLocale"
    :locale="naiveLocale"
  >
    <main class="buddy-shell is-panel min-h-screen bg-body text-main">
      <section class="buddy-shell__stage">
        <div class="buddy-shell__panel">
          <BuddyControlPanel
            :app-settings="appSettings"
            :approvals="approvals"
            :runtime-diagnostics="runtimeDiagnostics"
            :claude-runtime-status="claudeRuntimeStatus"
            :codex-runtime-status="codexRuntimeStatus"
            :error-message="errorMessage"
            :is-loading="isLoading"
            :is-loading-run-event-summaries="isLoadingRunEventSummaries"
            :is-resolving-approval="isResolvingApproval"
            :is-updating-app-settings="isUpdatingAppSettings"
            :language="locale"
            :local-state="localState"
            :run-event-counts="runEventCounts"
            :run-event-summaries="runEventSummaries"
            :runs="runs"
            :runtime-status="status"
            :usage-snapshot="usageSnapshot"
            @approve-approval="approveApproval"
            @deny-approval="denyApproval"
            @select-log-run="loadRunEventSummaries"
            @update-app-settings="updateAppSettings"
          />
        </div>
      </section>
    </main>
  </NConfigProvider>
</template>

<style scoped lang="scss">
.buddy-shell {
  min-width: 980px;
  height: 100vh;
  overflow: hidden;
  background: transparent;
}

.buddy-shell__stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: 100vh;
  min-height: 0;
}

.buddy-shell__panel {
  min-width: 0;
  min-height: 0;
}
</style>
