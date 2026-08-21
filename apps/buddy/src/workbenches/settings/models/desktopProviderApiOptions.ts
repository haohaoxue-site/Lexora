import type { LocalCustomProvider } from '@buddy-electron/shared/localChatApi'

export const desktopProviderApiOptions: Array<{
  label: string
  value: LocalCustomProvider['api']
}> = [
  { label: 'OpenAI Chat Completions', value: 'openai-completions' },
  { label: 'OpenAI Responses', value: 'openai-responses' },
  { label: 'Anthropic Messages', value: 'anthropic-messages' },
  { label: 'Google Generative AI', value: 'google-generative-ai' },
  { label: 'Mistral Conversations', value: 'mistral-conversations' },
]
