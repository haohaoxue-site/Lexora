<script setup lang="ts">
import type { AgentTranslatorTargetLanguage } from '@haohaoxue/lexora-contracts/agent'
import type { DropdownInstance, InputInstance } from 'element-plus'
import type {
  ChatComposerSkillControlsEmits,
  ChatComposerSkillControlsProps,
} from './typing'
import { ArrowDown, Check, CloseBold } from '@element-plus/icons-vue'
import { AGENT_TRANSLATOR_PRESET_TARGET_LANGUAGES } from '@haohaoxue/lexora-contracts/agent'
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<ChatComposerSkillControlsProps>()
const emit = defineEmits<ChatComposerSkillControlsEmits>()
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
const skillCommandTooltip = computed(() =>
  props.isStreaming ? t('chat.composer.selectSkillDisabled') : t('chat.composer.selectSkill'),
)
const customLanguageSubmitDisabled = computed(() => !customLanguageDraft.value.trim())
const customTranslatorTargetSelected = computed(() =>
  Boolean(props.translatorTargetLanguage && !props.translatorTargetLanguage.tag),
)
const translatorTargetName = computed(() => props.translatorTargetLanguage?.name ?? '')

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
  emit('update:translatorTargetLanguage', language)
}

function handleSkillCommand(command: string | number | object) {
  const commandValue = String(command)
  if (commandValue !== SKILL_TRANSLATOR_COMMAND) {
    return
  }

  emit('update:translatorTargetLanguage', getDefaultTranslatorTargetLanguage())
}

function clearTranslatorSkill() {
  customLanguageEditing.value = false
  emit('update:translatorTargetLanguage', null)
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
  emit('update:translatorTargetLanguage', { name })
}

function cancelCustomTranslatorLanguageInput() {
  customLanguageEditing.value = false
}
</script>

<template>
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
        :aria-label="t('chat.composer.translateToAria', { language: translatorTargetName })"
      >
        <span class="chat-composer-toolbar__parameter-prefix">{{ t('chat.composer.translateTo') }}</span>
        <span class="chat-composer-toolbar__parameter-value">{{ translatorTargetName }}</span>
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
</template>
