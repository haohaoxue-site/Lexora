<script setup lang="ts">
import type { BubbleToolbarAction } from '../catalog/actionRegistry'
import { shallowRef } from 'vue'
import TiptapIcon from '../../icons/TiptapIcon.vue'
import BubbleDropdownShell from './BubbleDropdownShell.vue'

interface BubbleAiDropdownProps {
  description?: string
}

interface BubbleAiDropdownEmits {
  actionClick: [action: BubbleToolbarAction]
}

const props = defineProps<BubbleAiDropdownProps>()
const emits = defineEmits<BubbleAiDropdownEmits>()
const visible = shallowRef(false)

function setVisible(nextVisible: boolean) {
  visible.value = nextVisible
}

function handleAction(action: BubbleToolbarAction) {
  emits('actionClick', action)
  visible.value = false
}
</script>

<template>
  <BubbleDropdownShell
    :visible="visible"
    :width="176"
    popper-class="tiptap-bubble-ai-popover"
    :description="props.description"
    @update:visible="setVisible"
  >
    <template #trigger>
      <span class="tiptap-bubble-btn__text tiptap-bubble-ai-trigger">AI</span>
      <TiptapIcon icon="chevron-down" class="tiptap-bubble-btn__chevron" size="0.75rem" />
    </template>

    <div class="tiptap-bubble-ai-menu">
      <button
        type="button"
        class="tiptap-bubble-ai-menu__item"
        data-bubble-ai-action="add-selection-context"
        @mousedown.prevent
        @click="handleAction('add-selection-context')"
      >
        加入对话上下文
      </button>
      <button
        type="button"
        class="tiptap-bubble-ai-menu__item"
        data-bubble-ai-action="ai-rewrite"
        @mousedown.prevent
        @click="handleAction('ai-rewrite')"
      >
        AI 改写
      </button>
    </div>
  </BubbleDropdownShell>
</template>
