import type { LocalCustomProvider, LocalCustomProviderModel } from '@buddy-shared/providers/providerApi'
import type { ModelParameters } from '../../state/typing'

export interface ManualModelEditorActions {
  saveManualModel: (model: LocalCustomProviderModel) => Promise<boolean>
}

export interface ModelParameterActions extends ManualModelEditorActions {
  saveParameters: (parameters: ModelParameters) => Promise<boolean>
  restoreParameters: () => Promise<boolean>
  acknowledgeSourceUpdate: () => Promise<boolean>
}

export interface ProviderConnectionActions {
  clearError: () => void
  save: (provider: LocalCustomProvider) => Promise<boolean>
}
