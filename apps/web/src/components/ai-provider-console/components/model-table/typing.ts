import type { AiProviderModelItem, AiProviderModelStatusChange } from '../../typing'

export interface AiProviderModelTableProps {
  models: AiProviderModelItem[]
  isModelUpdating: (model: AiProviderModelItem) => boolean
}

export interface AiProviderModelTableEmits {
  updateModelStatus: Parameters<AiProviderModelStatusChange>
}
