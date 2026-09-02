import type { BrowserObservedElement } from '../../../shared/browserProtocol'

type BrowserObservedValue = Pick<
  BrowserObservedElement,
  'inputMode' | 'value' | 'valueState'
>

export interface BrowserFieldObservationInput {
  attributes?: ReadonlyMap<string, string>
  description: string
  hasValue: boolean
  name: string
  protectedField: boolean
  role: string
  value: unknown
}

const VALUE_ROLES = new Set([
  'combo-box',
  'list-box',
  'search-box',
  'slider',
  'spin-button',
  'textbox',
])

const SENSITIVE_AUTOCOMPLETE_TOKENS = new Set([
  'current-password',
  'new-password',
  'one-time-code',
])

const SENSITIVE_FIELD_PATTERN = /\b(?:password|passphrase|passwd|pwd|credential|otp|totp|2fa|mfa)\b|\b(?:one[-_\s]?time|verification|authentication|auth|security)[-_\s]?(?:password|passcode|code)\b|\b(?:api[-_\s]?(?:key|token)|access[-_\s]?token|refresh[-_\s]?token|personal[-_\s]?access[-_\s]?token|bearer[-_\s]?token|client[-_\s]?secret|secret[-_\s]?(?:key|token)|token)\b|\b(?:credit[-_\s]?card|card[-_\s]?(?:number|no|holder|expiry|expiration|security|verification)|cc[-_\s]?(?:number|name|exp|csc)|cvv|cvc|csc)\b|密码|口令|验证码|动态码|一次性(?:密码|口令|验证码)|令牌|密钥|银行卡|卡号|持卡人|有效期|安全码|支付密码/i

export function projectBrowserObservedValue(
  input: BrowserFieldObservationInput,
): BrowserObservedValue {
  if (!isBrowserValueRole(input.role))
    return {}
  if (isSensitiveBrowserField(input)) {
    const value = input.hasValue ? readObservedValue(input.value) : undefined
    return {
      inputMode: 'human',
      valueState: input.hasValue && value !== '' ? 'redacted' : 'empty',
    }
  }
  if (!input.hasValue)
    return {}

  const value = readObservedValue(input.value)
  if (value === undefined)
    return {}
  if (value.length === 0)
    return { valueState: 'empty' }
  return {
    value: value.slice(0, 4_096),
    valueState: 'present',
  }
}

export function isBrowserValueRole(role: string): boolean {
  return VALUE_ROLES.has(role)
}

export function redactBrowserRuntimeUrl(rawUrl: string): string {
  if (rawUrl === 'about:blank')
    return rawUrl
  const url = new URL(rawUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Browser Runtime URL must use HTTP or HTTPS')
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.toString()
}

function isSensitiveBrowserField(input: BrowserFieldObservationInput): boolean {
  if (input.protectedField)
    return true
  const type = input.attributes?.get('type')?.trim().toLowerCase()
  if (type === 'password')
    return true

  const autocomplete = input.attributes?.get('autocomplete')
    ?.trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean) ?? []
  if (autocomplete.some(token => (
    token.startsWith('cc-') || SENSITIVE_AUTOCOMPLETE_TOKENS.has(token)
  ))) {
    return true
  }

  const metadata = [
    input.name,
    input.description,
    input.attributes?.get('name'),
    input.attributes?.get('id'),
    input.attributes?.get('label'),
    input.attributes?.get('aria-label'),
    input.attributes?.get('placeholder'),
  ].filter((value): value is string => Boolean(value)).join(' ').normalize('NFKC')
  return SENSITIVE_FIELD_PATTERN.test(metadata)
}

function readObservedValue(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  if (typeof value === 'boolean')
    return String(value)
  return undefined
}
