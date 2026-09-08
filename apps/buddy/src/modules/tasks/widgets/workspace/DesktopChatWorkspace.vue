<script setup lang="ts">
import type { BuddyChatMessageListHandle } from '../transcript/chatMessageViewport'
import type { ChatWorkspaceEmits, ChatWorkspaceProps } from './typing'
import { useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopChatTranscript from '../transcript/DesktopChatTranscript.vue'
import DesktopChatWelcome from '../welcome/DesktopChatWelcome.vue'
import DesktopTaskComposer from './DesktopTaskComposer.vue'
import DesktopTaskNotices from './DesktopTaskNotices.vue'
import { useChatWorkspace } from './useChatWorkspace'

const props = defineProps<ChatWorkspaceProps>()
const emit = defineEmits<ChatWorkspaceEmits>()
defineSlots<{
  composerLeadingContext?: () => unknown
}>()
const { t } = useBuddyI18n(() => props.workspace.language.value)
const messageList = useTemplateRef<BuddyChatMessageListHandle>('messageList')
const { isEmpty, isLoading, language, transcriptBindings, viewport, welcomeVariant } = useChatWorkspace(props, messageList)
</script>

<template>
  <section class="desktop-chat-page" :class="{ 'is-empty': isEmpty }">
    <main class="desktop-chat-page__content">
      <DesktopChatWelcome
        v-if="isEmpty"
        :language="language"
        :variant="welcomeVariant"
      />

      <div v-else-if="isLoading || !transcriptBindings" class="desktop-chat-page__loading">
        {{ t('desktop.chat.loading') }}
      </div>

      <DesktopChatTranscript
        v-else
        ref="messageList"
        v-bind="transcriptBindings"
        class="desktop-chat-page__messages"
        @activate-branch="workspace.transcript.activateBranch"
        @content-resize="viewport.handleContentResize"
        @edit-user-message="workspace.execution.editUserMessage"
        @open-artifact="emit('openArtifact', $event)"
        @open-changes="emit('openChanges', $event)"
        @reader-layout-intent="viewport.handleReaderLayoutIntent"
        @regenerate-assistant="workspace.execution.regenerateAssistant"
        @return-to-latest="viewport.returnToLatest"
        @select-outline-message="viewport.revealOutlineMessage"
        @scroll="viewport.handleScroll"
      />
    </main>

    <footer class="desktop-chat-page__composer-dock">
      <div class="desktop-chat-page__composer-stack">
        <DesktopTaskNotices
          :execution="workspace.execution"
          :language="language"
          :restoration="workspace.restoration"
          :status="workspace.status"
          @open-settings="emit('openSettings', $event)"
        />
        <DesktopTaskComposer
          :composer="workspace.composer"
          :execution="workspace.execution"
          :language="language"
        >
          <template #leadingContext>
            <slot name="composerLeadingContext" />
          </template>
        </DesktopTaskComposer>
      </div>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-page {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--buddy-surface-base);
  container: desktop-chat-page / inline-size;
}

.desktop-chat-page__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.desktop-chat-page.is-empty {
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  padding-block: 1.5rem;

  .desktop-chat-page__content {
    flex: none;
    overflow: visible;
  }

  .desktop-chat-page__composer-dock {
    padding-top: 3rem;
    padding-bottom: 0;
  }
}

.desktop-chat-page__loading {
  display: grid;
  flex: 1;
  place-items: center;
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}

.desktop-chat-page__messages {
  min-height: 0;
  flex: 1;
}

.desktop-chat-page__composer-dock {
  position: relative;
  z-index: 2;
  flex: none;
  background: var(--buddy-surface-base);
  padding: 0 var(--buddy-chat-inline-gutter) 1rem;
}

.desktop-chat-page__composer-stack {
  display: grid;
  width: min(100%, var(--buddy-chat-reading-width));
  gap: 0.55rem;
  margin: 0 auto;
}
</style>
