<script setup lang="ts">
import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import type { ModelParameterActions } from './typing'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { BUDDY_THINKING_LEVELS } from '@buddy-shared/conversation/modelSelection'
import { NCheckbox, NCheckboxGroup } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopModelSectionHeader from './DesktopModelSectionHeader.vue'
import { useModelCapabilitiesForm } from './useModelCapabilitiesForm'

const props = defineProps<{
  model: LocalRuntimeModelOption
  actions: ModelParameterActions
  language: BuddyLocale
  saving: boolean
  disabled: boolean
  show: boolean
}>()
const { t } = useBuddyI18n(() => props.language)
const { editing, form, valid, hasOverride, submitting, startEditing, updateLevels, save, restore } = useModelCapabilitiesForm({
  section: 'thinking',
  model: () => props.model,
  show: () => props.show,
  disabled: () => props.disabled || props.saving,
  save: capabilities => props.actions.saveCapabilities(capabilities),
})
const locked = computed(() => props.disabled || props.saving || submitting.value)
const thinkingLevels = computed(() => {
  const levels = props.model.capabilityOverrides?.reasoningOptions ?? props.model.reasoningOptions
  return levels.length ? levels : ['off']
})
</script>

<template>
  <section class="desktop-model-thinking-panel">
    <DesktopModelSectionHeader
      :label="t('desktop.providers.thinking')"
      :language="language"
      :editing="editing"
      :saving="saving || submitting"
      :disabled="disabled"
      :valid="valid"
      :can-restore="hasOverride"
      @edit="startEditing"
      @cancel="editing = false"
      @save="save"
      @restore="restore"
    />
    <div v-if="editing" class="desktop-model-thinking-panel__form">
      <NCheckboxGroup :value="form.levels" :disabled="locked" @update:value="updateLevels">
        <div class="desktop-model-thinking-panel__levels">
          <NCheckbox v-for="level in BUDDY_THINKING_LEVELS" :key="level" size="small" :value="level" :label="level" />
        </div>
      </NCheckboxGroup>
      <p v-if="!valid" class="desktop-model-thinking-panel__validation">
        {{ t('desktop.providers.selectThinkingLevel') }}
      </p>
    </div>
    <div v-else class="desktop-model-thinking-panel__summary">
      {{ thinkingLevels.join(' / ') }}
    </div>
  </section>
</template>

<style scoped>
.desktop-model-thinking-panel {
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
  background: var(--buddy-surface-base);
}

.desktop-model-thinking-panel__form,
.desktop-model-thinking-panel__summary {
  display: grid;
  gap: 0.65rem;
  border-top: 1px solid var(--buddy-border-subtle);
  padding: 0.85rem 1rem;
}

.desktop-model-thinking-panel__summary {
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
  overflow-wrap: anywhere;
}

.desktop-model-thinking-panel__levels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 1rem;
}

.desktop-model-thinking-panel__validation {
  margin: 0;
  color: var(--buddy-status-warning-text);
  font-size: 0.66rem;
}
</style>
