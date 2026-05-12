<script setup lang="ts">
import type { EditorAiComposerMode, EditorAiComposerStatus } from './typing'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import {
  EDITOR_AI_COMPOSER_BUSY_BY_STATUS,
  EDITOR_AI_COMPOSER_CLOSE_LABEL_BY_STATUS,
  EDITOR_AI_COMPOSER_MODE,
  EDITOR_AI_COMPOSER_PLACEHOLDER_BY_MODE,
  EDITOR_AI_COMPOSER_STATUS,
  EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_MODE,
  EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_STATUS,
} from './constants'

interface EditorAiComposerProps {
  visible: boolean
  mode: EditorAiComposerMode | null
  status: EditorAiComposerStatus
  prompt: string
  anchorStyle?: Record<string, string>
  previewText: string
  errorMessage: string
  canSubmit: boolean
  canAccept: boolean
  canReject: boolean
}

interface EditorAiComposerEmits {
  'update:prompt': [value: string]
  'submit': []
  'accept': []
  'reject': []
  'close': []
}

const props = defineProps<EditorAiComposerProps>()
const emits = defineEmits<EditorAiComposerEmits>()
const promptInputRef = useTemplateRef<{ focus: () => void }>('promptInputRef')

const currentMode = computed(() => props.mode ?? EDITOR_AI_COMPOSER_MODE.GENERATE)
const placeholder = computed(() => EDITOR_AI_COMPOSER_PLACEHOLDER_BY_MODE[currentMode.value])
const submitLabel = computed(() =>
  EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_STATUS[props.status]
  ?? EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_MODE[currentMode.value],
)
const closeLabel = computed(() => EDITOR_AI_COMPOSER_CLOSE_LABEL_BY_STATUS[props.status])
const isBusy = computed(() => EDITOR_AI_COMPOSER_BUSY_BY_STATUS[props.status])
const isResolving = computed(() => props.canAccept || props.canReject)
const canShowCloseAction = computed(() => props.canReject || !isResolving.value)
const acceptLabel = computed(() =>
  props.status === EDITOR_AI_COMPOSER_STATUS.ACCEPT_SYNC_FAILED ? '重试同步' : '接收',
)

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return
    }

    await nextTick()

    if (props.visible) {
      promptInputRef.value?.focus()
    }
  },
)

function handleClose() {
  if (props.canReject) {
    emits('reject')
    return
  }

  emits('close')
}
</script>

<template>
  <div
    v-if="props.visible"
    class="tiptap-ai-composer"
    :style="props.anchorStyle"
  >
    <ElInput
      ref="promptInputRef"
      :model-value="props.prompt"
      type="textarea"
      :rows="3"
      resize="none"
      :disabled="isBusy"
      :placeholder="placeholder"
      @update:model-value="emits('update:prompt', $event)"
      @keydown.ctrl.enter.prevent="emits('submit')"
      @keydown.meta.enter.prevent="emits('submit')"
    />

    <p v-if="props.errorMessage" class="tiptap-ai-composer__error">
      {{ props.errorMessage }}
    </p>

    <div class="tiptap-ai-composer__actions">
      <ElButton
        v-if="canShowCloseAction"
        size="small"
        :disabled="isBusy"
        @click="handleClose"
      >
        {{ closeLabel }}
      </ElButton>
      <ElButton
        v-if="props.canAccept"
        type="primary"
        size="small"
        :loading="isBusy"
        :disabled="!props.canAccept"
        @click="emits('accept')"
      >
        {{ acceptLabel }}
      </ElButton>
      <ElButton
        v-if="!isResolving"
        type="primary"
        size="small"
        :loading="isBusy"
        :disabled="!props.canSubmit"
        @click="emits('submit')"
      >
        {{ submitLabel }}
      </ElButton>
    </div>
  </div>
</template>
