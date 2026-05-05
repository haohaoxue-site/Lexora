import type { AuthProviderName } from '@haohaoxue/samepage-contracts'
import type {
  ChangePasswordRequest,
  ExchangeCodeRequest,
  LogoutResponse,
  PasswordLoginRequest,
  PasswordRegisterRequest,
  RequestEmailVerificationRequest,
  RequestEmailVerificationResponse,
  TokenExchangeResponse,
} from './typing'
import { SERVER_PATH } from '@haohaoxue/samepage-contracts'
import { axios } from '@/utils/axios'

export * from './typing'

export function buildOAuthStartUrl(provider: AuthProviderName) {
  return `${SERVER_PATH}/auth/oauth/${provider}/start`
}

export function exchangeAuthCode(data: ExchangeCodeRequest): Promise<TokenExchangeResponse> {
  return axios.request({
    method: 'post',
    url: '/auth/exchange-code',
    data,
    withCookieAuth: true,
  })
}

export function loginWithPassword(data: PasswordLoginRequest): Promise<TokenExchangeResponse> {
  return axios.request({
    method: 'post',
    url: '/auth/login/password',
    data,
    withCookieAuth: true,
  })
}

export function requestEmailVerification(
  data: RequestEmailVerificationRequest,
): Promise<RequestEmailVerificationResponse> {
  return axios.request({
    method: 'post',
    url: '/auth/verify-email/request',
    data,
  })
}

export function registerWithPassword(data: PasswordRegisterRequest): Promise<TokenExchangeResponse> {
  return axios.request({
    method: 'post',
    url: '/auth/register/password',
    data,
    withCookieAuth: true,
  })
}

export function refreshAccessToken(): Promise<TokenExchangeResponse> {
  return axios.request({
    method: 'post',
    url: '/auth/refresh',
    withCookieAuth: true,
  })
}

export function logoutAuthSession(): Promise<LogoutResponse> {
  return axios.request({
    method: 'post',
    url: '/auth/logout',
    withCookieAuth: true,
  })
}

export function changePassword(data: ChangePasswordRequest): Promise<TokenExchangeResponse> {
  return axios.request({
    method: 'post',
    url: '/auth/password/change',
    data,
    withCookieAuth: true,
  })
}
