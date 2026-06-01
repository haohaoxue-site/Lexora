<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  EditPen,
  RefreshRight,
} from '@element-plus/icons-vue'
import { useTemplateRef } from 'vue'
import ChatUserMessageContent from '@/components/chat-message/ChatUserMessageContent.vue'
import CopyStateIcon from '@/components/copy-state-icon/CopyStateIcon.vue'
import { shouldShowAssistantPending } from '@/composables/chat/utils/chat-message-display'
import { useChatMessageList } from '../../composables/useChatMessageList'

const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef')
const {
  cancelEditMessage,
  composerSelectedModelRef,
  copyMessage,
  editingAttachments,
  editingContentJSON,
  editingHighlightAttachmentId,
  emptyIcon,
  emptyIconStateClass,
  getMessageRoleClass,
  getMessageText,
  handleEditPlaceholderCommand,
  handleEditPlaceholderUpload,
  highlightEditingAttachment,
  isEditingMessage,
  isMessageCopied,
  isConfigured,
  isStreaming,
  messages,
  retryAssistantMessage,
  selectComposerModel,
  startEditMessage,
  submitEditMessage,
  switchToBranch,
} = useChatMessageList({
  scrollContainerRef,
})
</script>

<template>
  <div ref="scrollContainerRef" class="chat-message-list flex-1 overflow-y-auto px-6 py-4">
    <div v-if="messages.length === 0" class="flex h-full items-center justify-center">
      <div class="text-center">
        <div class="chat-message-list__empty-icon mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-3xl" :class="emptyIconStateClass">
          <SvgIcon
            :category="emptyIcon.category"
            :icon="emptyIcon.icon"
            size="2.5rem"
            class="block"
          />
        </div>
        <div class="text-lg text-secondary">
          {{ isConfigured ? '有什么可以帮助你的？' : '还不能开始对话' }}
        </div>
        <div v-if="isConfigured" class="mt-1 text-sm text-secondary-a60">
          输入消息开始对话
        </div>
        <div v-else class="mt-1 text-sm text-secondary-a60">
          请先
          <RouterLink to="/settings/models-default" class="chat-message-list__default-model-link">
            选择模型
          </RouterLink>
          ，或等待 AI 服务准备完成
        </div>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl space-y-4">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="chat-message-list__row flex gap-3"
        :class="[getMessageRoleClass(msg.role), msg.role === 'user' ? 'justify-end' : 'justify-start']"
      >
        <div
          v-if="msg.role === 'assistant'"
          class="chat-message-list__assistant-avatar mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          :class="{ 'is-thinking': shouldShowAssistantPending(msg) }"
        >
          <SvgIcon category="ai" icon="ai-spark" size="1rem" class="relative z-1 block" />
        </div>

        <div v-if="msg.role === 'assistant'" class="chat-message-list__assistant-content flex min-w-0 max-w-[80%] flex-col gap-2.5">
          <ChatAssistantMessage :message="msg" variant="global" />

          <div class="chat-message-list__actions assistant flex items-center justify-start gap-1">
            <ElTooltip content="复制回复" placement="bottom">
              <ElButton
                text
                class="chat-message-list__copy-action h-7 min-w-7 w-7 rounded-lg p-0"
                :class="{ 'is-copied': isMessageCopied(msg) }"
                :disabled="!getMessageText(msg)"
                :aria-label="isMessageCopied(msg) ? '回复已复制' : '复制回复'"
                @click="copyMessage(msg)"
              >
                <CopyStateIcon :copied="isMessageCopied(msg)" />
              </ElButton>
            </ElTooltip>
            <ElTooltip content="重试" placement="bottom">
              <ElButton
                text
                class="h-7 min-w-7 w-7 rounded-lg p-0"
                :icon="RefreshRight"
                :disabled="isStreaming"
                @click="retryAssistantMessage(msg)"
              />
            </ElTooltip>
            <div v-if="msg.branch.count > 1" class="chat-message-list__branch ml-0.5 inline-flex items-center gap-1 text-[0.8125rem] leading-none">
              <ElButton
                text
                class="h-6 min-w-[1.125rem] w-[1.125rem] rounded-lg p-0"
                :icon="ArrowLeft"
                :disabled="isStreaming || !msg.branch.previousMessageId"
                @click="switchToBranch(msg.branch.previousMessageId)"
              />
              <span class="inline-flex min-w-[2.375rem] items-center justify-center">{{ msg.branch.index }} / {{ msg.branch.count }}</span>
              <ElButton
                text
                class="h-6 min-w-[1.125rem] w-[1.125rem] rounded-lg p-0"
                :icon="ArrowRight"
                :disabled="isStreaming || !msg.branch.nextMessageId"
                @click="switchToBranch(msg.branch.nextMessageId)"
              />
            </div>
          </div>
        </div>

        <div
          v-else
          class="chat-message-list__user-content flex min-w-0 max-w-[80%] flex-col items-end gap-2"
          :class="{ 'is-editing': isEditingMessage(msg) }"
        >
          <div v-if="isEditingMessage(msg)" class="chat-message-list__edit-box">
            <ChatComposer
              :content-j-s-o-n="editingContentJSON"
              :attachments="editingAttachments"
              :selected-model-ref="composerSelectedModelRef"
              :disabled="isStreaming"
              :highlight-attachment-id="editingHighlightAttachmentId"
              document-picker-teleport-to=".chat-view__picker-layer"
              @update:content-j-s-o-n="editingContentJSON = $event"
              @update:attachments="editingAttachments = $event"
              @send="submitEditMessage(msg, $event)"
              @select-model="selectComposerModel"
              @highlight-attachment="highlightEditingAttachment"
              @placeholder-upload="handleEditPlaceholderUpload"
              @placeholder-command="handleEditPlaceholderCommand"
            />
            <div class="chat-message-list__edit-actions mt-3 flex justify-end gap-2">
              <ElButton round @click="cancelEditMessage">
                取消
              </ElButton>
            </div>
          </div>

          <template v-else>
            <div class="chat-message-list__bubble user rounded-xl px-4 py-2.5 text-sm leading-[1.625] break-words">
              <ChatUserMessageContent :message="msg" />
            </div>
            <div class="chat-message-list__actions user flex items-center justify-end gap-1">
              <ElTooltip content="复制消息" placement="bottom">
                <ElButton
                  text
                  class="chat-message-list__copy-action h-7 min-w-7 w-7 rounded-lg p-0"
                  :class="{ 'is-copied': isMessageCopied(msg) }"
                  :aria-label="isMessageCopied(msg) ? '消息已复制' : '复制消息'"
                  @click="copyMessage(msg)"
                >
                  <CopyStateIcon :copied="isMessageCopied(msg)" />
                </ElButton>
              </ElTooltip>
              <ElTooltip content="编辑" placement="bottom">
                <ElButton
                  text
                  class="h-7 min-w-7 w-7 rounded-lg p-0"
                  :icon="EditPen"
                  :disabled="isStreaming"
                  @click="startEditMessage(msg)"
                />
              </ElTooltip>
              <div v-if="msg.branch.count > 1" class="chat-message-list__branch ml-0.5 inline-flex items-center gap-1 text-[0.8125rem] leading-none">
                <ElButton
                  text
                  class="h-6 min-w-[1.125rem] w-[1.125rem] rounded-lg p-0"
                  :icon="ArrowLeft"
                  :disabled="isStreaming || !msg.branch.previousMessageId"
                  @click="switchToBranch(msg.branch.previousMessageId)"
                />
                <span class="inline-flex min-w-[2.375rem] items-center justify-center">{{ msg.branch.index }} / {{ msg.branch.count }}</span>
                <ElButton
                  text
                  class="h-6 min-w-[1.125rem] w-[1.125rem] rounded-lg p-0"
                  :icon="ArrowRight"
                  :disabled="isStreaming || !msg.branch.nextMessageId"
                  @click="switchToBranch(msg.branch.nextMessageId)"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-message-list {
  .chat-message-list__empty-icon {
    &.configured {
      background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
    }

    &.idle {
      background: color-mix(in srgb, var(--brand-border-base) 18%, transparent);
    }
  }

  .chat-message-list__default-model-link {
    color: currentColor;
    text-decoration-line: underline;
    text-underline-offset: 0.18em;

    &:hover {
      color: var(--brand-primary);
    }
  }

  .chat-message-list__assistant-avatar {
    position: relative;
    background: color-mix(in srgb, var(--brand-primary) 10%, transparent);

    &::after {
      position: absolute;
      inset: -0.25rem;
      border-radius: inherit;
      background:
        radial-gradient(
          circle,
          color-mix(in srgb, var(--brand-primary) 18%, transparent) 0%,
          color-mix(in srgb, var(--brand-warning) 10%, transparent) 58%,
          transparent 72%
        );
      content: '';
      opacity: 0;
      transform: scale(0.78);
      transition:
        opacity 180ms ease,
        transform 180ms ease;
    }

    &.is-thinking {
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-primary) 12%, transparent);

      &::after {
        opacity: 1;
        animation: chat-message-list-avatar-halo 1.8s ease-in-out infinite;
      }
    }
  }

  .chat-message-list__user-content {
    &.is-editing {
      width: 100%;
      max-width: 100%;
    }
  }

  .chat-message-list__bubble {
    overflow-wrap: break-word;

    &.user {
      max-width: 100%;
      white-space: pre-wrap;
      color: #fff;
      background: var(--brand-primary);
    }
  }

  .chat-message-list__actions {
    color: var(--brand-text-secondary);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-0.125rem);
    transition:
      opacity 160ms ease,
      transform 160ms ease;

    :deep(.el-button.is-text:not(.is-disabled):hover),
    :deep(.el-button.is-text:not(.is-disabled):focus-visible) {
      color: var(--brand-text-primary);
      background-color: color-mix(in srgb, var(--brand-fill-light) 72%, transparent);
    }

    :deep(.el-button.is-text:not(.is-disabled):active) {
      background-color: color-mix(in srgb, var(--brand-fill-light) 92%, transparent);
    }
  }

  .chat-message-list__copy-action {
    transition:
      color 0.16s ease,
      transform 0.16s ease;

    &.is-copied {
      color: var(--brand-success);
      transform: translateY(-0.0625rem);
    }
  }

  .chat-message-list__assistant-content:hover > .chat-message-list__actions,
  .chat-message-list__assistant-content:focus-within > .chat-message-list__actions,
  .chat-message-list__user-content:hover .chat-message-list__actions,
  .chat-message-list__user-content:focus-within .chat-message-list__actions {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .chat-message-list__branch {
    color: var(--brand-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .chat-message-list__edit-box {
    width: 100%;
  }

}

@media (hover: none) {
  .chat-message-list {
    .chat-message-list__actions {
      opacity: 1;
      pointer-events: auto;
      transform: none;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-list {
    .chat-message-list__actions {
      transition: none;
    }

    .chat-message-list__assistant-avatar.is-thinking::after {
      animation: none;
      transform: scale(1);
    }
  }
}

@keyframes chat-message-list-avatar-halo {
  0%,
  100% {
    opacity: 0.52;
    transform: scale(0.82);
  }

  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}
</style>
