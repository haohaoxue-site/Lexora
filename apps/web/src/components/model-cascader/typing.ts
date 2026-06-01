import type { CascaderOption } from 'element-plus'
import type {
  AiModelIntentKey,
  AiModelRef,
  AiProviderScope,
} from '@/apis/ai'

export interface ModelCascaderModelRef {
  providerId: string
  modelId: string
  scope?: AiProviderScope
  providerKey?: string
}

export interface ModelCascaderProps {
  modelValue?: ModelCascaderModelRef | null
  intentKey: AiModelIntentKey
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  filterable?: boolean
  showAllLevels?: boolean
}

export interface ModelCascaderEmits {
  'update:modelValue': [value: AiModelRef | null]
}

export interface ModelCascaderOption extends CascaderOption {
  nodeKind: 'scope' | 'provider' | 'model'
  scope?: AiProviderScope
  providerId?: string
  providerKey?: string
  modelId?: string
  unavailableReason?: string | null
}
