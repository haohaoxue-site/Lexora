import type { AutomationChangeCoordinator } from '../automations/AutomationChangeCoordinator'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ProviderExecutionModelResolver } from './ProviderExecutionModelResolver'
import type { BuddyModel } from './providerSchemas'
import type { ProviderService } from './ProviderService'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { resolveBuddyServiceTiers } from '../../../shared/conversation/modelSelection'
import { providersRpc } from '../../../shared/providers/providerApi'
import { ok, registerRuntimeRequest } from '../rpc/runtimeRequest'

export interface ProviderSessionInvalidator {
  invalidateAll: () => Promise<unknown>
}

export interface RegisterProviderRpcOptions {
  automations: Pick<AutomationChangeCoordinator, 'blockPinnedModel'>
  rpc: RuntimeRequestRegistrar
  service: ProviderService
  sessions: ProviderSessionInvalidator
}

export function registerProviderRpc(options: RegisterProviderRpcOptions): () => void {
  const disposers: Array<() => void> = []

  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.list, async () => {
    return options.service.listProviders()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.add, async (input) => {
    return options.service.addProvider(input.providerId)
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.listModels, async (input) => {
    const models = await options.service.listModels(input.providerId ?? undefined)
    return models.map(model => toRuntimeModelOption(options.service.executionModels, model))
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.getDefaultModel, () => {
    return options.service.getDefaultModel()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.login, async (input) => {
    await options.service.login(input.providerId, input.authType)
    return ok()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.respondToAuth, async (input) => {
    await options.service.respondToPrompt(input.challengeId, input.value)
    return ok()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.cancelAuth, async (input) => {
    await options.service.cancelLogin(input.challengeId)
    return ok()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.logout, async (input) => {
    await options.service.logout(input.providerId)
    options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return ok()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.clearCredential, async (input) => {
    await options.service.clearCredential(input.providerId)
    options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return ok()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.remove, async (input) => {
    await options.service.removeProvider(input.providerId)
    options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return ok()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.setEnabled, async (input) => {
    const provider = await options.service.setProviderEnabled(input.providerId, input.enabled)
    if (!input.enabled)
      options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return provider
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.setModelEnabled, async (input) => {
    const model = await options.service.setModelEnabled(
      input.providerId,
      input.modelId,
      input.enabled,
    )
    if (!input.enabled)
      options.automations.blockPinnedModel(input.providerId, input.modelId)
    await options.sessions.invalidateAll()
    return toRuntimeModelOption(options.service.executionModels, model)
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.setModelParameters, async (input) => {
    return toRuntimeModelOption(
      options.service.executionModels,
      await options.service.setModelParametersOverride(
        input.providerId,
        input.modelId,
        input.parameters,
      ),
    )
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.acknowledgeModelSourceUpdate, async (input) => {
    return toRuntimeModelOption(
      options.service.executionModels,
      await options.service.acknowledgeModelSourceUpdate(input.providerId, input.modelId),
    )
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.restoreModelSourceParameters, async (input) => {
    return toRuntimeModelOption(
      options.service.executionModels,
      await options.service.restoreModelSourceParameters(input.providerId, input.modelId),
    )
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.setDefaultModel, (input) => {
    return options.service.setDefaultModel(input.model)
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.syncModels, async (input) => {
    const models = await options.service.syncModels(input.providerId)
    for (const model of models) {
      if (!model.enabled || !model.available)
        options.automations.blockPinnedModel(model.providerId, model.id)
    }
    return models.map(model => toRuntimeModelOption(options.service.executionModels, model))
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.upsertManualModel, async (input) => {
    const model = await options.service.upsertManualModel(input.providerId, input.model)
    await options.sessions.invalidateAll()
    return toRuntimeModelOption(options.service.executionModels, model)
  }))
  disposers.push(registerRuntimeRequest(options.rpc, providersRpc.upsertCustom, async (params) => {
    const provider = await options.service.upsertCustomProvider(
      params,
    )
    await options.sessions.invalidateAll()
    return provider
  }))

  return () => disposers.splice(0).forEach(dispose => dispose())
}

function toRuntimeModelOption(
  models: Pick<ProviderExecutionModelResolver, 'resolve'>,
  model: BuddyModel,
) {
  let reasoningOptions: string[] = []
  if (model.capabilities.includes('reasoning')) {
    try {
      reasoningOptions = [...getSupportedThinkingLevels(
        models.resolve({
          contextWindow: null,
          maxTokens: null,
          modelId: model.id,
          providerId: model.providerId,
        }),
      )]
    }
    catch {}
  }
  return {
    available: model.available,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    displayName: model.displayName,
    enabled: model.enabled,
    hasParameterOverride: model.hasParameterOverride,
    lastSeenAt: model.lastSeenAt,
    maxTokens: model.maxTokens,
    modelId: model.id,
    overrideContextWindow: model.overrideContextWindow,
    overrideMaxTokens: model.overrideMaxTokens,
    providerId: model.providerId,
    reasoningOptions,
    serviceTiers: resolveBuddyServiceTiers({
      api: model.api,
      modelId: model.id,
      providerId: model.providerId,
    }),
    source: model.source,
    sourceContextWindow: model.sourceContextWindow,
    sourceMaxTokens: model.sourceMaxTokens,
    sourceParametersUpdated: model.sourceParametersUpdated,
  }
}
