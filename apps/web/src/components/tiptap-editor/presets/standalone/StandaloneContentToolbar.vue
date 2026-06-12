<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { TiptapEditorUploadedImage } from '../../content/typing'
import type { InlineMarkAction } from '../../overlays/catalog/actionRegistry'
import { RefreshLeft, RefreshRight } from '@element-plus/icons-vue'
import { computed, shallowRef } from 'vue'
import TiptapIcon from '../../icons/TiptapIcon.vue'
import AlignDropdown from '../../overlays/bubble-toolbar/AlignDropdown.vue'
import BubbleToolbarButton from '../../overlays/bubble-toolbar/BubbleToolbarButton.vue'
import ColorPickerDropdown from '../../overlays/bubble-toolbar/ColorPickerDropdown.vue'
import TurnIntoDropdown from '../../overlays/bubble-toolbar/TurnIntoDropdown.vue'
import { createMenuActionRegistry } from '../../overlays/catalog/actionRegistry'
import LinkPanel from '../../overlays/shared/LinkPanel.vue'
import { useEditorSnapshot } from '../../overlays/shared/useEditorSnapshot'
import { useLinkPanel } from '../../overlays/shared/useLinkPanel'
import StandaloneContentListDropdown from './StandaloneContentListDropdown.vue'

interface StandaloneContentToolbarProps {
  editor: Editor
  canUploadImage?: boolean
  uploadImage?: (file: File) => Promise<TiptapEditorUploadedImage>
}

type InlineToolbarItem = {
  action: InlineMarkAction
  description: string
} & ({
  kind: 'text'
  value: string
  className: string
} | {
  kind: 'icon'
  icon: string
})

const props = withDefaults(defineProps<StandaloneContentToolbarProps>(), {
  canUploadImage: false,
  uploadImage: undefined,
})
const editor = props.editor
const imageInputRef = shallowRef<HTMLInputElement | null>(null)
const editorSnapshot = useEditorSnapshot(editor, {
  ignoreCollaborationOrigin: true,
})
const linkPanel = useLinkPanel(() => editor)
const actionRegistry = createMenuActionRegistry({
  editor,
  linkPanel,
  imageInputRef,
  uploadImage: props.uploadImage,
})
const inlineItems = [
  {
    action: 'bold',
    description: '加粗',
    kind: 'text',
    value: 'B',
    className: 'font-bold text-sm',
  },
  {
    action: 'italic',
    description: '斜体',
    kind: 'text',
    value: 'I',
    className: 'text-sm italic',
  },
  {
    action: 'strike',
    description: '删除线',
    kind: 'text',
    value: 'S',
    className: 'text-sm line-through',
  },
  {
    action: 'code',
    description: '代码',
    kind: 'icon',
    icon: 'code',
  },
  {
    action: 'underline',
    description: '下划线',
    kind: 'text',
    value: 'U',
    className: 'text-sm underline',
  },
] as const satisfies readonly InlineToolbarItem[]
const toolbarState = computed(() => {
  void editorSnapshot.value

  return {
    canRedo: editor.can().redo(),
    canUndo: editor.can().undo(),
    canUploadImage: Boolean(props.canUploadImage && props.uploadImage),
    isLinkActive: actionRegistry.bubble.isActive('link') || linkPanel.isOpen.value,
    marks: Object.fromEntries(
      inlineItems.map(item => [
        item.action,
        {
          active: actionRegistry.bubble.isActive(item.action),
          disabled: actionRegistry.bubble.isDisabled(item.action),
        },
      ]),
    ) as Record<InlineMarkAction, { active: boolean, disabled: boolean }>,
  }
})
const linkPopoverVisible = computed({
  get: () => linkPanel.isOpen.value,
  set: (visible) => {
    if (visible) {
      openLinkPanel()
      return
    }

    linkPanel.dismiss()
  },
})

function undo() {
  editor.chain().focus().undo().run()
}

