<script setup lang="ts">
import type { TaskComposerHostProps } from './typing'
import DesktopChatComposer from '../composer/DesktopChatComposer.vue'
import { useTaskComposer } from './useTaskComposer'

const props = defineProps<TaskComposerHostProps>()
defineSlots<{ leadingContext?: () => unknown }>()
const { bindings, editorKey, sendMessage } = useTaskComposer(props)
</script>

<template>
  <DesktopChatComposer
    :key="editorKey"
    v-bind="bindings"
    @attach="composer.selectAttachments"
    @retry-resource="composer.retryResource"
    @dismiss-interaction="composer.dismissInteraction"
    @send="sendMessage"
    @stop="execution.cancelActiveRun"
    @update-content="composer.updateComposerContent"
    @update-effort="composer.setSelectedEffort"
    @update-permission-mode="composer.setPermissionMode"
    @update-model="composer.selectModel"
    @update-service-tier="composer.setSelectedServiceTier"
  >
    <template #leadingContext>
      <slot name="leadingContext" />
    </template>
  </DesktopChatComposer>
</template>
