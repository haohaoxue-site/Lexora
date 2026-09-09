<script setup lang="ts">
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalMessage } from '@buddy-shared/conversation/conversationApi'
import type { ChatTranscriptTurnOutputs } from '../../model/transcript/chatTranscriptProjection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { getChatMessageInterruption } from '../../model/transcript/chatMessageContent'
import BuddyChatMessageContent from './BuddyChatMessageContent.vue'
import BuddyChatTurnChanges from './BuddyChatTurnChanges.vue'
import BuddyChatTurnOutputs from './BuddyChatTurnOutputs.vue'

const props = defineProps<{
  message: LocalMessage
  language: BuddyLocale
  final: boolean
  turnOutputs: ChatTranscriptTurnOutputs | null
  turnChanges?: LocalChangeSetSummary | null
  writeClipboardText: (text: string) => Promise<void>
}>()
const emit = defineEmits<{ openArtifact: [id: string], openChanges: [id: string] }>()
const { t } = useBuddyI18n(() => props.language)
const interruptionLabel = computed(() => {
  const interruption = getChatMessageInterruption(props.message)
  return interruption ? t(interruption.truncated ? 'desktop.chat.messageInterruptedTruncated' : 'desktop.chat.messageInterrupted') : null
})
</script>

<template>
  <BuddyChatMessageContent
    class="buddy-chat-message__body" :final="final" :hidden-artifacts="turnOutputs?.artifacts ?? []"
    :language="language" :message="message" :write-clipboard-text="writeClipboardText"
  />
  <BuddyChatTurnOutputs v-if="turnOutputs?.artifacts.length" class="buddy-chat-message__outputs" :artifacts="turnOutputs.artifacts" :language="language" @open-artifact="emit('openArtifact', $event)" />
  <BuddyChatTurnChanges v-if="turnChanges" class="buddy-chat-message__changes" :change-set="turnChanges" :language="language" @open-changes="emit('openChanges', $event)" />
  <small v-if="interruptionLabel" class="buddy-chat-message__interruption" role="status">{{ interruptionLabel }}</small>
</template>

<style scoped>
.buddy-chat-message__interruption { max-width: min(42rem, 92%); color: var(--buddy-text-secondary); font-size: 0.75rem; line-height: 1.5; }
</style>
