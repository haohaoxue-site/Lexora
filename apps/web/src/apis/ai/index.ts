import type {
  AiAvailableModelOption,
  AiAvailableModelServiceOption,
  AiDefaultModelPolicyItem,
  AiModelIntentKey,
  AiModelItem,
  AiModelProviderTemplate,
  AiModelServiceConfigSummary,
  AiModelServiceScope,
  AiModelSyncResult,
  CreateAiEditorSessionRequest,
  CreateAiModelItemRequest,
  CreateAiModelServiceRequest,
  ResolveAiEditorCandidateResponse,
  UpdateAiDefaultModelPolicyRequest,
  UpdateAiModelItemRequest,
  UpdateAiModelServiceRequest,
} from './typing'
import { SERVER_PATH } from '@haohaoxue/samepage-contracts'
import { useAuthStore } from '@/stores/auth'
import { axios } from '@/utils/axios'

export * from './typing'

const API_BASE_URL = SERVER_PATH

export function getAiModelProviderTemplates(): Promise<AiModelProviderTemplate[]> {
  return axios.request({
    method: 'get',
    url: '/ai/model-provider-templates',
  })
}

export function getAiCompatibleProviderTemplates(): Promise<AiModelProviderTemplate[]> {
  return axios.request({
    method: 'get',
    url: '/ai/model-provider-templates/compatible',
  })
}

export function getSystemAiModelServices(): Promise<AiModelServiceConfigSummary[]> {
  return axios.request({
    method: 'get',
    url: '/system-admin/ai/model-services',
  })
}

export function createSystemAiModelService(data: CreateAiModelServiceRequest): Promise<AiModelServiceConfigSummary> {
  return axios.request({
    method: 'post',
    url: '/system-admin/ai/model-services',
    data,
  })
}

export function updateSystemAiModelService(
  configId: string,
  data: UpdateAiModelServiceRequest,
): Promise<AiModelServiceConfigSummary> {
  return axios.request({
    method: 'patch',
    url: `/system-admin/ai/model-services/${configId}`,
    data,
  })
}

export function deleteSystemAiModelService(configId: string): Promise<void> {
  return axios.request({
    method: 'delete',
    url: `/system-admin/ai/model-services/${configId}`,
  })
}

export function getSystemAiModelItems(configId: string): Promise<AiModelItem[]> {
  return axios.request({
    method: 'get',
    url: `/system-admin/ai/model-services/${configId}/models`,
  })
}

export function syncSystemAiModelItems(configId: string): Promise<AiModelSyncResult> {
  return axios.request({
    method: 'post',
    url: `/system-admin/ai/model-services/${configId}/models/sync`,
  })
}

export function createSystemAiModelItem(
  configId: string,
  data: CreateAiModelItemRequest,
): Promise<AiModelItem> {
  return axios.request({
    method: 'post',
    url: `/system-admin/ai/model-services/${configId}/models`,
    data,
  })
}

export function updateSystemAiModelItem(
  configId: string,
  modelItemId: string,
  data: UpdateAiModelItemRequest,
): Promise<AiModelItem> {
  return axios.request({
    method: 'patch',
    url: `/system-admin/ai/model-services/${configId}/models/${modelItemId}`,
    data,
  })
}

export function deleteSystemAiModelItem(configId: string, modelItemId: string): Promise<void> {
  return axios.request({
    method: 'delete',
    url: `/system-admin/ai/model-services/${configId}/models/${modelItemId}`,
  })
}

export function getUserAiModelServices(): Promise<AiModelServiceConfigSummary[]> {
  return axios.request({
    method: 'get',
    url: '/users/me/ai/model-services',
  })
}

export function createUserAiModelService(data: CreateAiModelServiceRequest): Promise<AiModelServiceConfigSummary> {
  return axios.request({
    method: 'post',
    url: '/users/me/ai/model-services',
    data,
  })
}

