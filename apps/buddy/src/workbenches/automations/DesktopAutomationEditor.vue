<script setup lang="ts">
import type {
  LocalAutomation,
  LocalAutomationPreviewResult,
  LocalProvider,
  LocalRuntimeModelOption,
  LocalSpace,
} from '@buddy-electron/shared/localChatApi'
import type {
  AutomationDefinitionDraft,
  AutomationTiming,
} from '@buddy-shared/automation'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyThinkingLevel } from '@buddy-shared/modelSelection'
import type { AutomationScheduleForm } from './automationEditorForm'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { automationDefinitionDraftSchema, automationTimingSchema } from '@buddy-shared/automation'
import { PanelLeft20Regular } from '@vicons/fluent'
import { useDebounceFn } from '@vueuse/core'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NScrollbar,
  NSelect,
  NSpin,
} from 'naive-ui'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/ui/DesktopIcon.vue'
import { formatAutomationInstant } from './automationPresentation'
import DesktopAutomationPromptComposer from './DesktopAutomationPromptComposer.vue'
import DesktopAutomationScheduleEditor from './DesktopAutomationScheduleEditor.vue'

const props = defineProps<{
  appSidebarCollapsed: boolean
  automation: LocalAutomation | null
  busy: boolean
  error: string | null
  language: BuddyLocale
  loading: boolean
  mode: 'create' | 'edit'
  models: ReadonlyArray<LocalRuntimeModelOption>
  providers: ReadonlyArray<LocalProvider>
  preview: (input: {
    sampleCount?: number
    timing: unknown
  }) => Promise<LocalAutomationPreviewResult>
  spaces: ReadonlyArray<LocalSpace>
}>()

const emit = defineEmits<{
  cancel: []
  save: [draft: AutomationDefinitionDraft]
  toggleAppSidebar: []
}>()

interface AutomationEditorForm extends AutomationScheduleForm {
  executionProfile: BuddyExecutionProfile
  modelMode: 'default' | 'pinned'
  name: string
  pinnedModelKey: string | null
  spaceId: string | null
  prompt: string
  reasoning: BuddyThinkingLevel | null
}

const { t } = useBuddyI18n(() => props.language)
const previewResult = shallowRef<LocalAutomationPreviewResult | null>(null)
const previewLoading = shallowRef(false)
const runtimeNoticeVisible = shallowRef(true)

const form = reactive<AutomationEditorForm>(createDefaultForm())
const validatedDraft = computed(() => buildDraft(form))
const canSave = computed(() => (
  !props.loading
  && (props.mode === 'create' || props.automation !== null)
  && validatedDraft.value !== null
  && previewResult.value?.valid === true
  && !previewLoading.value
))
const pageTitle = computed(() => form.name.trim() || t('desktop.automations.editor.createTitle'))
const availableModels = computed(() => props.models.filter(model => model.available && model.enabled))
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

const requestPreview = useDebounceFn(async () => {
  const timing = buildTiming(form)
  if (!timing) {
    previewResult.value = null
    return
  }
  previewLoading.value = true
  try {
    previewResult.value = await props.preview({ sampleCount: 3, timing })
  }
  catch {
    previewResult.value = { issues: [{ code: 'AUTOMATION_INVALID_SCHEDULE', path: ['timing'] }], valid: false }
  }
  finally {
    previewLoading.value = false
  }
}, 180)

watch(
  () => [props.mode, props.automation, props.loading] as const,
  ([mode, automation, loading]) => {
    if (loading || (mode === 'edit' && !automation))
      return
    Object.assign(form, automation
      ? formFromAutomation(automation)
      : createDefaultForm())
    void requestPreview()
  },
  { immediate: true },
)
watch(() => buildTiming(form), () => {
  if (props.loading || (props.mode === 'edit' && !props.automation))
    return
  previewResult.value = null
  void requestPreview()
}, { deep: true })

function submit(): void {
  if (!canSave.value)
    return
  const draft = validatedDraft.value
  if (!draft || previewResult.value?.valid !== true)
    return
  emit('save', draft)
}

function selectedModel(): LocalRuntimeModelOption | null {
  if (!form.pinnedModelKey)
    return null
  return availableModels.value.find(model => (
    modelKey(model.providerId, model.modelId) === form.pinnedModelKey
  )) ?? null
}

function updatePinnedModel(value: string | null): void {
  form.modelMode = value ? 'pinned' : 'default'
  form.pinnedModelKey = value
  const model = selectedModel()
  if (!model?.reasoningOptions.includes(form.reasoning ?? 'off'))
    form.reasoning = null
}

