import type { RequestResponse } from '@haohaoxue/samepage-contracts'

export type RequestErrorKind = 'business' | 'http' | 'rate_limit' | 'network' | 'parse' | 'unknown'
export type RequestErrorSource = 'axios' | 'fetch' | 'stream' | 'unknown'

export interface RequestErrorOptions {
  source?: RequestErrorSource
  status?: number
  code?: number
  message?: string
  data?: unknown
  bodyText?: string
  originalError?: unknown
}

const HTML_PATTERN = /<(?:!doctype|html|body|head|title|style|script|div|span|p|center|h1)\b/i
const TOO_MANY_REQUESTS_PATTERN = /\b429\b|too many requests/i
const NETWORK_ERROR_PATTERN = /network error|failed to fetch|load failed|timeout|network request failed/i
const PARSE_ERROR_PATTERN = /no response body|invalid response|unexpected token|unexpected end/i
const SERVER_ERROR_PATTERN = /bad gateway|service unavailable|gateway timeout|nginx|upstream|proxy error/i

type RequestErrorResolvedOptions = RequestErrorOptions & {
  kind: RequestErrorKind
  rawMessage: string
  detailMessage: string
  message: string
  source: RequestErrorSource
}

export class RequestError extends Error {
  readonly kind: RequestErrorKind
  readonly source: RequestErrorSource
  readonly status?: number
  readonly code?: number
  readonly data?: unknown
  readonly bodyText?: string
  readonly rawMessage: string
  readonly detailMessage: string
  readonly originalError?: unknown

  constructor(options: RequestErrorResolvedOptions) {
    super(options.message)
    this.name = 'RequestError'
    this.kind = options.kind
    this.source = options.source
    this.status = options.status
    this.code = options.code
    this.data = options.data
    this.bodyText = options.bodyText
    this.rawMessage = options.rawMessage
    this.detailMessage = options.detailMessage
    this.originalError = options.originalError
    Object.setPrototypeOf(this, RequestError.prototype)
  }
}

export function createRequestError(options: RequestErrorOptions = {}) {
  const source = options.source ?? 'unknown'
  const status = getNumericValue(options.status)
  const code = getNumericValue(options.code) ?? getResponseCode(options.data)
  const rawMessage = resolveRawMessage(options)
  const detailMessage = sanitizeDetailMessage(rawMessage)
  const kind = resolveRequestErrorKind({
    status,
    code,
    rawMessage,
    bodyText: options.bodyText,
  })

  return new RequestError({
    ...options,
    source,
    status,
    code,
    kind,
    rawMessage,
    detailMessage,
    message: buildTechnicalMessage(kind, status, code, detailMessage),
  })
}

export function createRequestErrorFromResponseEnvelope(
  envelope: RequestResponse | unknown,
  options: Omit<RequestErrorOptions, 'code' | 'data' | 'bodyText'> = {},
) {
  return createRequestError({
    ...options,
    code: getResponseCode(envelope),
    data: envelope,
    bodyText: typeof envelope === 'string' ? envelope : undefined,
  })
}

export async function createRequestErrorFromHttpResponse(
  response: Response,
  options: Omit<RequestErrorOptions, 'status' | 'data' | 'bodyText'> = {},
) {
  const bodyText = await response.text()

  return createRequestError({
    ...options,
    status: response.status,
    data: parseResponseBody(bodyText) ?? undefined,
    bodyText,
  })
}

export function toRequestError(error: unknown, options: RequestErrorOptions = {}) {
  if (error instanceof RequestError) {
    return error
  }

  if (error instanceof Error) {
    const requestError = error as Error & {
      status?: unknown
      code?: unknown
      data?: unknown
      bodyText?: unknown
    }

    return createRequestError({
      ...options,
      status: getNumericValue(requestError.status) ?? options.status,
      code: getNumericValue(requestError.code) ?? options.code,
      data: requestError.data ?? options.data,
      bodyText: typeof requestError.bodyText === 'string' ? requestError.bodyText : options.bodyText,
      message: requestError.message || options.message,
      originalError: error,
    })
  }

  if (error && typeof error === 'object') {
    const requestError = error as {
      status?: unknown
      code?: unknown
      data?: unknown
      bodyText?: unknown
      message?: unknown
    }

    return createRequestError({
      ...options,
      status: getNumericValue(requestError.status) ?? options.status,
      code: getNumericValue(requestError.code) ?? options.code,
      data: requestError.data ?? options.data ?? error,
      bodyText: typeof requestError.bodyText === 'string' ? requestError.bodyText : options.bodyText,
      message: extractMessage(requestError.message) || options.message,
      originalError: error,
    })
  }

  return createRequestError({
    ...options,
    data: options.data ?? error,
    message: options.message,
    originalError: error,
  })
}

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof RequestError
}

