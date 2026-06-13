<script setup lang="ts">
import type { AgentTranslatorTargetLanguage } from '@haohaoxue/lexora-contracts/agent'
import type { DropdownInstance, InputInstance } from 'element-plus'
import type { ChatComposerModelRef, ChatComposerModelSelectionKind } from './typing'
import { ArrowDown, Check, CloseBold } from '@element-plus/icons-vue'
import { AGENT_TRANSLATOR_PRESET_TARGET_LANGUAGES } from '@haohaoxue/lexora-contracts/agent'
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatModelTrigger from './ChatModelTrigger.vue'

const props = defineProps<{
  selectedModelRef?: ChatComposerModelRef | null
  modelSelectionKind?: ChatComposerModelSelectionKind
  isStreaming?: boolean
  disabled?: boolean
  canSend?: boolean
  translatorSkillEnabled?: boolean
  translatorTargetLanguage?: AgentTranslatorTargetLanguage | null
  skillCommandOpenSignal?: number
}>()

const emits = defineEmits<{
  'openPanelPicker': []
  'placeholderUpload': []
  'update:translatorTargetLanguage': [targetLanguage: AgentTranslatorTargetLanguage | null]
  'selectModel': [modelRef: ChatComposerModelRef | null]
  'send': []
  'stop': []
}>()
const { t } = useI18n({ useScope: 'global' })

const SKILL_TRANSLATOR_COMMAND = 'translator'
const TRANSLATOR_CUSTOM_LANGUAGE_COMMAND = '__custom__'
const skillCommandDropdownRef = shallowRef<DropdownInstance>()
const customLanguageInputRef = shallowRef<InputInstance>()
const customLanguageEditing = shallowRef(false)
const customLanguageDraft = shallowRef('')

const translatorParameterDropdownDisabled = computed(() =>
  Boolean(props.disabled || props.isStreaming || !props.translatorSkillEnabled),
)
const skillCommandDropdownDisabled = computed(() =>
  Boolean(props.disabled || props.isStreaming),
)
const skillCommandTooltip = computed(() => props.isStreaming ? t('chat.composer.selectSkillDisabled') : t('chat.composer.selectSkill'))
const customLanguageSubmitDisabled = computed(() => !customLanguageDraft.value.trim())
const customTranslatorTargetSelected = computed(() =>
  Boolean(props.translatorTargetLanguage && !props.translatorTargetLanguage.tag),
)

watch(
  () => props.skillCommandOpenSignal,
  async (signal, previousSignal) => {
    if (
      !signal
      || signal === previousSignal
      || props.translatorTargetLanguage
      || skillCommandDropdownDisabled.value
    ) {
      return
    }

    await nextTick()
    skillCommandDropdownRef.value?.handleOpen()
  },
)

watch(
  () => [props.disabled, props.isStreaming, props.translatorTargetLanguage] as const,
  ([disabled, isStreaming, targetLanguage]) => {
    if (disabled || isStreaming || !targetLanguage) {
      customLanguageEditing.value = false
    }
  },
)

function handleTranslatorCommand(command: string | number | object) {
  const commandValue = String(command)
  if (commandValue === TRANSLATOR_CUSTOM_LANGUAGE_COMMAND) {
    void openCustomTranslatorLanguageInput()
    return
  }

  const language = AGENT_TRANSLATOR_PRESET_TARGET_LANGUAGES.find(item => item.tag === commandValue)
  if (!language) {
    return
  }

  customLanguageEditing.value = false
  emits('update:translatorTargetLanguage', language)
}

function handleSkillCommand(command: string | number | object) {
  const commandValue = String(command)
  if (commandValue !== SKILL_TRANSLATOR_COMMAND) {
    return
  }

  emits('update:translatorTargetLanguage', getDefaultTranslatorTargetLanguage())
}

function clearTranslatorSkill() {
  customLanguageEditing.value = false
  emits('update:translatorTargetLanguage', null)
}

function getDefaultTranslatorTargetLanguage() {
  return { ...AGENT_TRANSLATOR_PRESET_TARGET_LANGUAGES[0] }
}

function isTranslatorTargetSelected(language: AgentTranslatorTargetLanguage) {
  return props.translatorTargetLanguage?.tag === language.tag
}

