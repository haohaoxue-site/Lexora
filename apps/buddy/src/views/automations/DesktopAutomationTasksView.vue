<script setup lang="ts">
import type { LocalAutomation } from '@buddy-electron/shared/localChatApi'
import { NButton, NSpin } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopRouteLocations } from '@/router'
import DesktopAutomationTaskList from '@/workbenches/automations/DesktopAutomationTaskList.vue'

const router = useRouter()
const {
  capabilities: {
    applicationSettings,
    automations,
  },
} = useDesktopApp()
const { t } = useBuddyI18n(applicationSettings.language)

function openEditor(automation: LocalAutomation | null): void {
  void router.push(automation
    ? desktopRouteLocations.automationEdit(automation.id)
    : desktopRouteLocations.automationCreate())
}
</script>

<template>
  <NSpin
    class="desktop-automation-route-view"
    :show="automations.isLoading.value && automations.automations.value.items.length === 0"
  >
    <DesktopAutomationTaskList
      :automations="automations.automations.value.items"
      :busy="automations.isMutating.value"
      :language="applicationSettings.language.value"
      @create="openEditor(null)"
      @delete="automations.remove"
      @edit="openEditor"
      @pause="automations.pause"
      @resume="automations.resume"
      @run-now="automations.runNow"
    />
    <NButton
      v-if="automations.automations.value.nextCursor"
      class="desktop-automation-route-view__more"
      secondary
      :loading="automations.isLoadingMoreAutomations.value"
      @click="automations.loadMoreAutomations"
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
