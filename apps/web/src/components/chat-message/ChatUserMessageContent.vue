<script setup lang="ts">
import type { ChatUserMessageContentProps } from './typing'
import { AGENT_TRANSLATOR_SKILL_KEY } from '@haohaoxue/lexora-contracts/agent'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getAttachmentDisplayLabel,
  getPanelAttachments,
} from '@/components/chat-composer/attachmentOrdering'
import { serializeChatComposerContent } from '@/components/chat-composer/serialization'

const props = defineProps<ChatUserMessageContentProps>()

const { t } = useI18n({ useScope: 'global' })
const panelAttachments = computed(() => getPanelAttachments(props.message.metadata.attachments))
const bodyText = computed(() => serializeChatComposerContent(props.message.metadata.contentJSON).content || props.message.content)
const translatorSkillLabel = computed(() => {
  const skillInvocation = props.message.metadata.skillInvocation
  if (skillInvocation?.skillKey !== AGENT_TRANSLATOR_SKILL_KEY) {
    return ''
  }

  return t('chat.messageDisplay.translateTo', { language: skillInvocation.targetLanguage.name })
})
</script>

<template>
  <div class="chat-user-message-content">
    <div v-if="translatorSkillLabel" class="chat-user-message-content__skills">
      <span class="chat-user-message-content__skill">
        {{ translatorSkillLabel }}
      </span>
    </div>

    <div v-if="panelAttachments.length" class="chat-user-message-content__contexts">
      <span
        v-for="attachment in panelAttachments"
        :key="attachment.id"
        class="chat-user-message-content__context"
        :title="getAttachmentDisplayLabel(attachment)"
      >
        {{ getAttachmentDisplayLabel(attachment) }}
      </span>
    </div>
    <div class="chat-user-message-content__body">
      {{ bodyText }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-user-message-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;

  .chat-user-message-content__contexts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.125rem;
  }

  .chat-user-message-content__skills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.125rem;
  }

  .chat-user-message-content__skill,
  .chat-user-message-content__context {
    max-width: 11rem;
    overflow: hidden;
    padding: 0.125rem 0.375rem;
    border: 1px solid color-mix(in srgb, #fff 24%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, #fff 10%, transparent);
    color: color-mix(in srgb, #fff 84%, transparent);
    font-size: 0.75rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-user-message-content__skill {
    border-color: color-mix(in srgb, #fff 34%, transparent);
    background: color-mix(in srgb, #fff 16%, transparent);
  }

  .chat-user-message-content__body {
    line-height: 1.6;
    white-space: pre-wrap;
  }
}
</style>