async function openCustomTranslatorLanguageInput() {
  customLanguageDraft.value = customTranslatorTargetSelected.value
    ? props.translatorTargetLanguage?.name ?? ''
    : ''
  customLanguageEditing.value = true
  await nextTick()
  customLanguageInputRef.value?.focus()
}

function confirmCustomTranslatorLanguage() {
  const name = customLanguageDraft.value.trim()
  if (!name) {
    return
  }

  customLanguageDraft.value = name
  customLanguageEditing.value = false
  emits('update:translatorTargetLanguage', { name })
}

function cancelCustomTranslatorLanguageInput() {
  customLanguageEditing.value = false
}
</script>

<template>
  <div class="chat-composer-toolbar">
    <div class="chat-composer-toolbar__left">
      <ElTooltip :content="t('chat.composer.uploadFile')" placement="top">
        <button
          class="chat-composer-toolbar__icon-button"
          type="button"
          :disabled="props.disabled"
          :aria-label="t('chat.composer.uploadFile')"
          @click="emits('placeholderUpload')"
        >
          <SvgIcon category="ui" icon="plus" size="1rem" />
        </button>
      </ElTooltip>

      <ElTooltip :content="t('chat.composer.selectDocument')" placement="top">
        <button
          class="chat-composer-toolbar__icon-button"
          type="button"
          :disabled="props.disabled"
          :aria-label="t('chat.composer.selectDocument')"
          @click="emits('openPanelPicker')"
        >
          <span class="chat-composer-toolbar__symbol">@</span>
        </button>
      </ElTooltip>

      <span class="chat-composer-toolbar__divider" aria-hidden="true" />

      <ElTooltip v-if="!props.translatorTargetLanguage" :content="skillCommandTooltip" placement="top">
        <span>
          <ElDropdown
            ref="skillCommandDropdownRef"
            trigger="click"
            :disabled="skillCommandDropdownDisabled"
            @command="handleSkillCommand"
          >
            <button
              class="chat-composer-toolbar__icon-button"
              type="button"
              :disabled="skillCommandDropdownDisabled"
              :aria-label="t('chat.composer.selectSkill')"
            >
              <span class="chat-composer-toolbar__symbol">/</span>
            </button>

            <template #dropdown>
              <ElDropdownMenu class="chat-composer-toolbar__command-menu">
                <template v-if="props.translatorSkillEnabled">
                  <ElDropdownItem
                    :command="SKILL_TRANSLATOR_COMMAND"
                    class="chat-composer-toolbar__command-item"
                  >
                    <span class="chat-composer-toolbar__command-main">
                      <SvgIcon category="ai" icon="translate" size="1rem" />
                      <span>{{ t('chat.composer.translate') }}</span>
                    </span>
                  </ElDropdownItem>
                </template>
                <ElDropdownItem
                  v-else
                  disabled
                  class="chat-composer-toolbar__command-empty"
                >
                  {{ t('chat.composer.noSkills') }}
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </span>
      </ElTooltip>

      <div v-else class="chat-composer-toolbar__selected-skill">
        <span class="chat-composer-toolbar__skill-chip">
          <SvgIcon class="chat-composer-toolbar__skill-icon" category="ai" icon="translate" size="1rem" />
          <ElTooltip :content="t('chat.composer.exitSkillTooltip')" placement="top" effect="dark">
            <button
              class="chat-composer-toolbar__skill-close"
              type="button"
              :aria-label="t('chat.composer.exitSkill')"
              @click="clearTranslatorSkill"
            >
              <ElIcon><CloseBold /></ElIcon>
            </button>
          </ElTooltip>
        </span>

        <div v-if="customLanguageEditing" class="chat-composer-toolbar__parameter-edit">
          <span class="chat-composer-toolbar__parameter-prefix">{{ t('chat.composer.translateTo') }}</span>
          <ElInput
            ref="customLanguageInputRef"
            v-model="customLanguageDraft"
            class="chat-composer-toolbar__parameter-value chat-composer-toolbar__parameter-input"
            :aria-label="t('chat.composer.customTargetLanguage')"
            :placeholder="t('chat.composer.targetLanguage')"
            maxlength="10"
            @keydown.enter.stop.prevent="confirmCustomTranslatorLanguage"
            @keydown.esc.stop.prevent="cancelCustomTranslatorLanguageInput"
          />
          <button
            class="chat-composer-toolbar__parameter-action"
            type="button"
            :disabled="customLanguageSubmitDisabled"
            :aria-label="t('chat.composer.confirmTargetLanguage')"
            @click="confirmCustomTranslatorLanguage"
          >
            <ElIcon><Check /></ElIcon>
          </button>
          <button
            class="chat-composer-toolbar__parameter-action"
            type="button"
            :aria-label="t('chat.composer.cancelInput')"
            @click="cancelCustomTranslatorLanguageInput"
          >
            <ElIcon><CloseBold /></ElIcon>
          </button>
        </div>

        <ElDropdown
          v-else
          trigger="click"
          :disabled="translatorParameterDropdownDisabled"
          @command="handleTranslatorCommand"
        >
          <button
            class="chat-composer-toolbar__parameter-button"
            type="button"
            :disabled="translatorParameterDropdownDisabled"
            :aria-label="t('chat.composer.translateToAria', { language: props.translatorTargetLanguage.name })"
          >
            <span class="chat-composer-toolbar__parameter-prefix">{{ t('chat.composer.translateTo') }}</span>
            <span class="chat-composer-toolbar__parameter-value">{{ props.translatorTargetLanguage.name }}</span>
            <ElIcon class="chat-composer-toolbar__parameter-arrow">
              <ArrowDown />
            </ElIcon>
          </button>

          <template #dropdown>
            <ElDropdownMenu class="chat-composer-toolbar__translate-menu">
              <ElDropdownItem
                v-for="language in AGENT_TRANSLATOR_PRESET_TARGET_LANGUAGES"
                :key="language.tag"
                :command="language.tag"
                class="chat-composer-toolbar__translate-item"
                :class="{ 'is-selected': isTranslatorTargetSelected(language) }"
              >
                {{ language.name }}
              </ElDropdownItem>

              <ElDropdownItem
                divided
                :command="TRANSLATOR_CUSTOM_LANGUAGE_COMMAND"
                class="chat-composer-toolbar__translate-item"
                :class="{ 'is-selected': customTranslatorTargetSelected }"
              >
                {{ t('chat.composer.other') }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </div>
    </div>

    <div class="chat-composer-toolbar__right">
      <ChatModelTrigger
        :selected-model-ref="props.selectedModelRef"
        :selection-kind="props.modelSelectionKind"
        :disabled="props.isStreaming"
        @select="emits('selectModel', $event)"
      />

      <ElTooltip :content="props.isStreaming ? t('chat.composer.stop') : t('chat.composer.send')" placement="top">
        <button
          v-if="props.isStreaming"
          class="chat-composer-toolbar__send-button is-stop"
          type="button"
          :aria-label="t('chat.composer.stop')"
          @click="emits('stop')"
        >
          <ElIcon><CloseBold /></ElIcon>
        </button>
        <button
          v-else
          class="chat-composer-toolbar__send-button"
          type="button"
          :disabled="props.disabled || !props.canSend"
          :aria-label="t('chat.composer.send')"
          @click="emits('send')"
        >
          <SvgIcon category="ui" icon="send-light" size="1rem" />
        </button>
      </ElTooltip>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem 0.5rem;

  .chat-composer-toolbar__left,
  .chat-composer-toolbar__right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .chat-composer-toolbar__right {
    margin-left: auto;
  }

  .chat-composer-toolbar__icon-button,
  .chat-composer-toolbar__parameter-button,
  .chat-composer-toolbar__send-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--brand-fill-light) 36%, transparent);
    color: var(--brand-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--brand-text-primary);
      background: color-mix(in srgb, var(--brand-fill-light) 72%, transparent);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }
  }

  .chat-composer-toolbar__divider {
    width: 1px;
    height: 1.25rem;
    flex: 0 0 auto;
    margin: 0 0.25rem;
    background: color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  }

  .chat-composer-toolbar__selected-skill {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 0.625rem;
  }

  .chat-composer-toolbar__skill-chip {
    display: inline-flex;
    height: 2rem;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.375rem 0 0.5rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--brand-primary) 10%, var(--brand-bg-surface));
    color: var(--brand-primary);
  }

  .chat-composer-toolbar__skill-icon {
    flex: 0 0 auto;
  }

  .chat-composer-toolbar__skill-close {
    display: inline-flex;
    width: 1.25rem;
    height: 1.25rem;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: color-mix(in srgb, var(--brand-primary) 72%, var(--brand-text-secondary));
    cursor: pointer;
    font-size: 0.75rem;

    &:hover {
      background: color-mix(in srgb, var(--brand-primary) 14%, transparent);
      color: var(--brand-primary);
    }
  }

  .chat-composer-toolbar__parameter-button {
    width: auto;
    max-width: 13rem;
    gap: 0.375rem;
    padding: 0 0.625rem;
    border-color: transparent;
    background: transparent;
    color: var(--brand-text-primary);
  }

  .chat-composer-toolbar__parameter-edit {
    display: inline-flex;
    height: 2rem;
    max-width: 16rem;
    min-width: 0;
    align-items: center;
    gap: 0.375rem;
    padding: 0 0.375rem 0 0.625rem;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--brand-text-primary);
  }

  .chat-composer-toolbar__parameter-prefix {
    flex: 0 0 auto;
    color: var(--brand-text-tertiary);
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1;
  }

  .chat-composer-toolbar__parameter-value {
    min-width: 0;
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-composer-toolbar__parameter-arrow {
    flex: 0 0 auto;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
  }

  .chat-composer-toolbar__parameter-input {
    width: 5.75rem;
    flex: 0 1 5.75rem;
    min-width: 4.5rem;
    overflow: visible;
    line-height: normal;
    white-space: normal;

    :deep(.el-input__wrapper) {
      height: 1.75rem;
      padding: 0 0.5rem;
      border-radius: 0.375rem;
      background: var(--brand-bg-surface);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 86%, transparent) inset;
    }

    :deep(.el-input__inner) {
      color: var(--brand-text-primary);
      font-size: 0.875rem;
      font-weight: 400;
    }
  }

  .chat-composer-toolbar__parameter-action {
    display: inline-flex;
    width: 1.75rem;
    height: 1.75rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 0.5rem;
    background: var(--brand-bg-surface);
    color: var(--brand-text-secondary);
    cursor: pointer;
    font-size: 0.875rem;

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--brand-fill-light) 64%, transparent);
      color: var(--brand-text-primary);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.42;
    }
  }

  .chat-composer-toolbar__send-button {
    border-color: var(--brand-primary);
    background: var(--brand-primary);
    color: #fff;

    &:hover:not(:disabled) {
      color: #fff;
      background: color-mix(in srgb, var(--brand-primary) 88%, #000);
    }
  }

  .chat-composer-toolbar__send-button.is-stop {
    border-color: var(--el-color-danger);
    background: var(--el-color-danger);
  }

  .chat-composer-toolbar__symbol {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
  }
}

:global(.chat-composer-toolbar__translate-menu) {
  min-width: 8.5rem;
  padding: 0.25rem;
}

:global(.chat-composer-toolbar__command-menu) {
  min-width: 11rem;
  padding: 0.25rem;
}

:global(.el-dropdown-menu__item.chat-composer-toolbar__translate-item) {
  min-height: 2rem;
  padding: 0 0.625rem;
}

:global(.el-dropdown-menu__item.chat-composer-toolbar__command-item),
:global(.el-dropdown-menu__item.chat-composer-toolbar__command-empty) {
  min-height: 2rem;
  padding: 0 0.625rem;
}

:global(.chat-composer-toolbar__command-main) {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

:global(.el-dropdown-menu__item.chat-composer-toolbar__command-empty) {
  color: var(--brand-text-tertiary);
}

:global(.el-dropdown-menu__item.chat-composer-toolbar__translate-item.is-selected),
:global(.el-dropdown-menu__item.chat-composer-toolbar__command-item.is-selected) {
  color: var(--brand-primary);
  font-weight: 400;
}
</style>
