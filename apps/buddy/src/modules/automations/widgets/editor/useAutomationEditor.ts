import type { AutomationEditorProps } from './typing'
import { Temporal } from '@buddy-shared/automation/temporal'
import { computed, reactive, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { modelKey, resolveModelConfigurationIssue } from '@/modules/models'
import {
  automationEditorFormFromDefinition,
  buildAutomationDraft,
  buildAutomationTiming,
  createAutomationEditorForm,
} from '../../model/automationEditorForm'
import { useAutomationSchedulePreview } from './useAutomationSchedulePreview'

export function useAutomationEditor(props: Readonly<AutomationEditorProps>) {
  const { t } = useBuddyI18n(() => props.language)
  const form = reactive(createAutomationEditorForm(Temporal.Now.zonedDateTimeISO()))
  const ready = computed(() => !props.loading && (props.mode === 'create' || props.automation !== null))

  watch(() => [props.mode, props.automation, ready.value] as const, ([, automation, isReady]) => {
    if (!isReady)
      return
    const now = Temporal.Now.zonedDateTimeISO()
    Object.assign(form, automation
      ? automationEditorFormFromDefinition(automation, now)
      : createAutomationEditorForm(now))
  }, { immediate: true })

  const timing = computed(() => ready.value ? buildAutomationTiming(form, props.automation?.timing) : null)
  const previewState = useAutomationSchedulePreview(timing, input => props.preview(input))
  const validatedDraft = computed(() => buildAutomationDraft(form, props.automation?.timing))
  const availableModels = computed(() => props.models.filter(model => model.available && model.enabled))
  const modelIssue = computed(() => {
    if (form.modelMode === 'default')
      return null
    const model = availableModels.value.find(candidate => modelKey(candidate) === form.pinnedModelKey)
    if (!model)
      return 'modelUnavailable'
    return resolveModelConfigurationIssue(model, { reasoning: form.reasoning, serviceTier: null })
      ? 'reasoningUnavailable'
      : null
  })
  const canSave = computed(() => ready.value
    && !props.busy
    && modelIssue.value === null
    && validatedDraft.value !== null
    && previewState.value.status === 'ready'
    && previewState.value.result.valid)
  const pageTitle = computed(() => form.name.trim() || t('desktop.automations.editor.createTitle'))
  const spaceOptions = computed(() => {
    const options = props.spaces
      .filter(space => space.revokedAt === null)
      .map(space => ({ label: space.name, value: space.id }))
    if (!form.spaceId || options.some(option => option.value === form.spaceId))
      return options
    const space = props.spaces.find(candidate => candidate.id === form.spaceId)
    return [{
      disabled: true,
      label: space
        ? t('desktop.automations.editor.unavailableSpace', { name: space.name })
        : t('desktop.automations.editor.unknownSpace'),
      value: form.spaceId,
    }, ...options]
  })

  function updatePinnedModel(value: string | null): void {
    form.modelMode = value ? 'pinned' : 'default'
    form.pinnedModelKey = value
    const model = availableModels.value.find(candidate => modelKey(candidate) === value)
    if (!model?.reasoningOptions.includes(form.reasoning ?? 'off'))
      form.reasoning = null
  }

  function draftForSave() {
    return canSave.value ? validatedDraft.value : null
  }

  return { canSave, draftForSave, form, modelIssue, pageTitle, previewState, spaceOptions, updatePinnedModel }
}
