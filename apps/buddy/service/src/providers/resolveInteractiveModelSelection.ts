import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '../../../shared/modelSelection'
import type { ProviderExecutionModelResolver } from './ProviderExecutionModelResolver'
import type { ProviderService } from './ProviderService'
import { resolveBuddyServiceTiers } from '../../../shared/modelSelection'
import {
  ProviderAuthenticationRequiredError,
  ProviderValidationError,
} from './ProviderFailure'

export interface InteractiveModelSelection {
  modelId: string
  providerId: string
  reasoning: BuddyThinkingLevel | null
  serviceTier: BuddyServiceTier | null
}

export interface ResolvedInteractiveModelSelection extends InteractiveModelSelection {
  contextWindow: number
  maxTokens: number
}

export interface RuntimeModelProvider extends Pick<ProviderService, 'getDefaultModel'> {
  executionModels: Pick<ProviderExecutionModelResolver, 'resolveAvailable'>
}

export async function resolveInteractiveModelSelection(
  providers: RuntimeModelProvider,
  requested: InteractiveModelSelection | null,
): Promise<ResolvedInteractiveModelSelection> {
  const selected = requested ?? await providers.getDefaultModel()
  if (!selected)
    throw new ProviderAuthenticationRequiredError()
  const model = await providers.executionModels.resolveAvailable({
    contextWindow: null,
    maxTokens: null,
    modelId: selected.modelId,
    providerId: selected.providerId,
  })
  const serviceTier = requested?.serviceTier ?? null
  if (
    serviceTier !== null
    && !resolveBuddyServiceTiers({
      api: model.api,
      modelId: model.id,
      providerId: selected.providerId,
    }).some(option => option.id === serviceTier)
  ) {
    throw new ProviderValidationError()
  }
  return {
    ...selected,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    serviceTier,
  }
}
