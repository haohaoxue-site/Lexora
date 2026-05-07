import type {
  AiDefaultModelPolicyItem,
  AiModelIntentKey,
  AiModelRef,
} from '@/apis/ai'
import { AI_DEFAULT_MODEL_STATUS } from '@haohaoxue/samepage-contracts'
import { getAiModelIntentFallbackChain } from '@haohaoxue/samepage-shared'

export interface EffectiveAiDefaultModelPolicy {
  intentKey: AiModelIntentKey
  sourceIntentKey: AiModelIntentKey
  policy: AiDefaultModelPolicyItem | null
  modelRef: AiModelRef | null
  status: AiDefaultModelPolicyItem['status']
  invalidReason: string | null
  inherited: boolean
}

export type AiDefaultModelPolicyRecord = Partial<Record<AiModelIntentKey, AiDefaultModelPolicyItem>>

export function buildAiDefaultModelPolicyRecord(
  policies: AiDefaultModelPolicyItem[],
): AiDefaultModelPolicyRecord {
  return Object.fromEntries(policies.map(policy => [policy.intentKey, policy]))
}

export function resolveEffectiveAiDefaultModelPolicy(
  policyByIntent: AiDefaultModelPolicyRecord,
  intentKey: AiModelIntentKey,
): EffectiveAiDefaultModelPolicy {
  const intentFallbackChain = getAiModelIntentFallbackChain(intentKey)

  for (const [index, currentIntentKey] of intentFallbackChain.entries()) {
    const policy = policyByIntent[currentIntentKey]
    if (policy?.status === AI_DEFAULT_MODEL_STATUS.READY || policy?.status === AI_DEFAULT_MODEL_STATUS.INVALID) {
      return toEffectivePolicy(intentKey, currentIntentKey, policy, index > 0)
    }
  }

  return {
    intentKey,
    sourceIntentKey: intentFallbackChain.at(-1) ?? intentKey,
    policy: null,
    modelRef: null,
    status: AI_DEFAULT_MODEL_STATUS.NOT_CONFIGURED,
    invalidReason: null,
    inherited: intentFallbackChain.length > 1,
  }
}

export function isAiDefaultModelPolicyReady(policy: EffectiveAiDefaultModelPolicy): boolean {
  return policy.status === AI_DEFAULT_MODEL_STATUS.READY && Boolean(policy.modelRef)
}

function toEffectivePolicy(
  intentKey: AiModelIntentKey,
  sourceIntentKey: AiModelIntentKey,
  policy: AiDefaultModelPolicyItem,
  inherited: boolean,
): EffectiveAiDefaultModelPolicy {
  return {
    intentKey,
    sourceIntentKey,
    policy,
    modelRef: policy.modelRef,
    status: policy.status,
    invalidReason: policy.invalidReason,
    inherited,
  }
}