function close(): void {
  emit('cancel')
}

function buildDraft(value: AutomationEditorForm): AutomationDefinitionDraft | null {
  const timing = buildTiming(value)
  const model = value.modelMode === 'default'
    ? { mode: 'default' as const }
    : parsePinnedModel(value)
  if (!timing || !model)
    return null
  const result = automationDefinitionDraftSchema.safeParse({
    executionProfile: value.executionProfile,
    model,
    name: value.name,
    spaceId: value.spaceId,
    prompt: value.prompt,
    timing,
  })
  return result.success ? result.data : null
}

function buildTiming(value: AutomationEditorForm): AutomationTiming | null {
  try {
    const common = {
      activeFrom: value.frequencyMode === 'once' ? null : value.activeFrom,
      activeUntil: value.frequencyMode === 'once' ? null : value.activeUntil,
      timezone: value.timezone,
    }
    let schedule: AutomationTiming['schedule']
    if (value.frequencyMode === 'once') {
      if (!value.onceLocal)
        return null
      schedule = { kind: 'once', runAt: wallTimeToInstant(value.onceLocal, value.timezone) }
    }
    else if (value.frequencyMode === 'interval') {
      if (!value.anchorLocal)
        return null
      schedule = {
        anchorAt: wallTimeToInstant(value.anchorLocal, value.timezone),
        every: value.every,
        kind: 'interval',
        unit: value.intervalUnit,
      }
    }
    else {
      if (!value.localTime)
        return null
      if (value.cadence === 'daily') {
        schedule = { cadence: 'daily', kind: 'calendar', localTime: value.localTime }
      }
      else if (value.cadence === 'weekly') {
        schedule = {
          cadence: 'weekly',
          kind: 'calendar',
          localTime: value.localTime,
          weekdays: value.weekdays,
        }
      }
      else if (value.cadence === 'monthly') {
        schedule = {
          cadence: 'monthly',
          dayOfMonth: value.dayOfMonth,
          kind: 'calendar',
          localTime: value.localTime,
        }
      }
      else {
        schedule = {
          cadence: 'yearly',
          day: value.day,
          kind: 'calendar',
          localTime: value.localTime,
          month: value.month,
        }
      }
    }
    const result = automationTimingSchema.safeParse({ ...common, schedule })
    return result.success ? result.data : null
  }
  catch {
    return null
  }
}

function parsePinnedModel(value: AutomationEditorForm) {
  if (!value.pinnedModelKey)
    return null
  const separator = value.pinnedModelKey.indexOf(':')
  if (separator < 1)
    return null
  return {
    mode: 'pinned' as const,
    modelId: value.pinnedModelKey.slice(separator + 1),
    providerId: value.pinnedModelKey.slice(0, separator),
    reasoning: value.reasoning,
  }
}

