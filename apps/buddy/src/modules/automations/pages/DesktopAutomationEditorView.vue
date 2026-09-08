<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAutomationContext } from '@/modules/automations/automationContext'
import DesktopAutomationEditor from '@/modules/automations/widgets/editor/DesktopAutomationEditor.vue'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import { useAutomationEditorRoute } from './useAutomationEditorRoute'

const props = defineProps<{
  automationId: string | null
}>()

const router = useRouter()
const {
  language,
  automations,
  providerSettings,
  spaces,
  ready,
} = useAutomationContext()
const { automation, error, isLoading, isSaving, mode, save } = useAutomationEditorRoute({
  automationId: () => props.automationId,
  automations,
  language,
  onSaved: () => cancel(),
  ready,
})

function cancel(): void {
  void router.replace(desktopRouteLocations.automations('plans'))
}
const { isMutating } = automations
const { models, providers } = providerSettings
</script>

<template>
  <DesktopAutomationEditor
    :automation="automation"
    :busy="isSaving || isMutating"
    :error="error"
    :language="language"
    :loading="isLoading"
    :mode="mode"
    :models="models"
    :preview="automations.preview"
    :providers="providers"
    :spaces="spaces"
    @cancel="cancel"
    @save="save"
  />
</template>
