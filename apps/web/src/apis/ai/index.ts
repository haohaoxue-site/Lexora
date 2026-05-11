import type {
  AiAvailableModelOption,
  AiAvailableProviderOption,
  AiDefaultModelPolicyItem,
  AiModelIntentKey,
  AiProvider,
  AiProviderCredential,
  AiProviderModelItem,
  AiProviderModels,
  AiProviderPreset,
  AiProviderScope,
  CreateAiEditorSessionRequest,
  CreateAiProviderRequest,
  ResolveAiEditorCandidateResponse,
  UpdateAiDefaultModelPolicyRequest,
  UpdateAiProviderRequest,
  UpsertAiProviderModelRequest,
  UpsertAiProviderModelsRequest,
} from './typing'
import { SERVER_PATH } from '@haohaoxue/samepage-contracts'
import { useAuthStore } from '@/stores/auth'
import { axios } from '@/utils/axios'

export * from './typing'

const API_BASE_URL = SERVER_PATH

export function getAiCompatibleProviderPresets(): Promise<AiProviderPreset[]> {
  return axios.request({
    method: 'get',
    url: '/ai/provider-presets/compatible',
  })
}

export function getSystemAiProviders(): Promise<AiProvider[]> {
  return axios.request({
    method: 'get',
    url: '/system-admin/ai/providers',
  })
}

export function createSystemAiProvider(data: CreateAiProviderRequest): Promise<AiProvider> {
  return axios.request({
    method: 'post',
    url: '/system-admin/ai/providers',
    data,
  })
}

export function updateSystemAiProvider(
  providerId: string,
  data: UpdateAiProviderRequest,
): Promise<AiProvider> {
  return axios.request({
    method: 'patch',
    url: `/system-admin/ai/providers/${providerId}`,
    data,
  })
}

export function getSystemAiProviderCredential(providerId: string): Promise<AiProviderCredential> {
  return axios.request({
    method: 'get',
    url: `/system-admin/ai/providers/${providerId}/credential`,
  })
}

export function deleteSystemAiProvider(providerId: string): Promise<void> {
  return axios.request({
    method: 'delete',
    url: `/system-admin/ai/providers/${providerId}`,
  })
}

export function getSystemAiProviderModels(providerId: string): Promise<AiProviderModels> {
  return axios.request({
    method: 'get',
    url: `/system-admin/ai/providers/${providerId}/models`,
  })
}

export function discoverSystemAiProviderModels(providerId: string): Promise<AiProviderModels> {
  return axios.request({
    method: 'post',
    url: `/system-admin/ai/providers/${providerId}/models/discover`,
  })
}

export function upsertSystemAiProviderModel(
  providerId: string,
  data: UpsertAiProviderModelRequest,
): Promise<AiProviderModelItem> {
  return axios.request({
    method: 'post',
    url: `/system-admin/ai/providers/${providerId}/models`,
    data,
  })
}

export function upsertSystemAiProviderModels(
  providerId: string,
  data: UpsertAiProviderModelsRequest,
): Promise<AiProviderModels> {
  return axios.request({
    method: 'put',
    url: `/system-admin/ai/providers/${providerId}/models`,
    data,
  })
}

export function getUserAiProviders(): Promise<AiProvider[]> {
  return axios.request({
    method: 'get',
    url: '/users/me/ai/providers',
  })
}

export function createUserAiProvider(data: CreateAiProviderRequest): Promise<AiProvider> {
  return axios.request({
    method: 'post',
    url: '/users/me/ai/providers',
    data,
  })
}

export function updateUserAiProvider(
  providerId: string,
  data: UpdateAiProviderRequest,
): Promise<AiProvider> {
  return axios.request({
    method: 'patch',
    url: `/users/me/ai/providers/${providerId}`,
    data,
  })
}

export function getUserAiProviderCredential(providerId: string): Promise<AiProviderCredential> {
  return axios.request({
    method: 'get',
    url: `/users/me/ai/providers/${providerId}/credential`,
  })
}

export function deleteUserAiProvider(providerId: string): Promise<void> {
  return axios.request({
    method: 'delete',
    url: `/users/me/ai/providers/${providerId}`,
  })
}

export function getUserAiProviderModels(providerId: string): Promise<AiProviderModels> {
  return axios.request({
    method: 'get',
    url: `/users/me/ai/providers/${providerId}/models`,
  })
}

export function discoverUserAiProviderModels(providerId: string): Promise<AiProviderModels> {
  return axios.request({
    method: 'post',
    url: `/users/me/ai/providers/${providerId}/models/discover`,
  })
}

export function upsertUserAiProviderModel(
  providerId: string,
  data: UpsertAiProviderModelRequest,
): Promise<AiProviderModelItem> {
  return axios.request({
    method: 'post',
    url: `/users/me/ai/providers/${providerId}/models`,
    data,
  })
}

export function upsertUserAiProviderModels(
  providerId: string,
  data: UpsertAiProviderModelsRequest,
): Promise<AiProviderModels> {
  return axios.request({
    method: 'put',
    url: `/users/me/ai/providers/${providerId}/models`,
    data,
  })
}

export function getAvailableAiModels(intentKey: AiModelIntentKey): Promise<AiAvailableModelOption[]> {
  return axios.request({
    method: 'get',
    url: '/users/me/ai/models/available',
    params: { intentKey },
  })
}

export function getAvailableAiProviders(
  intentKey: AiModelIntentKey,
  scope: AiProviderScope,
): Promise<AiAvailableProviderOption[]> {
  return axios.request({
    method: 'get',
    url: '/users/me/ai/models/available/providers',
    params: { intentKey, scope },
  })
}

export function getAvailableAiProviderModels(
  intentKey: AiModelIntentKey,
  providerId: string,
): Promise<AiAvailableModelOption[]> {
  return axios.request({
    method: 'get',
    url: `/users/me/ai/models/available/providers/${providerId}/models`,
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
