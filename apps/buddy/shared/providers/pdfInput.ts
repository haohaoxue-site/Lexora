export function supportsPdfInputApi(api: string): boolean {
  return ['openai-responses', 'openai-codex-responses', 'openai-completions', 'anthropic-messages', 'google-generative-ai'].includes(api)
}
