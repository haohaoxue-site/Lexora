<script setup lang="ts">
import type {
  LocalAutomation,
  LocalAutomationListItem,
} from '@buddy-electron/shared/localChatApi'
import type { AutomationActionResult } from '@/workbenches/automations/useAutomationCapability'
import { NButton, NResult, NSpin, useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopRouteLocations } from '@/router'
import DesktopAutomationList from '@/workbenches/automations/DesktopAutomationList.vue'

const router = useRouter()
const {
  capabilities: {
    applicationSettings,
    automations,
  },
} = useDesktopApp()
const { t } = useBuddyI18n(applicationSettings.language)
const message = useMessage()

function openEditor(automation: LocalAutomation | null): void {
  void router.push(automation
    ? desktopRouteLocations.automationEdit(automation.id)
    : desktopRouteLocations.automationCreate())
}

async function runNow(automation: LocalAutomationListItem): Promise<void> {
  if (automation.activeOccurrence) {
    message.info(t('desktop.automations.alreadyRunning'))
    return
  }
  const result = await automations.runNow(automation)
  if (result.status === 'failed') {
    message.error(result.error)
    return
  }
  if (
    result.status === 'busy'
    || result.value.outcome === 'already_running'
  ) {
    message.info(t('desktop.automations.alreadyRunning'))
  }
}

async function performAction<T>(result: Promise<AutomationActionResult<T>>): Promise<void> {
  const outcome = await result
  if (outcome.status === 'failed')
    message.error(outcome.error)
}

async function loadMore(): Promise<void> {
  if (!await automations.loadMoreAutomations() && automations.loadError.value)
    message.error(automations.loadError.value)
}

async function retry(): Promise<void> {
  if (!await automations.refresh() && automations.loadError.value)
    message.error(automations.loadError.value)
}
</script>

<template>
  <NSpin
    class="desktop-automation-route-view"
    :show="automations.isLoading.value && automations.automations.value.items.length === 0"
  >
    <NResult
      v-if="automations.loadError.value && automations.automations.value.items.length === 0"
      status="error"
      :description="automations.loadError.value"
      :title="t('desktop.automations.loadFailed')"
    >
      <template #footer>
        <NButton secondary @click="retry">
          {{ t('desktop.automations.refresh') }}
        </NButton>
      </template>
    </NResult>
    <DesktopAutomationList
      v-else
      :automations="automations.automations.value.items"
      :language="applicationSettings.language.value"
      :pending-automation-ids="automations.pendingAutomationIds.value"
      @create="openEditor(null)"
      @delete="performAction(automations.remove($event))"
      @edit="openEditor"
      @pause="performAction(automations.pause($event))"
      @resume="performAction(automations.resume($event))"
      @run-now="runNow"
    />
    <NButton
      v-if="automations.automations.value.nextCursor"
      class="desktop-automation-route-view__more"
      secondary
      :loading="automations.isLoadingMoreAutomations.value"
      @click="loadMore"
    >
      {{ t('desktop.automations.loadMore') }}
    </NButton>
  </NSpin>
</template>

<style scoped>
.desktop-automation-route-view {
  display: flex;
  min-height: 280px;
  flex: 1;
  flex-direction: column;
}

.desktop-automation-route-view :deep(.n-spin-container),
.desktop-automation-route-view :deep(.n-spin-content) {
  display: flex;
  min-height: 280px;
  flex: 1;
  flex-direction: column;
}

.desktop-automation-route-view__more {
  align-self: center;
  margin-top: 18px;
}
</style>
