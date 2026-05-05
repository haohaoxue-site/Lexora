<script setup lang="ts">
import type { LinkPanelController } from './useLinkPanel'
import { useLinkPanelView } from './useLinkPanelView'

/** 链接面板属性。 */
interface LinkPanelProps {
  /** 面板控制器 */
  controller: LinkPanelController
}

const props = defineProps<LinkPanelProps>()
const view = useLinkPanelView(props.controller)
</script>

<template>
  <div
    v-if="controller.isOpen.value"
    class="tiptap-link-panel"
    @mousedown.stop
  >
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

    <div class="tiptap-link-panel__actions">
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
