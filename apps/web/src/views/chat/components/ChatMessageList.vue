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
import { useChatMessageList } from '../composables/useChatMessageList'

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
        <div class="chat-message-list__empty-icon" :class="emptyIconStateClass">
          <SvgIcon
            :category="emptyIcon.category"
            :icon="emptyIcon.icon"
            size="2.5rem"
            class="chat-message-list__empty-icon-image"
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
        class="chat-message-list__row"
        :class="getMessageRoleClass(msg.role)"
      >
        <div v-if="msg.role === 'assistant'" class="chat-message-list__assistant-avatar">
          <SvgIcon category="ai" icon="ai-spark" size="1rem" class="chat-message-list__assistant-avatar-icon" />
        </div>

        <div v-if="msg.role === 'assistant'" class="chat-message-list__assistant-content">
          <ChatAssistantMessage :message="msg" variant="global" />

          <div class="chat-message-list__actions assistant">
            <ElTooltip content="复制回复" placement="bottom">
              <ElButton
                text
                class="chat-message-list__copy-action"
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
                :icon="RefreshRight"
                :disabled="isStreaming"
                @click="retryAssistantMessage(msg)"
              />
            </ElTooltip>
            <div v-if="msg.branch.count > 1" class="chat-message-list__branch">
              <ElButton
                text
                :icon="ArrowLeft"
                :disabled="isStreaming || !msg.branch.previousMessageId"
                @click="switchToBranch(msg.branch.previousMessageId)"
              />
              <span>{{ msg.branch.index }} / {{ msg.branch.count }}</span>
              <ElButton
                text
                :icon="ArrowRight"
                :disabled="isStreaming || !msg.branch.nextMessageId"
                @click="switchToBranch(msg.branch.nextMessageId)"
              />
            </div>
          </div>
        </div>

        <div
          v-else
          class="chat-message-list__user-content"
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
            <div class="chat-message-list__edit-actions">
              <ElButton round @click="cancelEditMessage">
                取消
              </ElButton>
            </div>
          </div>

          <template v-else>
            <div class="chat-message-list__bubble user">
              <ChatUserMessageContent :message="msg" />
            </div>
            <div class="chat-message-list__actions user">
              <ElTooltip content="复制消息" placement="bottom">
                <ElButton
                  text
                  class="chat-message-list__copy-action"
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
                  :icon="EditPen"
                  :disabled="isStreaming"
                  @click="startEditMessage(msg)"
                />
              </ElTooltip>
              <div v-if="msg.branch.count > 1" class="chat-message-list__branch">
                <ElButton
                  text
                  :icon="ArrowLeft"
                  :disabled="isStreaming || !msg.branch.previousMessageId"
                  @click="switchToBranch(msg.branch.previousMessageId)"
                />
                <span>{{ msg.branch.index }} / {{ msg.branch.count }}</span>
                <ElButton
                  text
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4.5rem;
    height: 4.5rem;
    margin: 0 auto 1rem;
    border-radius: 1.5rem;

    &.configured {
      background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
    }

    &.idle {
      background: color-mix(in srgb, var(--brand-border-base) 18%, transparent);
    }
  }

  .chat-message-list__empty-icon-image {
    display: block;
  }

  .chat-message-list__default-model-link {
    color: currentColor;
    text-decoration-line: underline;
    text-underline-offset: 0.18em;

    &:hover {
      color: var(--brand-primary);
    }
  }

  .chat-message-list__row {
    display: flex;
    gap: 0.75rem;

    &.user {
      justify-content: flex-end;
    }

    &.assistant {
      justify-content: flex-start;
    }
  }

  .chat-message-list__assistant-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    margin-top: 0.25rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  }

  .chat-message-list__assistant-avatar-icon {
    display: block;
  }

  .chat-message-list__assistant-content {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    min-width: 0;
    max-width: 80%;
  }

  .chat-message-list__user-content {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    min-width: 0;
    max-width: 80%;

    &.is-editing {
      width: 100%;
      max-width: 100%;
    }
  }

  .chat-message-list__bubble {
    padding: 0.625rem 1rem;
    border-radius: 0.75rem;
    overflow-wrap: break-word;
    font-size: 0.875rem;
    line-height: 1.625;

    &.user {
      max-width: 100%;
      white-space: pre-wrap;
      color: #fff;
      background: var(--brand-primary);
    }
  }

  .chat-message-list__actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--brand-text-secondary);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-0.125rem);
    transition:
      opacity 160ms ease,
      transform 160ms ease;

    &.assistant {
      justify-content: flex-start;
    }

    &.user {
      justify-content: flex-end;
    }

    :deep(.el-button) {
      width: 1.75rem;
      height: 1.75rem;
      padding: 0;
      border-radius: 0.5rem;
      color: currentColor;
    }

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
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.125rem;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;

    span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2.375rem;
    }

    :deep(.el-button) {
      width: 1.125rem;
      height: 1.5rem;
      border-radius: 0.5rem;
    }
  }

  .chat-message-list__edit-box {
    width: 100%;
  }

  .chat-message-list__edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
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
  }
}
</style>