function createDefaultForm(): AutomationEditorForm {
  const timezone = localTimezone()
  const now = Temporal.Now.zonedDateTimeISO(timezone)
    .with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
  const start = now
    .add({ hours: 1 })
    .with({ minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
  return {
    activeFrom: null,
    activeUntil: null,
    anchorLocal: formatWallTime(now),
    cadence: 'daily',
    day: start.day,
    dayOfMonth: start.day,
    every: 1,
    executionProfile: 'controlled',
    frequencyMode: 'calendar',
    intervalUnit: 'hour',
    localTime: start.toPlainTime().toString({ smallestUnit: 'minute' }),
    modelMode: 'default',
    month: start.month,
    name: '',
    onceLocal: formatWallTime(start),
    pinnedModelKey: null,
    spaceId: null,
    prompt: '',
    reasoning: null,
    timezone,
    weekdays: [start.dayOfWeek],
  }
}

function formFromAutomation(automation: LocalAutomation): AutomationEditorForm {
  const next = createDefaultForm()
  next.activeFrom = automation.timing.activeFrom
  next.activeUntil = automation.timing.activeUntil
  next.executionProfile = automation.executionProfile
  next.modelMode = automation.model.mode
  next.name = automation.name
  next.spaceId = automation.spaceId
  next.prompt = automation.prompt
  next.timezone = localTimezone()
  if (automation.model.mode === 'pinned') {
    next.pinnedModelKey = modelKey(automation.model.providerId, automation.model.modelId)
    next.reasoning = automation.model.reasoning
  }
  const schedule = automation.timing.schedule
  next.frequencyMode = schedule.kind
  if (schedule.kind === 'once') {
    next.onceLocal = instantToWallTime(schedule.runAt, next.timezone)
  }
  else if (schedule.kind === 'interval') {
    next.anchorLocal = instantToWallTime(schedule.anchorAt, next.timezone)
    next.every = schedule.every
    next.intervalUnit = schedule.unit
  }
  else {
    next.cadence = schedule.cadence
    next.localTime = schedule.localTime
    if (schedule.cadence === 'weekly')
      next.weekdays = [...schedule.weekdays]
    if (schedule.cadence === 'monthly')
      next.dayOfMonth = schedule.dayOfMonth
    if (schedule.cadence === 'yearly') {
      next.day = schedule.day
      next.month = schedule.month
    }
  }
  return next
}

function wallTimeToInstant(value: string, timezone: string): string {
  return Temporal.PlainDateTime.from(value.replace(' ', 'T'))
    .toZonedDateTime(timezone)
    .toInstant()
    .toString({ smallestUnit: 'millisecond' })
}

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function instantToWallTime(value: string, timezone: string): string {
  return formatWallTime(Temporal.Instant.from(value).toZonedDateTimeISO(timezone))
}

function formatWallTime(value: Temporal.ZonedDateTime): string {
  return `${value.toPlainDate()} ${value.toPlainTime().toString({ smallestUnit: 'minute' })}`
}

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`
}
</script>

<template>
  <section class="desktop-automation-editor">
    <header class="desktop-automation-editor__header">
      <div class="desktop-automation-editor__breadcrumb">
        <NButton
          v-if="appSidebarCollapsed"
          class="buddy-icon-button"
          quaternary
          @click="emit('toggleAppSidebar')"
        >
          <template #icon>
            <NIcon :component="PanelLeft20Regular" />
          </template>
        </NButton>
        <NIcon>
          <DesktopIcon name="navigationAutomation" />
        </NIcon>
        <button type="button" @click="close">
          {{ t('desktop.automations.title') }}
        </button>
        <span>/</span>
        <strong>{{ pageTitle }}</strong>
      </div>
      <div class="desktop-automation-editor__header-actions">
        <NButton :disabled="busy" @click="close">
          {{ t('desktop.automations.editor.cancel') }}
        </NButton>
        <NButton
          type="primary"
          :disabled="!canSave"
          :loading="busy"
          @click="submit"
        >
          {{ t('desktop.automations.editor.save') }}
        </NButton>
      </div>
    </header>

    <NScrollbar class="desktop-automation-editor__scroll">
      <div class="desktop-automation-editor__content">
        <NAlert
          v-if="mode === 'create' && runtimeNoticeVisible"
          class="desktop-automation-editor__runtime-alert"
          type="info"
          :bordered="false"
          closable
          @close="runtimeNoticeVisible = false"
        >
          {{ t('desktop.automations.editor.runtimeTip') }}
        </NAlert>
        <NAlert v-if="error" type="error" :bordered="false">
          {{ error }}
        </NAlert>

        <NSpin class="desktop-automation-editor__body" :show="loading">
          <NForm
            v-if="mode === 'create' || automation"
            class="desktop-automation-editor__form"
            label-placement="top"
            @submit.prevent="submit"
          >
            <NFormItem :label="t('desktop.automations.editor.name')" required>
              <NInput
                v-model:value="form.name"
                :maxlength="80"
                placeholder=""
              />
            </NFormItem>

            <div class="desktop-automation-editor__space-field">
              <NFormItem :label="t('desktop.automations.editor.space')">
                <NSelect
                  v-model:value="form.spaceId"
                  clearable
                  filterable
                  :options="spaceOptions"
                  :placeholder="t('desktop.automations.editor.spacePlaceholder')"
                />
              </NFormItem>
              <p>{{ t('desktop.automations.editor.spaceHint') }}</p>
            </div>

            <NFormItem :label="t('desktop.automations.editor.prompt')" required>
              <DesktopAutomationPromptComposer
                :execution-profile="form.executionProfile"
                :language="language"
                :models="models"
                :prompt="form.prompt"
                :providers="providers"
                :selected-effort="form.reasoning"
                :selected-model-id="form.modelMode === 'pinned' ? form.pinnedModelKey : null"
                @update-effort="form.reasoning = $event"
                @update-execution-profile="form.executionProfile = $event"
                @update-model="updatePinnedModel"
                @update-prompt="form.prompt = $event"
              />
            </NFormItem>

            <DesktopAutomationScheduleEditor
              :language="language"
              :value="form"
              @update="Object.assign(form, $event)"
            />

            <section class="desktop-automation-editor__preview">
              <div class="desktop-automation-editor__section-heading">
                <h2>{{ t('desktop.automations.editor.preview') }}</h2>
              </div>
              <NAlert v-if="previewLoading" type="info" :bordered="false">
                {{ t('desktop.automations.refresh') }}…
              </NAlert>
              <NAlert v-else-if="previewResult?.valid" type="success" :bordered="false">
                <strong>{{ t('desktop.automations.editor.nextRun', {
                  time: formatAutomationInstant(previewResult.nextRunAt, language, form.timezone),
                }) }}</strong>
                <ul>
                  <li v-for="sample in previewResult.samples" :key="sample">
                    {{ formatAutomationInstant(sample, language, form.timezone) }}
                  </li>
                </ul>
              </NAlert>
              <NAlert v-else type="warning" :bordered="false">
                {{ t('desktop.automations.editor.previewInvalid') }}
              </NAlert>
            </section>
          </NForm>

          <div v-else-if="!loading" class="desktop-automation-editor__unavailable">
            <p>{{ t('desktop.automations.editor.loadUnavailable') }}</p>
            <NButton @click="close">
              {{ t('desktop.automations.editor.cancel') }}
            </NButton>
          </div>
        </NSpin>
      </div>
    </NScrollbar>
  </section>
</template>

<style scoped lang="scss">
.desktop-automation-editor {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--buddy-surface-base);
}

.desktop-automation-editor__header,
.desktop-automation-editor__breadcrumb,
.desktop-automation-editor__header-actions {
  display: flex;
  align-items: center;
}

.desktop-automation-editor__header {
  height: var(--buddy-region-header-height);
  flex: none;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0 18px;
}

.desktop-automation-editor__breadcrumb {
  min-width: 0;
  gap: 7px;
  color: var(--buddy-text-secondary);
  font-size: 13px;

  > .n-icon {
    flex: none;
    color: var(--buddy-text-primary);
    font-size: 18px;
  }

  button:not(.n-button) {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }

  button:not(.n-button):hover {
    color: var(--buddy-accent-text);
  }

  button:not(.n-button):focus-visible {
    border-radius: 4px;
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }

  strong {
    overflow: hidden;
    color: var(--buddy-text-strong);
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-automation-editor__header-actions {
  flex: none;
  gap: 8px;
}

.desktop-automation-editor__scroll {
  min-height: 0;
  flex: 1;
}

.desktop-automation-editor__content {
  display: grid;
  width: min(100%, 1120px);
  gap: 16px;
  margin: 0 auto;
  padding: clamp(18px, 3vw, 34px) clamp(18px, 3vw, 34px) 48px;
}

.desktop-automation-editor__body {
  min-height: 280px;

  :deep(.n-spin-container),
  :deep(.n-spin-content) {
    min-height: 280px;
  }
}

.desktop-automation-editor__form,
.desktop-automation-editor__preview {
  display: grid;
}

.desktop-automation-editor__space-field {
  display: grid;
  gap: 4px;

  p {
    margin: -10px 0 8px;
    color: var(--buddy-text-muted);
    font-size: 11px;
    line-height: 1.5;
  }
}

.desktop-automation-editor__form {
  gap: 10px;
}

.desktop-automation-editor__preview {
  gap: 14px;
  border-top: 1px solid var(--buddy-border-subtle);
  margin-top: 6px;
  padding-top: 22px;
}

.desktop-automation-editor__section-heading {
  display: grid;
  gap: 3px;

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--buddy-text-strong);
    font-size: 14px;
    font-weight: 660;
  }

  p {
    color: var(--buddy-text-muted);
    font-size: 11px;
    line-height: 1.5;
  }
}

.desktop-automation-editor__preview ul {
  display: grid;
  margin: 8px 0 0;
  gap: 3px;
  padding-left: 18px;
}

.desktop-automation-editor__unavailable {
  display: grid;
  min-height: 260px;
  place-content: center;
  justify-items: center;
  gap: 12px;
  color: var(--buddy-text-secondary);
  text-align: center;

  p {
    margin: 0;
  }
}

@media (max-width: 760px) {
  .desktop-automation-editor__header {
    padding: 0 12px;
  }

  .desktop-automation-editor__content {
    padding: 16px 16px 48px;
  }
}
</style>
