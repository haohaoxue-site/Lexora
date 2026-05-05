<script setup lang="ts">
import { backgroundColorOptions, textColorOptions } from '../catalog/menuRegistry'

/**
 * 颜色面板属性。
 */
interface EditorColorPanelProps {
  /** 当前文字颜色 */
  textColor: string
  /** 当前背景颜色 */
  backgroundColor: string
  /** 是否展示返回按钮 */
  showBackButton?: boolean
}

/**
 * 颜色面板事件。
 */
interface EditorColorPanelEmits {
  back: []
  applyTextColor: [color: string]
  applyBackgroundColor: [color: string]
}

const props = withDefaults(defineProps<EditorColorPanelProps>(), {
  showBackButton: false,
})
const emits = defineEmits<EditorColorPanelEmits>()

function isActiveTextColor(color: string) {
  return color ? props.textColor === color : !props.textColor
}

function isActiveBackgroundColor(color: string) {
  return color ? props.backgroundColor === color : !props.backgroundColor
}

function resetAllColors() {
  emits('applyTextColor', '')
  emits('applyBackgroundColor', '')
}
</script>

<template>
  <div class="tiptap-color-picker">
    <button
      v-if="showBackButton"
      type="button"
      class="tiptap-color-picker__back"
      @mousedown.prevent
      @click="emits('back')"
    >
      返回
    </button>

    <div class="tiptap-color-picker__section-title">
      文字颜色
    </div>
    <div class="tiptap-color-picker__grid">
      <button
        v-for="item in textColorOptions"
        :key="`text-${item.className}`"
        class="tiptap-color-picker__swatch is-text"
        :class="{ 'is-active': isActiveTextColor(item.className), 'is-default': !item.className }"
        :title="item.label"
        type="button"
        @mousedown.prevent
        @click="emits('applyTextColor', item.className)"
      >
        <span class="tiptap-color-picker__swatch-preview">
          <span
            class="tiptap-color-picker__swatch-label"
            :class="item.className"
          >A</span>
        </span>
      </button>
    </div>

    <div class="tiptap-color-picker__section-title">
      背景颜色
    </div>
    <div class="tiptap-color-picker__grid">
      <button
        v-for="item in backgroundColorOptions"
        :key="`bg-${item.className}`"
        class="tiptap-color-picker__swatch"
        :class="[
          { 'is-active': isActiveBackgroundColor(item.className), 'is-default': !item.className },
          item.className,
        ]"
        :title="item.label"
        type="button"
        @mousedown.prevent
        @click="emits('applyBackgroundColor', item.className)"
      >
        <span class="tiptap-color-picker__swatch-preview">
          <span class="tiptap-color-picker__swatch-label">A</span>
        </span>
      </button>
    </div>

    <div class="tiptap-color-picker__footer">
      <button
        class="tiptap-color-picker__reset"
        type="button"
        @mousedown.prevent
        @click="resetAllColors"
      >
        全部重置
      </button>
    </div>
  </div>
</template>
