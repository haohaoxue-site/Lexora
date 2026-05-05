import type { FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'

export function resolveRequestId(request: FastifyRequest): string {
  return resolveHeaderRequestId(request.headers['x-request-id']) ?? randomUUID()
}

export function resolveHeaderRequestId(header: string | string[] | undefined): string | null {
  const requestId = Array.isArray(header) ? header[0] : header
  return requestId?.trim() || null
}

export function createHocuspocusWebRequest(request: FastifyRequest): Request {
  const headers = new Headers()

  for (const [name, value] of Object.entries(request.headers)) {
    appendWebRequestHeader(headers, name, value)
  }

  return new Request(resolveAbsoluteRequestUrl(request), {
    headers,
    method: request.method,
  })
}

export function isSameOriginRequest(request: FastifyRequest): boolean {
  const origin = readHeaderValue(request.headers.origin)
  const host = readForwardedHost(request) ?? readHeaderValue(request.headers.host)

  if (!origin || !host) {
    return false
  }

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  }
  catch {
    return false
  }
}

export function getTicketFromRequest(authorization: string | undefined, url: string): string | null {
  const bearerToken = getBearerToken(authorization)

  if (bearerToken) {
    return bearerToken
  }

  return new URL(url, 'http://samepage.local').searchParams.get('ticket')
}

export function resolveHandshakeRateLimitKey(request: FastifyRequest): string {
  const fastifyIp = resolveFastifyRequestIp(request)

  if (fastifyIp) {
    return `ip:${fastifyIp}`
  }

  const forwardedFor = request.headers['x-forwarded-for']
  const firstForwardedFor = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor
  const forwardedIp = firstForwardedFor?.split(',')[0]?.trim()

  if (forwardedIp) {
    return `ip:${forwardedIp}`
  }

  const remoteAddress = request.raw.socket?.remoteAddress

  if (remoteAddress) {
    return `ip:${remoteAddress}`
  }

  return 'ip:unknown'
}

export function registerSocketCloseRelease(socket: unknown, releaseConnection: () => void): void {
  const target = resolveSocketEventTarget(socket)

  if (typeof target?.once === 'function') {
    target.once('close', releaseConnection)
    return
  }

  if (typeof target?.on === 'function') {
    target.on('close', releaseConnection)
  }
}

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return null
  }

  const token = authorization.slice('bearer '.length).trim()

  return token || null
}

function readForwardedHost(request: FastifyRequest): string | null {
  return readHeaderValue(request.headers['x-forwarded-host'])
    ?? readForwardedHeaderHost(request.headers.forwarded)
}

function readForwardedProtocol(request: FastifyRequest): string {
  return readHeaderValue(request.headers['x-forwarded-proto'])
    ?? readForwardedHeaderProtocol(request.headers.forwarded)
    ?? 'http'
}

function readForwardedHeaderHost(value: string | string[] | undefined): string | null {
  const forwarded = readHeaderValue(value)
  const host = forwarded
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.toLowerCase().startsWith('host='))
    ?.slice('host='.length)
    .replace(/^"|"$/g, '')
    .trim()

  return host || null
}

function readForwardedHeaderProtocol(value: string | string[] | undefined): string | null {
  const forwarded = readHeaderValue(value)
  const protocol = forwarded
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.toLowerCase().startsWith('proto='))
    ?.slice('proto='.length)
    .replace(/^"|"$/g, '')
    .trim()

  return protocol || null
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value
  const firstValue = header?.split(',')[0]?.trim()

  return firstValue || null
}

function appendWebRequestHeader(headers: Headers, name: string, value: string | string[] | undefined): void {
  if (value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    for (const headerValue of value) {
      headers.append(name, headerValue)
    }
    return
  }

  headers.set(name, value)
}

function resolveAbsoluteRequestUrl(request: FastifyRequest): string {
  const protocol = readForwardedProtocol(request)
  const host = readForwardedHost(request) ?? readHeaderValue(request.headers.host) ?? 'samepage.local'

  return new URL(request.url, `${protocol}://${host}`).toString()
}

function resolveFastifyRequestIp(request: FastifyRequest): string | null {
  try {
    return request.ip || null
  }
  catch {
    return null
  }
}

function resolveSocketEventTarget(socket: unknown): { once?: unknown, on?: unknown } | null {
  if (!socket || typeof socket !== 'object') {
    return null
  }

  if ('once' in socket || 'on' in socket) {
    return socket as { once?: unknown, on?: unknown }
  }

  if ('socket' in socket) {
    const nestedSocket = socket.socket

    if (nestedSocket && typeof nestedSocket === 'object') {
      return nestedSocket as { once?: unknown, on?: unknown }
    }
  }

  return null
}
