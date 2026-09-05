import { Buffer } from 'node:buffer'
import { BlockList, isIP } from 'node:net'
import { WebError } from '../webProtocol'

const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4')
blocked.addSubnet('2001::', 23, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')
blocked.addSubnet('3fff::', 20, 'ipv6')

function isPublicWebAddress(address: string): boolean {
  if (isIP(address) === 4)
    return !blocked.check(address, 'ipv4')
  if (isIP(address) !== 6)
    return false
  const first = Number.parseInt(address.split(':')[0] ?? '', 16)
  return (first & 0xE000) === 0x2000 && !blocked.check(address, 'ipv6')
}

function isPublicWebHostname(raw: string): boolean {
  const hostname = raw.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return Boolean(hostname)
    && !/(?:^|\.)(?:localhost|local|internal|lan|home\.arpa)$/.test(hostname)
    && hostname !== 'metadata.oraclecloud.com'
    && (!isIP(hostname) || isPublicWebAddress(hostname))
}

export function publicWebUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch { throw new WebError('WEB_URL_BLOCKED') }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || (url.port && !['80', '443'].includes(url.port))
    || (!hostname.includes('.') && !isIP(hostname))
    || !isPublicWebHostname(hostname)) {
    throw new WebError('WEB_URL_BLOCKED')
  }
  url.hash = ''
  return url
}

export interface WebResource {
  bytes: Uint8Array
  headers: Headers
  status: number
  url: string
}

export async function readResponseBytes(response: { body: ReadableStream<Uint8Array> | null }, limit: number): Promise<Uint8Array> {
  if (!response.body)
    return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      length += chunk.value.byteLength
      if (length > limit)
        throw new WebError('WEB_RESPONSE_TOO_LARGE')
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks, length)
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
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
