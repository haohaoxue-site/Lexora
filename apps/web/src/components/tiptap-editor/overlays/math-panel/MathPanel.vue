<script setup lang="ts">
import type { MathPanelController } from './useMathPanel'
import { computed } from 'vue'
import { useMathPanelView } from './useMathPanelView'

interface MathPanelProps {
  controller: MathPanelController
}

const props = defineProps<MathPanelProps>()
const view = useMathPanelView(props.controller)
const inputType = computed(() => props.controller.mode.value === 'block' ? 'textarea' : 'text')
const inputRows = computed(() => props.controller.mode.value === 'block' ? 4 : undefined)
</script>

<template>
  <div
    v-if="controller.isOpen.value"
    class="tiptap-math-panel"
    @mousedown.stop
  >
    <ElInput
      :ref="view.assignInputRef"
      :model-value="controller.draftLatex.value"
      class="tiptap-math-panel__input"
      :type="inputType"
      :rows="inputRows"
      :autosize="controller.mode.value === 'block' ? { minRows: 3, maxRows: 8 } : false"
      placeholder="输入 LaTeX 公式"
      @keydown="view.handleInputKeydown"
      @update:model-value="controller.updateDraftLatex"
    />

    <div class="tiptap-math-panel__actions">
      <ElButton size="small" type="primary" @click="controller.apply">
        确认
      </ElButton>

      <ElButton size="small" @click="controller.remove">
        移除
      </ElButton>

      <ElButton size="small" @click="controller.cancel">
        取消
      </ElButton>
    </div>
  </div>
</template>
