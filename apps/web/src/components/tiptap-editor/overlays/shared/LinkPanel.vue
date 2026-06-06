<script setup lang="ts">
import type { LinkPanelController } from './useLinkPanel'
import { SvgIcon } from '@/components/svg-icon'
import { useLinkPanelView } from './useLinkPanelView'

interface LinkPanelProps {
  controller: LinkPanelController
}

const props = defineProps<LinkPanelProps>()
const view = useLinkPanelView(props.controller)
</script>

<template>
  <div
    v-if="controller.isOpen.value"
    class="tiptap-link-panel"
    :class="`tiptap-link-panel--${controller.mode.value}`"
    @mousedown.stop
  >
    <template v-if="controller.mode.value === 'existing-link'">
      <label class="tiptap-link-panel__field">
        <span class="tiptap-link-panel__label">页面或 URL</span>
        <ElInput
          :ref="view.assignPrimaryInputRef"
          :model-value="controller.linkUrl.value"
          class="tiptap-link-panel__url-input"
          placeholder="输入或粘贴链接..."
          @keydown="view.handleInputKeydown"
          @update:model-value="controller.updateLinkUrl"
        />
      </label>

      <label class="tiptap-link-panel__field">
        <span class="tiptap-link-panel__label">链接标题</span>
        <ElInput
          :ref="view.assignSecondaryInputRef"
          :model-value="controller.linkText.value"
          placeholder="输入链接文字..."
          @focus="controller.highlightLinkedText"
          @keydown="view.handleInputKeydown"
          @update:model-value="controller.updateLinkText"
        />
      </label>

      <button
        type="button"
        class="tiptap-link-panel__remove-row"
        @click="controller.remove"
      >
        <SvgIcon category="ui" icon="trash-can" size="1rem" />
        <span>移除链接</span>
      </button>
    </template>

    <template v-else>
      <ElInput
        v-if="controller.mode.value === 'empty-block'"
        :ref="view.assignPrimaryInputRef"
        :model-value="controller.linkText.value"
        placeholder="输入链接文字..."
        @keydown="view.handleInputKeydown"
        @update:model-value="controller.updateLinkText"
      />

      <ElInput
        :ref="controller.mode.value === 'selection'
          ? view.assignPrimaryInputRef
          : view.assignSecondaryInputRef"
        :model-value="controller.linkUrl.value"
        class="tiptap-link-panel__url-input"
        placeholder="输入或粘贴链接..."
        @keydown="view.handleInputKeydown"
        @update:model-value="controller.updateLinkUrl"
      />
    </template>

    <div
      v-if="controller.mode.value !== 'existing-link'"
      class="tiptap-link-panel__actions"
    >
      <ElButton
        size="small"
        type="primary"
        :disabled="controller.isConfirmDisabled.value"
        @click="controller.apply"
      >
        确认
      </ElButton>

      <ElButton
        v-if="controller.mode.value === 'selection' && controller.canRemove.value"
        size="small"
        @click="controller.remove"
      >
        移除
      </ElButton>

      <ElButton
        size="small"
        @click="controller.cancel"
      >
        取消
      </ElButton>
    </div>
  </div>
</template>
