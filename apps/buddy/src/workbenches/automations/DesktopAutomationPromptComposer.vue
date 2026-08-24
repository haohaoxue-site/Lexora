<script setup lang="ts">
import type {
  LocalProvider,
  LocalRuntimeModelOption,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyThinkingLevel } from '@buddy-shared/modelSelection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { useThemeVars } from 'naive-ui'
import { computed, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopModelSelector from '@/ui/model-selector/DesktopModelSelector.vue'
import { createChatComposerContentFromText } from '@/workbenches/chat/composer/chatComposerInput'
import DesktopChatComposerFrame from '@/workbenches/chat/composer/DesktopChatComposerFrame.vue'
import DesktopExecutionProfileSelector from '@/workbenches/chat/composer/DesktopExecutionProfileSelector.vue'

const props = defineProps<{
  executionProfile: BuddyExecutionProfile
  language: BuddyLocale
  models: ReadonlyArray<LocalRuntimeModelOption>
  prompt: string
  providers: ReadonlyArray<LocalProvider>
  selectedEffort: BuddyThinkingLevel | null
  selectedModelId: string | null
}>()

const emit = defineEmits<{
  updateEffort: [value: BuddyThinkingLevel | null]
  updateExecutionProfile: [value: BuddyExecutionProfile]
  updateModel: [value: string | null]
  updatePrompt: [value: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const themeVars = useThemeVars()
const availableModels = computed(() => props.models.filter(model => model.available && model.enabled))
const selectedModel = computed(() => availableModels.value.find(
  model => modelKey(model) === props.selectedModelId,
) ?? null)
let hydrating = false

const editor = useEditor({
  content: createChatComposerContentFromText(props.prompt),
  extensions: [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      orderedList: false,
      strike: false,
    }),
  ],
  editorProps: {
    attributes: {
      'aria-label': t('desktop.automations.editor.prompt'),
      'class': 'desktop-chat-composer__prosemirror',
    },
  },
  onUpdate: ({ editor }) => {
    if (!hydrating)
      emit('updatePrompt', editor.getText({ blockSeparator: '\n' }))
  },
})

watch(
  () => props.prompt,
  (prompt) => {
    if (prompt === editor.value?.getText({ blockSeparator: '\n' }))
      return
    hydrating = true
    editor.value?.commands.setContent(createChatComposerContentFromText(prompt), { emitUpdate: false })
    hydrating = false
  },
)

function modelKey(model: Pick<LocalRuntimeModelOption, 'modelId' | 'providerId'>): string {
  return `${model.providerId}:${model.modelId}`
}
</script>

<template>
  <DesktopChatComposerFrame
    class="desktop-automation-prompt-composer"
    :border-radius="themeVars.borderRadius"
    expanded
  >
    <template #editor>
      <EditorContent v-if="editor" :editor="editor" />
    </template>

    <template #leading>
      <DesktopExecutionProfileSelector
        can-update
        :execution-profile="executionProfile"
        :is-updating="false"
        :language="language"
        @update-execution-profile="emit('updateExecutionProfile', $event)"
      />
    </template>

    <template #actions>
      <DesktopModelSelector
        clearable
        :disabled="false"
        :language="language"
        :models="availableModels"
        :placeholder="t('desktop.automations.editor.defaultModel')"
        :providers="providers"
        :selected-effort="selectedEffort"
        :selected-model="selectedModel"
        :selected-model-id="selectedModelId"
        :selected-service-tier="null"
        :show-fast-mode="false"
        @clear-model="emit('updateModel', null)"
        @update-effort="emit('updateEffort', $event)"
        @update-model="emit('updateModel', $event)"
      />
    </template>
  </DesktopChatComposerFrame>
</template>

<style scoped lang="scss">
.desktop-automation-prompt-composer {
  :deep(.desktop-chat-composer) {
    background: var(--buddy-bg-surface-raised);
  }
}
</style>
