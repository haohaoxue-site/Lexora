<script setup lang="ts">
import type { LocalAutomation } from '@buddy-electron/shared/localChatApi'
import type { AutomationDefinitionDraft } from '@buddy-shared/automation'
import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { desktopRouteLocations } from '@/router'
import DesktopAutomationEditor from '@/workbenches/automations/DesktopAutomationEditor.vue'

const props = defineProps<{
  automationId: string | null
}>()

const router = useRouter()
const {
  capabilities: {
    applicationSettings,
    automations,
    providerSettings,
    tasks,
  },
  ready,
  shell,
  toggleAppSidebar,
} = useDesktopApp()
const automation = shallowRef<LocalAutomation | null>(null)
const isLoading = shallowRef(Boolean(props.automationId))
const mode = computed(() => props.automationId ? 'edit' : 'create')

watch(
  () => props.automationId,
  async (automationId, _previousAutomationId, onCleanup) => {
    let active = true
    onCleanup(() => active = false)
    automations.clearEditorError()
    automation.value = null
    if (!automationId) {
      isLoading.value = false
      return
    }
    isLoading.value = true
    await ready
    const result = await automations.get(automationId)
    if (active) {
      automation.value = result
      isLoading.value = false
    }
  },
  { immediate: true },
)

function cancel(): void {
  void router.replace(desktopRouteLocations.automations('plans'))
}

async function save(draft: AutomationDefinitionDraft): Promise<void> {
  const result = mode.value === 'create'
    ? await automations.create(draft)
    : automation.value
      ? await automations.update(automation.value, draft)
      : null
  if (result)
    await router.replace(desktopRouteLocations.automations('plans'))
}
</script>

<template>
  <DesktopAutomationEditor
    :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
    :automation="automation"
    :busy="automations.isMutating.value"
    :error="automations.editorError.value"
    :language="applicationSettings.language.value"
    :loading="isLoading"
    :mode="mode"
    :models="providerSettings.models.value"
    :preview="automations.preview"
    :providers="providerSettings.providers.value"
    :spaces="tasks.index.spaces.value"
    @cancel="cancel"
    @save="save"
    @toggle-app-sidebar="toggleAppSidebar"
  />
</template>
