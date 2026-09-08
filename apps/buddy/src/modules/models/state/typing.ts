import type { BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'
import type { LocalCustomProvider, LocalCustomProviderModel, LocalDefaultModel, LocalProvider, LocalProviderAuthChallenge, LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface ModelParameters {
  contextWindow: number
  maxTokens: number
}

export interface ModelProvidersStore {
  authChallenge: Readonly<Ref<LocalProviderAuthChallenge | null>>
  defaultEffort: Readonly<Ref<BuddyThinkingLevel | null>>
  defaultModelId: Readonly<Ref<string | null>>
  isAuthenticating: Readonly<Ref<boolean>>
  isLoadingModelCatalog: Readonly<Ref<boolean>>
  language: Readonly<Ref<BuddyLocale>>
  modelProviderError: Readonly<Ref<string | null>>
  models: Readonly<Ref<ReadonlyArray<LocalRuntimeModelOption>>>
  mutatingProviderId: Readonly<Ref<string | null>>
  providers: Readonly<Ref<ReadonlyArray<LocalProvider>>>
  registeredModels: Readonly<Ref<ReadonlyArray<LocalRuntimeModelOption>>>
  syncingProviderId: Readonly<Ref<string | null>>
  acknowledgeModelSourceUpdate: (providerId: string, modelId: string) => Promise<boolean>
  addProvider: (providerId: string) => Promise<boolean>
  cancelAuth: (challengeId: string) => Promise<void>
  clearModelProviderError: () => void
  clearProviderCredential: (providerId: string) => Promise<boolean>
  dispose: () => void
  loadModelCatalog: (force?: boolean) => Promise<boolean>
  loginProvider: (providerId: string, authType: 'api_key' | 'oauth') => Promise<boolean>
  logoutProvider: (providerId: string) => Promise<boolean>
  rememberModelSelection: (value: LocalDefaultModel | null) => Promise<boolean>
  removeProvider: (providerId: string) => Promise<boolean>
  respondToAuth: (challengeId: string, value: string) => Promise<boolean>
  restoreModelSourceParameters: (providerId: string, modelId: string) => Promise<boolean>
  setDefaultEffort: (value: BuddyThinkingLevel | null) => Promise<boolean>
  setDefaultModel: (value: string | null) => Promise<boolean>
  setModelParameters: (providerId: string, modelId: string, parameters: ModelParameters) => Promise<boolean>
  setProviderEnabled: (providerId: string, enabled: boolean) => Promise<boolean>
  setProviderModelEnabled: (providerId: string, modelId: string, enabled: boolean) => Promise<boolean>
  syncProviderModels: (providerId: string) => Promise<boolean>
  upsertCustomProvider: (provider: LocalCustomProvider) => Promise<boolean>
  upsertManualModel: (providerId: string, model: LocalCustomProviderModel) => Promise<boolean>
}
