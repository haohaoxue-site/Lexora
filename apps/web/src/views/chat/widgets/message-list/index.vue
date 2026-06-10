<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ChatMessage } from '@/apis/chat'
import {
  ArrowLeft,
  ArrowRight,
  EditPen,
  RefreshRight,
} from '@element-plus/icons-vue'
import { computed, useTemplateRef } from 'vue'
import ChatAssistantAvatar from '@/components/chat-message/ChatAssistantAvatar.vue'
import ChatUserMessageContent from '@/components/chat-message/ChatUserMessageContent.vue'
import CopyStateIcon from '@/components/copy-state-icon/CopyStateIcon.vue'
import { useDynamicChatVirtualList } from '@/composables/chat/useDynamicChatVirtualList'
import { shouldShowAssistantPending } from '@/composables/chat/utils/chat-message-display'
import dayjs from '@/utils/dayjs'
import ChatMessageUsageAction from '../../components/message-usage-action'
import { useChatMessageList } from '../../composables/useChatMessageList'

interface ChatMessageDayDividerItem {
  kind: 'day-divider'
  id: string
  label: string
}

interface ChatMessageContentItem {
  kind: 'message'
  id: string
  message: ChatMessage
}

type ChatMessageListItem = ChatMessageDayDividerItem | ChatMessageContentItem

const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef')
const {
  assistantName,
  cancelEditMessage,
  composerModelSelectionKind,
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
  listKey,
  messages,
  retryAssistantMessage,
  selectComposerModel,
  startEditMessage,
  submitEditMessage,
  switchToBranch,
} = useChatMessageList()
const messageItems = computed<ChatMessageListItem[]>(() => createMessageListItems(messages.value))
const {
  handleScroll,
  setItemElement,
  spacerStyle,
  virtualItems,
} = useDynamicChatVirtualList({
  items: messageItems,
  listKey,
  scrollContainerRef,
  estimateSize: 132,
  overscan: 10,
  bottomThreshold: 96,
  getItemKey: item => item.id,
})

function setVirtualItemElement(key: string, element: Element | ComponentPublicInstance | null) {
  setItemElement(key, element instanceof Element ? element : null)
}

function createMessageListItems(sourceMessages: ChatMessage[]): ChatMessageListItem[] {
  const items: ChatMessageListItem[] = []
  let previousDayKey: string | null = null

  for (const message of sourceMessages) {
    const day = dayjs(message.createdAt)
    const dayKey = day.isValid() ? day.format('YYYY-MM-DD') : 'unknown'

    if (dayKey !== previousDayKey) {
      items.push({
        kind: 'day-divider',
        id: `day:${dayKey}`,
        label: formatDayDividerLabel(message.createdAt),
      })
      previousDayKey = dayKey
    }

    items.push({
      kind: 'message',
      id: `message:${message.id}`,
      message,
    })
  }

  return items
}

function formatDayDividerLabel(value: string): string {
  const time = dayjs(value)
  if (!time.isValid()) {
    return '较早'
  }

  const today = dayjs()
  if (time.isSame(today, 'day')) {
    return '今天'
  }

  if (time.isSame(today.subtract(1, 'day'), 'day')) {
    return '昨天'
  }

  if (time.isSame(today, 'year')) {
    return time.format('M月D日 dddd')
  }

  return time.format('YYYY年M月D日 dddd')
}

