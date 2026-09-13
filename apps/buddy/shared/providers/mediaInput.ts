export function supportsAudioInputApi(api: string): boolean {
  return api === 'google-generative-ai' || api === 'openai-completions'
}

export function usesAudioDataUrl(api: string, baseUrl?: string): boolean {
  if (api !== 'openai-completions' || !baseUrl)
    return false
  const url = URL.parse(baseUrl)
  return url !== null && ['api.xiaomimimo.com', 'token-plan-cn.xiaomimimo.com', 'token-plan-sgp.xiaomimimo.com'].includes(url.hostname)
}

export function supportsAudioInputMimeType(api: string, mimeType: string, baseUrl?: string): boolean {
  if (mimeType === 'audio/wav' || mimeType === 'audio/mpeg')
    return supportsAudioInputApi(api)
  return mimeType === 'audio/mp4' && usesAudioDataUrl(api, baseUrl)
}

export function supportsVideoInputApi(api: string): boolean {
  return api === 'google-generative-ai'
}