function redo() {
  editor.chain().focus().redo().run()
}

function handleInlineAction(action: InlineMarkAction) {
  actionRegistry.bubble.execute(action)
}

function openLinkPanel() {
  if (editor.state.selection.empty) {
    linkPanel.openEmptyBlock()
    return
  }

  linkPanel.openSelection()
}

function insertImage() {
  if (!toolbarState.value.canUploadImage) {
    return
  }

  actionRegistry.quickInsert.execute('insert-image')
}

function handleImageInputChange(event: Event) {
  void actionRegistry.uploads.handleFileInsert(event, 'image')
}
</script>

<template>
  <div class="standalone-content-editor__toolbar tiptap-fixed-toolbar" role="toolbar" aria-label="正文工具栏">
    <div class="tiptap-fixed-toolbar__group">
      <BubbleToolbarButton
        description="撤销"
        aria-label="撤销"
        :disabled="!toolbarState.canUndo"
        @mousedown.prevent
        @click="undo"
      >
        <RefreshLeft class="tiptap-fixed-toolbar__el-icon" />
      </BubbleToolbarButton>
      <BubbleToolbarButton
        description="重做"
        aria-label="重做"
        :disabled="!toolbarState.canRedo"
        @mousedown.prevent
        @click="redo"
      >
        <RefreshRight class="tiptap-fixed-toolbar__el-icon" />
      </BubbleToolbarButton>
    </div>

    <div class="tiptap-fixed-toolbar__group">
      <TurnIntoDropdown :editor="editor" description="文本样式" />
      <StandaloneContentListDropdown :editor="editor" description="列表" />
    </div>

    <div class="tiptap-fixed-toolbar__group">
      <BubbleToolbarButton
        v-for="item in inlineItems"
        :key="item.action"
        :description="item.description"
        :aria-label="item.description"
        :active="toolbarState.marks[item.action].active"
        :disabled="toolbarState.marks[item.action].disabled"
        :data-toolbar-action="item.action"
        @mousedown.prevent
        @click="handleInlineAction(item.action)"
      >
        <span
          v-if="item.kind === 'text'"
          class="tiptap-bubble-btn__text"
          :class="item.className"
        >
          {{ item.value }}
        </span>
        <TiptapIcon
          v-else
          :icon="item.icon"
          class="tiptap-bubble-btn__icon"
        />
      </BubbleToolbarButton>
    </div>

    <div class="tiptap-fixed-toolbar__group">
      <ColorPickerDropdown :editor="editor" description="颜色" />
      <ElPopover
        v-model:visible="linkPopoverVisible"
        trigger="click"
        placement="bottom-start"
        :offset="6"
        :show-arrow="false"
        :width="288"
        popper-class="tiptap-fixed-toolbar-link-popover"
      >
        <template #reference>
          <BubbleToolbarButton
            description="链接"
            aria-label="链接"
            :active="toolbarState.isLinkActive"
            @mousedown.prevent
          >
            <TiptapIcon icon="link" class="tiptap-bubble-btn__icon" />
          </BubbleToolbarButton>
        </template>

        <LinkPanel :controller="linkPanel" />
      </ElPopover>
    </div>

    <div class="tiptap-fixed-toolbar__group">
      <AlignDropdown :editor="editor" description="对齐和缩进" />
      <BubbleToolbarButton
        v-if="toolbarState.canUploadImage"
        description="图片"
        aria-label="图片"
        @mousedown.prevent
        @click="insertImage"
      >
        <TiptapIcon icon="image" class="tiptap-bubble-btn__icon" />
      </BubbleToolbarButton>
      <input
        v-if="toolbarState.canUploadImage"
        ref="imageInputRef"
        class="tiptap-fixed-toolbar__hidden-input"
        type="file"
        accept="image/*"
        tabindex="-1"
        @change="handleImageInputChange"
      >
    </div>
  </div>
</template>
