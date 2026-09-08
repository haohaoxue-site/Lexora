import { WebError } from './webProtocol'

export interface WebResource {
  bytes: Uint8Array
  headers: Headers
  status: number
  url: string
}

export type PublicWebGet = (url: string, signal: AbortSignal, limit?: number) => Promise<WebResource>

export type ProviderWebFetch = (url: string, init: {
  method: 'POST'
  headers: Headers | Record<string, string>
  body: string
  signal: AbortSignal
}) => Promise<Response>

export function requireWebSuccess(status: number): void {
  if (status === 429)
    throw new WebError('WEB_RATE_LIMITED', status)
  if ([401, 403].includes(status))
    throw new WebError('WEB_ACCESS_DENIED', status)
  if (status < 200 || status >= 300)
    throw new WebError('WEB_HTTP_ERROR', status)
}
