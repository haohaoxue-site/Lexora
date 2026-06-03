import type { FormItemRule } from 'element-plus'
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_REQUIRED_PATTERN,
} from '@haohaoxue/samepage-contracts/identity/constants'

const EMAIL_RE = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
const DISPLAY_NAME_MIN_LENGTH = 2
const DISPLAY_NAME_MAX_LENGTH = 50

type RuleValidator = NonNullable<FormItemRule['validator']>

function resolveTrimmedValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function createRequiredMessage(label: string) {
  return `请输入${label}`
}

export function isValidEmail(value: string) {
  const normalizedValue = resolveTrimmedValue(value)
  return Boolean(normalizedValue) && EMAIL_RE.test(normalizedValue)
}

export function isValidPassword(value: string) {
  return value.length >= AUTH_PASSWORD_MIN_LENGTH
    && value.length <= AUTH_PASSWORD_MAX_LENGTH
    && AUTH_PASSWORD_REQUIRED_PATTERN.test(value)
}

export function isValidDisplayName(value: string) {
  const normalizedValue = resolveTrimmedValue(value)
  return normalizedValue.length >= DISPLAY_NAME_MIN_LENGTH && normalizedValue.length <= DISPLAY_NAME_MAX_LENGTH
}

function createDisplayNameValidator(label: string): RuleValidator {
  return (_rule, value, callback) => {
    const normalizedValue = resolveTrimmedValue(value)

    if (!normalizedValue) {
      callback(new Error(createRequiredMessage(label)))
      return
    }

    if (normalizedValue.length < DISPLAY_NAME_MIN_LENGTH || normalizedValue.length > DISPLAY_NAME_MAX_LENGTH) {
      callback(new Error(`${label}长度需为 ${DISPLAY_NAME_MIN_LENGTH} - ${DISPLAY_NAME_MAX_LENGTH} 位`))
      return
    }

    callback()
  }
}

function createPasswordValidator(label: string): RuleValidator {
  return (_rule, value, callback) => {
    if (typeof value !== 'string' || !value.length) {
      callback()
      return
    }

    if (!isValidPassword(value)) {
      callback(new Error(`${label}需为 ${AUTH_PASSWORD_MIN_LENGTH} - ${AUTH_PASSWORD_MAX_LENGTH} 个字符，且包含大写字母、小写字母和数字`))
      return
    }

    callback()
  }
}

export function createEmailRules(label = '邮箱'): FormItemRule[] {
  return [
    {
      required: true,
      message: createRequiredMessage(label),
      transform: resolveTrimmedValue,
    },
    {
      pattern: EMAIL_RE,
      message: `请输入有效的${label}`,
      transform: resolveTrimmedValue,
    },
  ]
}

export function createPasswordRules(label = '密码'): FormItemRule[] {
  return [
    {
      required: true,
      message: createRequiredMessage(label),
    },
    {
      validator: createPasswordValidator(label),
    },
  ]
}

export function createDisplayNameRules(label = '显示名称'): FormItemRule[] {
  return [{
    required: true,
    validator: createDisplayNameValidator(label),
  }]
}

export function createConfirmPasswordRules(
  getSourcePassword: () => string,
  label = '确认密码',
  mismatchMessage = '两次输入的密码不一致',
): FormItemRule[] {
  return [
    {
      required: true,
      message: createRequiredMessage(label),
    },
    {
      validator: (_rule, value, callback) => {
        if (typeof value !== 'string' || !value.length || value === getSourcePassword()) {
          callback()
          return
        }

        callback(new Error(mismatchMessage))
      },
    },
  ]
}

export function createDifferentPasswordRule(
  getCurrentPassword: () => string,
  message = '新密码不能与当前密码相同',
): FormItemRule {
  return {
    validator: (_rule, value, callback) => {
      if (typeof value !== 'string' || !value.length) {
        callback()
        return
      }

      if (value === getCurrentPassword()) {
        callback(new Error(message))
        return
      }

      callback()
    },
  }
}
