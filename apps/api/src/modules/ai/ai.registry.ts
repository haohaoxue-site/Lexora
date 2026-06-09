import type { AiProviderPreset } from '@haohaoxue/samepage-contracts'
import {
  AI_MODEL_TYPE,
  AI_PROVIDER_AUTH_MODE,
  AI_PROVIDER_ENDPOINT_MODE,
} from '@haohaoxue/samepage-contracts'

export const AI_BUILTIN_PROVIDER_PRESETS = [
  {
    providerKey: 'openai',
    providerName: 'OpenAI',
    adapterKey: 'openai-chat-completions',
    endpointMode: AI_PROVIDER_ENDPOINT_MODE.FIXED,
    fixedEndpoint: 'https://api.openai.com/v1',
    authMode: AI_PROVIDER_AUTH_MODE.BEARER,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT, AI_MODEL_TYPE.EMBEDDING, AI_MODEL_TYPE.IMAGE, AI_MODEL_TYPE.AUDIO],
  },
  {
    providerKey: 'deepseek',
    providerName: 'DeepSeek',
    adapterKey: 'openai-chat-completions',
    endpointMode: AI_PROVIDER_ENDPOINT_MODE.FIXED,
    fixedEndpoint: 'https://api.deepseek.com/v1',
    authMode: AI_PROVIDER_AUTH_MODE.BEARER,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT],
  },
  {
    providerKey: 'anthropic',
    providerName: 'Anthropic',
    adapterKey: 'anthropic-messages',
    endpointMode: AI_PROVIDER_ENDPOINT_MODE.FIXED,
    fixedEndpoint: 'https://api.anthropic.com/v1',
    authMode: AI_PROVIDER_AUTH_MODE.API_KEY,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT],
  },
] as const satisfies AiProviderPreset[]

export const AI_COMPATIBLE_PROVIDER_PRESETS = [
  {
    providerKey: 'openai-compatible',
    providerName: 'OpenAI-Compatible',
    adapterKey: 'openai-chat-completions',
    endpointMode: AI_PROVIDER_ENDPOINT_MODE.CUSTOM,
    authMode: AI_PROVIDER_AUTH_MODE.BEARER,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT, AI_MODEL_TYPE.EMBEDDING, AI_MODEL_TYPE.RERANK, AI_MODEL_TYPE.IMAGE, AI_MODEL_TYPE.AUDIO],
  },
  {
    providerKey: 'anthropic-compatible',
    providerName: 'Anthropic-Compatible',
    adapterKey: 'anthropic-messages',
    endpointMode: AI_PROVIDER_ENDPOINT_MODE.CUSTOM,
    authMode: AI_PROVIDER_AUTH_MODE.API_KEY,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT],
  },
] as const satisfies AiProviderPreset[]

export const AI_PROVIDER_PRESETS = [
  ...AI_BUILTIN_PROVIDER_PRESETS,
  ...AI_COMPATIBLE_PROVIDER_PRESETS,
] as const satisfies AiProviderPreset[]
