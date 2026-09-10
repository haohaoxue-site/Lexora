<script setup lang="ts">
import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { TaskComposerHostProps } from './typing'
import { useTemplateRef } from 'vue'
import ChatMessageQueue from '../composer/ChatMessageQueue.vue'
import DesktopChatComposer from '../composer/DesktopChatComposer.vue'
import { useTaskComposer } from './useTaskComposer'

const props = defineProps<TaskComposerHostProps>()
defineSlots<{ leadingContext?: () => unknown }>()
const composerRef = useTemplateRef<InstanceType<typeof DesktopChatComposer>>('composerRef')
defineExpose({
  focus: () => composerRef.value?.focus(),
  quote: (quote: BuddyMessageQuote) => composerRef.value?.quote(quote) ?? 'unavailable',
})

const { bindings, editorKey, sendMessage } = useTaskComposer(props)
</script>

<template>
  <ChatMessageQueue
    :items="execution.queuedMessages.value"
    :pending="execution.pendingQueueActions.value"
    :language="language"
    @cancel="execution.cancelQueuedMessage"
    @steer="execution.steerQueuedMessage"
  />
  <DesktopChatComposer
    ref="composerRef"
    :key="editorKey"
    v-bind="bindings"
    :has-queued-messages="execution.queuedMessages.value.length > 0"
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
