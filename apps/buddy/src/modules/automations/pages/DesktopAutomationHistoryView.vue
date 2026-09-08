<script setup lang="ts">
import { NButton, NResult, NSpin, useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { useAutomationContext } from '@/modules/automations/automationContext'
import DesktopAutomationHistoryList from '@/modules/automations/widgets/list/DesktopAutomationHistoryList.vue'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'

const router = useRouter()
const {
  language,
  automations,
  openTask: openTaskSession,
  refreshTasks,
} = useAutomationContext()
const { t } = useBuddyI18n(language)
const message = useMessage()

async function openTask(conversationId: string): Promise<void> {
  await router.push(desktopRouteLocations.tasks())
  await openTaskSession(conversationId)
}

async function deleteOccurrence(occurrenceId: string): Promise<void> {
  const result = await automations.removeOccurrence(occurrenceId)
  if (result.status === 'failed') {
    message.error(result.error)
    return
  }
  if (result.status === 'succeeded' && result.value)
    await refreshTasks()
}

async function loadMore(): Promise<void> {
  if (!await automations.loadMoreOccurrences() && automations.loadError.value)
    message.error(automations.loadError.value)
}

async function retry(): Promise<void> {
  if (!await automations.refresh() && automations.loadError.value)
    message.error(automations.loadError.value)
}
const { occurrences, isLoading, isLoadingMoreOccurrences, isMutating, loadError } = automations
</script>

<template>
  <NSpin
    class="desktop-automation-route-view"
    :show="isLoading && occurrences.items.length === 0"
  >
    <NResult
      v-if="loadError && occurrences.items.length === 0"
      status="error"
      :description="loadError"
      :title="t('desktop.automations.loadFailed')"
    >
      <template #footer>
        <NButton secondary @click="retry">
          {{ t('desktop.automations.refresh') }}
        </NButton>
      </template>
    </NResult>
    <DesktopAutomationHistoryList
      v-else
      :busy="isMutating"
      :language="language"
      :occurrences="occurrences.items"
      @delete="deleteOccurrence($event.id)"
      @open-task="openTask"
    />
    <NButton
      v-if="occurrences.nextCursor"
      class="desktop-automation-route-view__more"
      secondary
      :loading="isLoadingMoreOccurrences"
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
