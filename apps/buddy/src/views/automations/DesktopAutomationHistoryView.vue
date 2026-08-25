<script setup lang="ts">
import { NButton, NResult, NSpin, useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopRouteLocations } from '@/router'
import DesktopAutomationHistoryList from '@/workbenches/automations/DesktopAutomationHistoryList.vue'

const router = useRouter()
const {
  capabilities: { applicationSettings, automations, tasks },
} = useDesktopApp()
const { t } = useBuddyI18n(applicationSettings.language)
const message = useMessage()

async function openTask(conversationId: string): Promise<void> {
  await router.push(desktopRouteLocations.tasks())
  await tasks.session.openTask(conversationId)
}

async function deleteOccurrence(occurrenceId: string): Promise<void> {
  const result = await automations.removeOccurrence(occurrenceId)
  if (result.status === 'failed') {
    message.error(result.error)
    return
  }
  if (result.status === 'succeeded' && result.value)
    await tasks.index.refresh()
}

async function loadMore(): Promise<void> {
  if (!await automations.loadMoreOccurrences() && automations.loadError.value)
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
    :show="automations.isLoading.value && automations.occurrences.value.items.length === 0"
  >
    <NResult
      v-if="automations.loadError.value && automations.occurrences.value.items.length === 0"
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
    <DesktopAutomationHistoryList
      v-else
      :busy="automations.isMutating.value"
      :language="applicationSettings.language.value"
      :occurrences="automations.occurrences.value.items"
      @delete="deleteOccurrence($event.id)"
      @open-task="openTask"
    />
    <NButton
      v-if="automations.occurrences.value.nextCursor"
      class="desktop-automation-route-view__more"
      secondary
      :loading="automations.isLoadingMoreOccurrences.value"
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
