<script setup lang="ts">
import type {
  ChatComposerSubmitControlsEmits,
  ChatComposerSubmitControlsProps,
} from './typing'
import { CloseBold } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ChatModelTrigger from './ChatModelTrigger.vue'

const props = defineProps<ChatComposerSubmitControlsProps>()
const emit = defineEmits<ChatComposerSubmitControlsEmits>()
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="chat-composer-toolbar__right">
    <ChatModelTrigger
      :selected-model-ref="props.selectedModelRef"
      :selection-kind="props.modelSelectionKind"
      :disabled="props.isStreaming"
      @select="emit('selectModel', $event)"
    />

    <ElTooltip :content="props.isStreaming ? t('chat.composer.stop') : t('chat.composer.send')" placement="top">
      <button
        v-if="props.isStreaming"
        class="chat-composer-toolbar__send-button is-stop"
        type="button"
        :aria-label="t('chat.composer.stop')"
        @click="emit('stop')"
      >
        <ElIcon><CloseBold /></ElIcon>
      </button>
      <button
        v-else
        class="chat-composer-toolbar__send-button"
        type="button"
        :disabled="props.disabled || !props.canSend"
        :aria-label="t('chat.composer.send')"
        @click="emit('send')"
      >
        <SvgIcon category="ui" icon="send-light" size="1rem" />
      </button>
    </ElTooltip>
  </div>
</template>