export function updateUserAiModelService(
  configId: string,
  data: UpdateAiModelServiceRequest,
): Promise<AiModelServiceConfigSummary> {
  return axios.request({
    method: 'patch',
    url: `/users/me/ai/model-services/${configId}`,
    data,
  })
}

export function deleteUserAiModelService(configId: string): Promise<void> {
  return axios.request({
    method: 'delete',
    url: `/users/me/ai/model-services/${configId}`,
  })
}

export function getUserAiModelItems(configId: string): Promise<AiModelItem[]> {
  return axios.request({
    method: 'get',
    url: `/users/me/ai/model-services/${configId}/models`,
  })
}

export function syncUserAiModelItems(configId: string): Promise<AiModelSyncResult> {
  return axios.request({
    method: 'post',
    url: `/users/me/ai/model-services/${configId}/models/sync`,
  })
}

export function createUserAiModelItem(
  configId: string,
  data: CreateAiModelItemRequest,
): Promise<AiModelItem> {
  return axios.request({
    method: 'post',
    url: `/users/me/ai/model-services/${configId}/models`,
    data,
  })
}

export function updateUserAiModelItem(
  configId: string,
  modelItemId: string,
  data: UpdateAiModelItemRequest,
): Promise<AiModelItem> {
  return axios.request({
    method: 'patch',
    url: `/users/me/ai/model-services/${configId}/models/${modelItemId}`,
    data,
  })
}

export function deleteUserAiModelItem(configId: string, modelItemId: string): Promise<void> {
  return axios.request({
    method: 'delete',
    url: `/users/me/ai/model-services/${configId}/models/${modelItemId}`,
  })
}

export function getAvailableAiModels(intentKey: AiModelIntentKey): Promise<AiAvailableModelOption[]> {
  return axios.request({
    method: 'get',
    url: '/users/me/ai/models/available',
    params: { intentKey },
  })
}

export function getAvailableAiModelServices(
  intentKey: AiModelIntentKey,
  scope: AiModelServiceScope,
): Promise<AiAvailableModelServiceOption[]> {
  return axios.request({
    method: 'get',
    url: '/users/me/ai/models/available/services',
    params: { intentKey, scope },
  })
}

export function getAvailableAiModelServiceModels(
  intentKey: AiModelIntentKey,
  configId: string,
): Promise<AiAvailableModelOption[]> {
  return axios.request({
    method: 'get',
    url: `/users/me/ai/models/available/services/${configId}/models`,
    params: { intentKey },
  })
}

export function getAiDefaultModels(): Promise<AiDefaultModelPolicyItem[]> {
  return axios.request({
    method: 'get',
    url: '/users/me/ai/default-models',
  })
}

export function updateAiDefaultModel(
  intentKey: AiModelIntentKey,
  data: UpdateAiDefaultModelPolicyRequest,
): Promise<AiDefaultModelPolicyItem> {
  return axios.request({
    method: 'put',
    url: `/users/me/ai/default-models/${intentKey}`,
    data,
  })
}

export function createAiEditorSession(
  data: CreateAiEditorSessionRequest,
  options: {
    signal?: AbortSignal
  } = {},
): Promise<Response> {
  const authStore = useAuthStore()

  return fetch(`${API_BASE_URL}/ai/editor/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authStore.accessToken}`,
    },
    body: JSON.stringify(data),
    signal: options.signal,
  })
}

export function acceptAiEditorCandidate(
  sessionId: string,
  candidateId: string,
): Promise<ResolveAiEditorCandidateResponse> {
  return axios.request({
    method: 'post',
    url: `/ai/editor/sessions/${sessionId}/candidates/${candidateId}/accept`,
  })
}

export function rejectAiEditorCandidate(
  sessionId: string,
  candidateId: string,
): Promise<ResolveAiEditorCandidateResponse> {
  return axios.request({
    method: 'post',
    url: `/ai/editor/sessions/${sessionId}/candidates/${candidateId}/reject`,
  })
}
