<script setup lang="ts">
import type { LinkPreviewController } from './useLinkPreview'
import { useClipboard } from '@vueuse/core'
import CopyStateIcon from '@/components/copy-state-icon/CopyStateIcon.vue'
import { SvgIcon } from '@/components/svg-icon'
import { ElMessage } from '@/utils/element-plus'

interface LinkPreviewProps {
  controller: LinkPreviewController
}

const props = defineProps<LinkPreviewProps>()
const { copy, copied, isSupported } = useClipboard({
  legacy: true,
})

async function copyHref() {
  if (!props.controller.href.value) {
    return
  }

  if (!isSupported.value) {
    ElMessage.error('当前环境不支持复制')
    return
  }

  try {
    await copy(props.controller.href.value)
  }
  catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="controller.isOpen.value"
      :ref="controller.assignPreviewRef"
      class="tiptap-link-preview"
      :style="controller.style.value"
      @mouseenter="controller.handlePreviewMouseEnter"
      @mouseleave="controller.handlePreviewMouseLeave"
      @mousedown.stop
    >
      <div
        class="tiptap-link-preview__href"
        :title="controller.href.value"
      >
        <SvgIcon category="ui" icon="link" size="1rem" />
        <span>{{ controller.href.value }}</span>
      </div>

      <button
        type="button"
        class="tiptap-link-preview__icon-btn"
        aria-label="复制链接"
        @click="copyHref"
        @mousedown.prevent
      >
        <CopyStateIcon :copied="copied" size="1rem" />
      </button>

      <button
        type="button"
        class="tiptap-link-preview__edit-btn"
        @click="controller.edit"
        @mousedown.prevent
      >
        <SvgIcon category="ui" icon="edit" size="1rem" />
        <span>编辑</span>
      </button>
    </div>
  </Teleport>
</template>
