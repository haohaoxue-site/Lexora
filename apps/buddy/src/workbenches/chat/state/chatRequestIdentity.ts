export function createRequestIdRegistry() {
  const requestIdsByOperation = new Map<string, string>()

  return {
    release(operationKey: string) {
      requestIdsByOperation.delete(operationKey)
    },
    resolve(operationKey: string) {
      const existing = requestIdsByOperation.get(operationKey)
      if (existing)
        return existing
      const requestId = crypto.randomUUID()
      requestIdsByOperation.set(operationKey, requestId)
      return requestId
    },
  }
}

export async function createRequestFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
