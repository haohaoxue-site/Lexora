import type { AutomationChangeCoordinator } from '../automations/AutomationChangeCoordinator'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ProviderExecutionModelResolver } from './ProviderExecutionModelResolver'
import type { BuddyModel } from './providerSchemas'
import type { ProviderService } from './ProviderService'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { z } from 'zod'
import { resolveBuddyServiceTiers } from '../../../shared/modelSelection'
import { ok, parse } from '../rpc/runtimeRequest'
import {
  customProviderInputSchema,
  defaultModelSchema,
  modelParametersOverrideSchema,
  providerModelInputSchema,
} from './providerSchemas'

const providerIdSchema = z.string().trim().min(1).max(256)
const emptySchema = z.object({}).strict()
const providerIdRequestSchema = z.object({ providerId: providerIdSchema }).strict()
const providerModelRequestSchema = z.object({
  modelId: providerIdSchema,
  providerId: providerIdSchema,
}).strict()

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
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(options.rpc.onRequest(method, handler))
  }

  on('providers.list', async (params) => {
    parse(emptySchema, params)
    return options.service.listProviders()
  })
  on('providers.add', async (params) => {
    const input = parse(providerIdRequestSchema, params)
    return options.service.addProvider(input.providerId)
  })
  on('providers.listModels', async (params) => {
    const input = parse(z.object({
      providerId: providerIdSchema.nullable().optional(),
    }).strict(), params)
    const models = await options.service.listModels(input.providerId ?? undefined)
    return models.map(model => toRuntimeModelOption(options.service.executionModels, model))
  })
  on('providers.getDefaultModel', (params) => {
    parse(emptySchema, params)
    return options.service.getDefaultModel()
  })
  on('providers.login', async (params) => {
    const input = parse(z.object({
      authType: z.enum(['api_key', 'oauth']),
      providerId: providerIdSchema,
    }).strict(), params)
    await options.service.login(input.providerId, input.authType)
    return ok()
  })
  on('providers.respondToAuth', async (params) => {
    const input = parse(z.object({
      challengeId: z.uuid(),
      value: z.string(),
    }).strict(), params)
    await options.service.respondToPrompt(input.challengeId, input.value)
    return ok()
  })
  on('providers.cancelAuth', async (params) => {
    const input = parse(z.object({ challengeId: z.uuid() }).strict(), params)
    await options.service.cancelLogin(input.challengeId)
    return ok()
  })
  on('providers.logout', async (params) => {
    const input = parse(providerIdRequestSchema, params)
    await options.service.logout(input.providerId)
    options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return ok()
  })
  on('providers.clearCredential', async (params) => {
    const input = parse(providerIdRequestSchema, params)
    await options.service.clearCredential(input.providerId)
    options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return ok()
  })
  on('providers.remove', async (params) => {
    const input = parse(providerIdRequestSchema, params)
    await options.service.removeProvider(input.providerId)
    options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return ok()
  })
  on('providers.setEnabled', async (params) => {
    const input = parse(z.object({
      enabled: z.boolean(),
      providerId: providerIdSchema,
    }).strict(), params)
    const provider = await options.service.setProviderEnabled(input.providerId, input.enabled)
    if (!input.enabled)
      options.automations.blockPinnedModel(input.providerId)
    await options.sessions.invalidateAll()
    return provider
  })
  on('providers.setModelEnabled', async (params) => {
    const input = parse(z.object({
      enabled: z.boolean(),
      modelId: providerIdSchema,
      providerId: providerIdSchema,
    }).strict(), params)
    const model = await options.service.setModelEnabled(
      input.providerId,
      input.modelId,
      input.enabled,
    )
    if (!input.enabled)
      options.automations.blockPinnedModel(input.providerId, input.modelId)
    await options.sessions.invalidateAll()
    return toRuntimeModelOption(options.service.executionModels, model)
  })
  on('providers.setModelParameters', async (params) => {
    const input = parse(z.object({
      modelId: providerIdSchema,
      parameters: modelParametersOverrideSchema,
      providerId: providerIdSchema,
    }).strict(), params)
    return toRuntimeModelOption(
      options.service.executionModels,
      await options.service.setModelParametersOverride(
        input.providerId,
        input.modelId,
        input.parameters,
      ),
    )
  })
  on('providers.acknowledgeModelSourceUpdate', async (params) => {
    const input = parse(providerModelRequestSchema, params)
    return toRuntimeModelOption(
      options.service.executionModels,
      await options.service.acknowledgeModelSourceUpdate(input.providerId, input.modelId),
    )
  })
  on('providers.restoreModelSourceParameters', async (params) => {
    const input = parse(providerModelRequestSchema, params)
    return toRuntimeModelOption(
      options.service.executionModels,
      await options.service.restoreModelSourceParameters(input.providerId, input.modelId),
    )
  })
  on('providers.setDefaultModel', (params) => {
    const input = parse(z.object({ model: defaultModelSchema.nullable() }).strict(), params)
    return options.service.setDefaultModel(input.model)
  })
  on('providers.syncModels', async (params) => {
    const input = parse(providerIdRequestSchema, params)
    const models = await options.service.syncModels(input.providerId)
    for (const model of models) {
      if (!model.enabled || !model.available)
        options.automations.blockPinnedModel(model.providerId, model.id)
    }
    return models.map(model => toRuntimeModelOption(options.service.executionModels, model))
  })
  on('providers.upsertManualModel', async (params) => {
    const input = parse(z.object({
      model: providerModelInputSchema,
      providerId: providerIdSchema,
    }).strict(), params)
    const model = await options.service.upsertManualModel(input.providerId, input.model)
    await options.sessions.invalidateAll()
    return toRuntimeModelOption(options.service.executionModels, model)
  })
  on('providers.upsertCustom', async (params) => {
    const provider = await options.service.upsertCustomProvider(
      parse(customProviderInputSchema, params),
    )
    await options.sessions.invalidateAll()
    return provider
  })

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
