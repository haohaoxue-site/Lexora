import type { CascaderOption } from 'element-plus'
import type {
  AiModelIntentKey,
  AiModelRef,
  AiModelServiceScope,
} from '@/apis/ai'

/**
 * 模型级联选择值。
 */
export interface ModelCascaderModelRef {
  /** 模型服务 ID */
  configId: string
  /** 模型 ID */
  modelId: string
  /** 模型服务归属 */
  scope?: AiModelServiceScope
  /** 服务商键 */
  providerKey?: string
}

/**
 * 模型级联选择器属性。
 */
export interface ModelCascaderProps {
  /** 当前模型引用 */
  modelValue?: ModelCascaderModelRef | null
  /** 模型使用场景 */
  intentKey: AiModelIntentKey
  /** 占位文案 */
  placeholder?: string
  /** 禁用态 */
  disabled?: boolean
  /** 是否允许清空 */
  clearable?: boolean
  /** 是否启用筛选 */
  filterable?: boolean
  /** 是否展示完整路径 */
  showAllLevels?: boolean
}

/**
 * 模型级联选择器事件。
 */
export interface ModelCascaderEmits {
  'update:modelValue': [value: AiModelRef | null]
}

/**
 * 模型级联选项。
 */
export interface ModelCascaderOption extends CascaderOption {
  /** 选项层级类型 */
  nodeKind: 'scope' | 'provider' | 'model'
  /** 模型服务归属 */
  scope?: AiModelServiceScope
  /** 模型服务 ID */
  configId?: string
  /** 服务商键 */
  providerKey?: string
  /** 模型 ID */
  modelId?: string
  /** 不可用原因 */
  unavailableReason?: string | null
}
