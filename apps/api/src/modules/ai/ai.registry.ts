import type { AiModelProviderTemplate } from '@haohaoxue/samepage-contracts'
import {
  AI_MODEL_AUTH_MODE,
  AI_MODEL_ENDPOINT_MODE,
  AI_MODEL_TYPE,
} from '@haohaoxue/samepage-contracts'

export const AI_BUILTIN_PROVIDER_TEMPLATES = [
  {
    providerKey: 'openai',
    providerName: 'OpenAI',
    adapterKey: 'openai-chat-completions',
    endpointMode: AI_MODEL_ENDPOINT_MODE.FIXED,
    fixedEndpoint: 'https://api.openai.com/v1',
    authMode: AI_MODEL_AUTH_MODE.BEARER,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT, AI_MODEL_TYPE.EMBEDDING, AI_MODEL_TYPE.IMAGE],
  },
  {
    providerKey: 'deepseek',
    providerName: 'DeepSeek',
    adapterKey: 'openai-chat-completions',
    endpointMode: AI_MODEL_ENDPOINT_MODE.FIXED,
    fixedEndpoint: 'https://api.deepseek.com/v1',
    authMode: AI_MODEL_AUTH_MODE.BEARER,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT],
  },
  {
    providerKey: 'anthropic',
    providerName: 'Anthropic',
    adapterKey: 'anthropic-messages',
    endpointMode: AI_MODEL_ENDPOINT_MODE.FIXED,
    fixedEndpoint: 'https://api.anthropic.com/v1',
    authMode: AI_MODEL_AUTH_MODE.API_KEY,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT],
  },
] as const satisfies AiModelProviderTemplate[]

export const AI_COMPATIBLE_PROVIDER_TEMPLATES = [
  {
    providerKey: 'openai-compatible',
    providerName: 'OpenAI-Compatible',
    adapterKey: 'openai-chat-completions',
    endpointMode: AI_MODEL_ENDPOINT_MODE.CUSTOM,
    authMode: AI_MODEL_AUTH_MODE.BEARER,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT, AI_MODEL_TYPE.EMBEDDING, AI_MODEL_TYPE.RERANK, AI_MODEL_TYPE.IMAGE],
  },
  {
    providerKey: 'anthropic-compatible',
    providerName: 'Anthropic-Compatible',
    adapterKey: 'anthropic-messages',
    endpointMode: AI_MODEL_ENDPOINT_MODE.CUSTOM,
    authMode: AI_MODEL_AUTH_MODE.API_KEY,
    supportedModelTypes: [AI_MODEL_TYPE.CHAT],
  },
] as const satisfies AiModelProviderTemplate[]

export const AI_PROVIDER_TEMPLATES = [
  ...AI_BUILTIN_PROVIDER_TEMPLATES,
  ...AI_COMPATIBLE_PROVIDER_TEMPLATES,
] as const satisfies AiModelProviderTemplate[]