function formatMessageSentAt(value: string): string {
  const time = dayjs(value)
  if (!time.isValid()) {
    return ''
  }

  const today = dayjs()
  if (time.isSame(today, 'day')) {
    return time.format('HH:mm')
  }

  if (time.isSame(today.subtract(1, 'day'), 'day')) {
    return `昨天 ${time.format('HH:mm')}`
  }

  if (time.isSame(today, 'year')) {
    return time.format('M-D HH:mm')
  }

  return time.format('YYYY-M-D HH:mm')
}
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="chat-message-list flex-1 overflow-y-auto px-6 py-4"
    :data-message-count="messages.length"
    @scroll="handleScroll"
  >
    <div v-if="messages.length === 0" class="flex h-full items-center justify-center">
      <div class="text-center">
        <div class="chat-message-list__empty-icon mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl" :class="emptyIconStateClass">
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
          请先在右上角 Agent 设置选择默认模型，或检查服务商配置
        </div>
      </div>
    </div>

    <div v-else class="chat-message-list__virtual-shell mx-auto max-w-[var(--page-mode-chat-max-width)]">
      <div
        class="chat-message-list__virtual-space"
        :style="spacerStyle"
      >
        <div
          v-for="virtual in virtualItems"
          :key="virtual.key"
          :ref="element => setVirtualItemElement(virtual.key, element)"
          class="chat-message-list__virtual-item"
          :class="{ 'is-day-divider': virtual.item.kind === 'day-divider' }"
          :style="virtual.style"
        >
          <div v-if="virtual.item.kind === 'day-divider'" class="chat-message-list__day-divider">
            {{ virtual.item.label }}
          </div>

          <div
            v-else
            class="chat-message-list__row flex gap-3"
            :class="[getMessageRoleClass(virtual.item.message.role), virtual.item.message.role === 'user' ? 'justify-end' : 'justify-start']"
          >
            <div
              v-if="virtual.item.message.role === 'assistant'"
              class="mt-1 shrink-0"
            >
              <ChatAssistantAvatar :pending="shouldShowAssistantPending(virtual.item.message)" />
            </div>

            <div v-if="virtual.item.message.role === 'assistant'" class="chat-message-list__assistant-content flex min-w-0 max-w-[80%] flex-col gap-2">
              <div class="chat-message-list__meta assistant">
                <span class="chat-message-list__author">{{ assistantName }}</span>
                <span class="chat-message-list__ai-tag">AI</span>
                <span class="chat-message-list__sent-at">{{ formatMessageSentAt(virtual.item.message.createdAt) }}</span>
              </div>

              <ChatAssistantMessage :message="virtual.item.message" variant="global" :show-usage-summary="false" />

              <div class="chat-message-list__actions assistant flex items-center justify-start gap-1.5">
                <ElTooltip content="复制回复" placement="bottom">
                  <ElButton
                    text
                    class="chat-message-list__action-button chat-message-list__copy-action h-7 min-w-7 w-7 rounded-lg p-0"
                    :class="{ 'is-copied': isMessageCopied(virtual.item.message) }"
                    :disabled="!getMessageText(virtual.item.message)"
                    :aria-label="isMessageCopied(virtual.item.message) ? '回复已复制' : '复制回复'"
                    @click="copyMessage(virtual.item.message)"
                  >
                    <CopyStateIcon :copied="isMessageCopied(virtual.item.message)" />
                  </ElButton>
                </ElTooltip>
                <ElTooltip content="重试" placement="bottom">
                  <ElButton
                    text
                    class="chat-message-list__action-button h-7 min-w-7 w-7 rounded-lg p-0"
                    :icon="RefreshRight"
                    :disabled="isStreaming"
                    @click="retryAssistantMessage(virtual.item.message)"
                  />
                </ElTooltip>
                <div v-if="virtual.item.message.branch.count > 1" class="chat-message-list__branch ml-0.5 inline-flex items-center gap-0.5 rounded-md px-0.5 text-[0.8125rem] leading-none">
                  <ElButton
                    text
                    class="chat-message-list__branch-button h-4 min-w-4 w-4 rounded-md p-0"
                    :icon="ArrowLeft"
                    :disabled="isStreaming || !virtual.item.message.branch.previousMessageId"
                    @click="switchToBranch(virtual.item.message.branch.previousMessageId)"
                  />
                  <span class="inline-flex min-w-[2.25rem] items-center justify-center px-1">{{ virtual.item.message.branch.index }} / {{ virtual.item.message.branch.count }}</span>
                  <ElButton
                    text
                    class="chat-message-list__branch-button h-4 min-w-4 w-4 rounded-md p-0"
                    :icon="ArrowRight"
                    :disabled="isStreaming || !virtual.item.message.branch.nextMessageId"
                    @click="switchToBranch(virtual.item.message.branch.nextMessageId)"
                  />
                </div>
                <ChatMessageUsageAction :message="virtual.item.message" />
              </div>
            </div>

            <div
              v-else
              class="chat-message-list__user-content flex min-w-0 max-w-[80%] flex-col items-end gap-2"
              :class="{ 'is-editing': isEditingMessage(virtual.item.message) }"
            >
              <div class="chat-message-list__meta user">
                <span class="chat-message-list__sent-at">{{ formatMessageSentAt(virtual.item.message.createdAt) }}</span>
              </div>

              <div v-if="isEditingMessage(virtual.item.message)" class="chat-message-list__edit-box">
                <ChatComposer
                  :content-j-s-o-n="editingContentJSON"
                  :attachments="editingAttachments"
                  :selected-model-ref="composerSelectedModelRef"
                  :model-selection-kind="composerModelSelectionKind"
                  :disabled="isStreaming"
                  :highlight-attachment-id="editingHighlightAttachmentId"
                  document-picker-teleport-to=".chat-view__picker-layer"
                  @update:content-j-s-o-n="editingContentJSON = $event"
                  @update:attachments="editingAttachments = $event"
                  @send="submitEditMessage(virtual.item.message, $event)"
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
                <div class="chat-message-list__bubble user rounded-lg px-3 py-2 text-sm leading-[1.625] break-words">
                  <ChatUserMessageContent :message="virtual.item.message" />
                </div>
                <div class="chat-message-list__actions user flex items-center justify-end gap-1.5">
                  <ElTooltip content="复制消息" placement="bottom">
                    <ElButton
                      text
                      class="chat-message-list__action-button chat-message-list__copy-action h-7 min-w-7 w-7 rounded-lg p-0"
                      :class="{ 'is-copied': isMessageCopied(virtual.item.message) }"
                      :aria-label="isMessageCopied(virtual.item.message) ? '消息已复制' : '复制消息'"
                      @click="copyMessage(virtual.item.message)"
                    >
                      <CopyStateIcon :copied="isMessageCopied(virtual.item.message)" />
                    </ElButton>
                  </ElTooltip>
                  <ElTooltip content="编辑" placement="bottom">
                    <ElButton
                      text
                      class="chat-message-list__action-button h-7 min-w-7 w-7 rounded-lg p-0"
                      :icon="EditPen"
                      :disabled="isStreaming"
                      @click="startEditMessage(virtual.item.message)"
                    />
                  </ElTooltip>
                  <div v-if="virtual.item.message.branch.count > 1" class="chat-message-list__branch ml-0.5 inline-flex items-center gap-0.5 rounded-md px-0.5 text-[0.8125rem] leading-none">
                    <ElButton
                      text
                      class="chat-message-list__branch-button h-4 min-w-4 w-4 rounded-md p-0"
                      :icon="ArrowLeft"
                      :disabled="isStreaming || !virtual.item.message.branch.previousMessageId"
                      @click="switchToBranch(virtual.item.message.branch.previousMessageId)"
                    />
                    <span class="inline-flex min-w-[2.25rem] items-center justify-center px-1">{{ virtual.item.message.branch.index }} / {{ virtual.item.message.branch.count }}</span>
                    <ElButton
                      text
                      class="chat-message-list__branch-button h-4 min-w-4 w-4 rounded-md p-0"
                      :icon="ArrowRight"
                      :disabled="isStreaming || !virtual.item.message.branch.nextMessageId"
                      @click="switchToBranch(virtual.item.message.branch.nextMessageId)"
                    />
                  </div>
                  <ChatMessageUsageAction :message="virtual.item.message" />
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-message-list {
  overflow-anchor: none;

  .chat-message-list__empty-icon {
    &.configured {
      background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
    }

    &.idle {
      background: color-mix(in srgb, var(--brand-border-base) 18%, transparent);
    }
  }

  .chat-message-list__user-content {
    &.is-editing {
      width: 100%;
      max-width: 100%;
    }
  }

  .chat-message-list__virtual-item {
    box-sizing: border-box;
    padding-bottom: 1rem;

    &.is-day-divider {
      padding: 1.25rem 0 1rem;
    }
  }

  .chat-message-list__day-divider {
    text-align: center;
    color: var(--brand-text-tertiary);
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-variant-numeric: tabular-nums;
  }

  .chat-message-list__meta {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 1.25rem;
    color: var(--brand-text-tertiary);
    font-size: 0.8125rem;
    line-height: 1.25rem;
    font-variant-numeric: tabular-nums;

    &.user {
      justify-content: flex-end;
    }
  }

  .chat-message-list__author {
    color: var(--brand-text-secondary);
    font-weight: 500;
  }

  .chat-message-list__ai-tag {
    display: inline-flex;
    align-items: center;
    height: 1.125rem;
    border-radius: 999px;
    padding: 0 0.375rem;
    background: color-mix(in srgb, var(--brand-fill-light) 78%, transparent);
    color: var(--brand-text-secondary);
    font-size: 0.6875rem;
    line-height: 1;
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

  .chat-message-list__action-button {
    background: color-mix(in srgb, var(--brand-fill-light) 34%, transparent);
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

  .chat-message-list__branch-button {
    background: transparent;
    color: inherit;

    :deep(.el-icon) {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.625rem;
      line-height: 1;
    }
  }

  :deep(.el-button.is-text.chat-message-list__branch-button:not(.is-disabled):hover),
  :deep(.el-button.is-text.chat-message-list__branch-button:not(.is-disabled):focus-visible) {
    background-color: transparent;
    color: var(--brand-text-primary);
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
  }
}
</style>