export function getRequestErrorDisplayMessage(error: unknown, fallback = '请求失败') {
  const requestError = toRequestError(error)
  const effectiveStatus = getEffectiveStatus(requestError.status, requestError.code)

  switch (requestError.kind) {
    case 'business':
      return requestError.detailMessage || fallback
    case 'rate_limit':
      return '当前请求较多，请稍后再试。'
    case 'network':
      return '网络异常，请稍后再试。'
    case 'parse':
      return effectiveStatus && effectiveStatus >= 500
        ? '服务暂时不可用，请稍后再试。'
        : '服务响应异常，请稍后再试。'
    case 'http':
      return effectiveStatus && effectiveStatus >= 500
        ? '服务暂时不可用，请稍后再试。'
        : fallback
    default:
      return requestError.detailMessage || fallback
  }
}

function resolveRequestErrorKind(options: {
  status?: number
  code?: number
  rawMessage: string
  bodyText?: string
}): RequestErrorKind {
  const effectiveStatus = getEffectiveStatus(options.status, options.code)
  const combinedText = collapseWhitespace([options.rawMessage, options.bodyText ?? ''].filter(Boolean).join(' '))

  if (effectiveStatus === 429 || TOO_MANY_REQUESTS_PATTERN.test(combinedText)) {
    return 'rate_limit'
  }

  if (NETWORK_ERROR_PATTERN.test(combinedText)) {
    return 'network'
  }

  if (looksLikeHtml(options.rawMessage) || looksLikeHtml(options.bodyText ?? '')) {
    return 'parse'
  }

  if (PARSE_ERROR_PATTERN.test(combinedText)) {
    return 'parse'
  }

  if (effectiveStatus && effectiveStatus >= 500) {
    return 'http'
  }

  if (SERVER_ERROR_PATTERN.test(combinedText)) {
    return 'http'
  }

  if (options.rawMessage) {
    return 'business'
  }

  if (effectiveStatus) {
    return 'http'
  }

  return 'unknown'
}

function buildTechnicalMessage(
  kind: RequestErrorKind,
  status: number | undefined,
  code: number | undefined,
  detailMessage: string,
) {
  const effectiveStatus = getEffectiveStatus(status, code)

  switch (kind) {
    case 'business':
      return detailMessage || 'Request Error'
    case 'rate_limit':
      return detailMessage || 'Too Many Requests'
    case 'network':
      return detailMessage || 'Network Error'
    case 'parse':
      return 'Invalid Response Body'
    case 'http':
      return effectiveStatus ? `HTTP ${effectiveStatus}` : 'HTTP Error'
    default:
      return detailMessage || 'Request Error'
  }
}

function resolveRawMessage(options: RequestErrorOptions) {
  const fromMessage = collapseWhitespace(extractMessage(options.message))
  if (fromMessage) {
    return fromMessage
  }

  const fromData = collapseWhitespace(extractMessage(options.data))
  if (fromData) {
    return fromData
  }

  const fromBodyText = typeof options.bodyText === 'string'
    ? collapseWhitespace(options.bodyText)
    : ''

  if (fromBodyText) {
    return fromBodyText
  }

  return ''
}

function sanitizeDetailMessage(message: string) {
  if (!message || looksLikeHtml(message)) {
    return ''
  }

  return message.length > 160 ? '' : message
}

function extractMessage(raw: unknown): string {
  if (raw instanceof Error) {
    return extractMessage(raw.message)
  }

  if (Array.isArray(raw)) {
    return raw
      .map(item => extractMessage(item))
      .filter(Boolean)
      .join('，')
  }

  if (typeof raw === 'string') {
    return raw
  }

  if (raw && typeof raw === 'object') {
    const requestError = raw as {
      error?: unknown
      message?: unknown
    }

    if (requestError.message != null) {
      return extractMessage(requestError.message)
    }

    if (requestError.error != null) {
      return extractMessage(requestError.error)
    }
  }

  return ''
}

function getEffectiveStatus(status?: number, code?: number) {
  if (code && code !== 200 && code !== 201) {
    return code
  }

  return status
}

function getResponseCode(data: unknown) {
  if (!data || typeof data !== 'object') {
    return undefined
  }

  return getNumericValue((data as { code?: unknown }).code)
}

function getNumericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function collapseWhitespace(message: string) {
  return message.replace(/\s+/g, ' ').trim()
}

function looksLikeHtml(message: string) {
  return HTML_PATTERN.test(message)
}

function parseResponseBody(bodyText: string) {
  try {
    return JSON.parse(bodyText) as unknown
  }
  catch {
    return null
  }
}
