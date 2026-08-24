<script setup lang="ts">
import { NButton, NSpin } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopRouteLocations } from '@/router'
import DesktopAutomationHistoryList from '@/workbenches/automations/DesktopAutomationHistoryList.vue'

const router = useRouter()
const {
  capabilities: { applicationSettings, automations, chat },
} = useDesktopApp()
const { t } = useBuddyI18n(applicationSettings.language)

async function openConversation(conversationId: string): Promise<void> {
  await router.push(desktopRouteLocations.chat())
  await chat.session.openConversation(conversationId)
}

async function deleteOccurrence(occurrenceId: string): Promise<void> {
  if (await automations.removeOccurrence(occurrenceId))
    await chat.index.refresh()
}
</script>

<template>
  <NSpin
    class="desktop-automation-route-view"
    :show="automations.isLoading.value && automations.occurrences.value.items.length === 0"
  >
    <DesktopAutomationHistoryList
      :busy="automations.isMutating.value"
      :language="applicationSettings.language.value"
      :occurrences="automations.occurrences.value.items"
      @delete="deleteOccurrence($event.id)"
      @open-conversation="openConversation"
    />
    <NButton
      v-if="automations.occurrences.value.nextCursor"
      class="desktop-automation-route-view__more"
      secondary
      :loading="automations.isLoadingMoreOccurrences.value"
      @click="automations.loadMoreOccurrences"
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
