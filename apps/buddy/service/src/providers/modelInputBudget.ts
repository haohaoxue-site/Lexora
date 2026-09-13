import { Buffer } from 'node:buffer'

export function getModelRequestBytesLimit(api: string): number | null {
  return api === 'google-generative-ai' ? 20_000_000 : null
}

export function assertModelInputBudget(api: string, inputBytes: number): void {
  const limit = getModelRequestBytesLimit(api)
  const requestOverheadReserve = 1024 * 1024
  if (limit !== null && inputBytes + requestOverheadReserve > limit)
    throw new Error('MODEL_INPUT_TOO_LARGE')
}

export function assertModelRequestBytes(api: string, payload: unknown): void {
  const limit = getModelRequestBytesLimit(api)
  if (limit !== null && Buffer.byteLength(JSON.stringify(payload), 'utf8') > limit)
    throw new Error('MODEL_INPUT_TOO_LARGE')
}

export function base64BytesLength(bytes: number): number {
  return Math.ceil(bytes / 3) * 4
}
