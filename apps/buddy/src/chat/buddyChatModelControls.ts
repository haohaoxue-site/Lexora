import type {
  BuddyChatModelSelection,
  BuddyModelServiceTier,
  BuddyRuntimeModelOption,
} from '@/lib/tauriRuntime'

export interface BuddyModelControlState {
  model: BuddyRuntimeModelOption | null
  effort: string | null
  serviceTier: string | null
}

export interface BuddyModelSpeedOption {
  id: string | null
  label: string
  description: string | null
  isFast: boolean
}

export interface BuddyChatSendReadyInput {
  attachmentCount: number
  content: string
  isReadingFiles: boolean
  modelSelection: BuddyChatModelSelection | null
}

const FAST_SERVICE_TIER_PATTERN = /\b(?:fast|speed|quick|turbo)\b/i

export function resolveDefaultBuddyModelState(
  options: ReadonlyArray<BuddyRuntimeModelOption>,
): BuddyModelControlState {
  const codexOptions = options.filter(option => option.runtime === 'codex')
  const model = codexOptions.find(option => option.isDefault) ?? codexOptions[0] ?? null

  return {
    effort: resolveDefaultEffort(model),
    model,
    serviceTier: model?.defaultServiceTier ?? null,
  }
}

export function resolveBuddyModelControlStateFromSelection(
  options: ReadonlyArray<BuddyRuntimeModelOption>,
  selection: BuddyChatModelSelection | null,
): BuddyModelControlState {
  if (!selection)
    return resolveDefaultBuddyModelState(options)

  const model = options.find(option =>
    option.runtime === selection.runtime
    && (option.id === selection.model || option.model === selection.model),
  ) ?? null

  if (!model)
    return resolveDefaultBuddyModelState(options)

  return {
    effort: normalizeEffortForModel(model, selection.effort),
    model,
    serviceTier: normalizeServiceTierForModel(model, selection.serviceTier),
  }
}

export function resolveDefaultEffort(model: BuddyRuntimeModelOption | null): string | null {
  return model?.defaultReasoningEffort
    ?? model?.supportedReasoningEfforts[0]?.reasoningEffort
    ?? null
}

export function normalizeEffortForModel(
  model: BuddyRuntimeModelOption | null,
  effort: string | null,
): string | null {
  if (!model)
    return null

  if (effort && model.supportedReasoningEfforts.some(option => option.reasoningEffort === effort))
    return effort

  return resolveDefaultEffort(model)
}

export function normalizeServiceTierForModel(
  model: BuddyRuntimeModelOption | null,
  serviceTier: string | null,
): string | null {
  if (!model)
    return null

  if (serviceTier && model.serviceTiers.some(tier => tier.id === serviceTier))
    return serviceTier

  return model.defaultServiceTier
}

export function createBuddyModelSpeedOptions(
  model: BuddyRuntimeModelOption | null,
): BuddyModelSpeedOption[] {
  if (!model)
    return []

  const tierOptions = model.serviceTiers.map(tier => ({
    description: tier.description,
    id: tier.id,
    isFast: isBuddyFastServiceTier(tier),
    label: tier.name,
  }))

  if (model.defaultServiceTier === null) {
    return [
      {
        description: null,
        id: null,
        isFast: false,
        label: 'Default',
      },
      ...tierOptions,
    ]
  }

  return tierOptions
}

export function isBuddySelectedFastServiceTier(
  model: BuddyRuntimeModelOption | null,
  serviceTier: string | null,
) {
  if (!model || !serviceTier)
    return false

  const tier = model.serviceTiers.find(tier => tier.id === serviceTier)
  return tier ? isBuddyFastServiceTier(tier) : false
}

export function createBuddyChatModelSelection(
  model: BuddyRuntimeModelOption | null,
  effort: string | null,
  serviceTier: string | null,
): BuddyChatModelSelection | null {
  if (!model)
    return null

  return {
    runtime: model.runtime,
    effort,
    model: model.model,
    serviceTier,
  }
}

export function isBuddyChatSendReady(input: BuddyChatSendReadyInput) {
  if (input.isReadingFiles)
    return false

  if (!hasSelectedBuddyModel(input.modelSelection))
    return false

  return input.content.trim().length > 0 || input.attachmentCount > 0
}

export function formatBuddyNativeOptionLabel(value: string | null | undefined) {
  const text = value?.trim()
  if (!text)
    return ''

  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`
}

function hasSelectedBuddyModel(selection: BuddyChatModelSelection | null) {
  return Boolean(selection?.model?.trim())
}

function isBuddyFastServiceTier(tier: BuddyModelServiceTier) {
  return FAST_SERVICE_TIER_PATTERN.test([
    tier.id,
    tier.name,
  ].join(' '))
}
