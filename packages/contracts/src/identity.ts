import { z } from 'zod'

export const USER_CODE_PREFIX = 'SP-'
export const USER_CODE_LENGTH = 7
export const USER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const USER_CODE_REGEX = /^SP-[2-9A-HJ-NP-Z]{7}$/i

export const AUTH_PASSWORD_MIN_LENGTH = 8
export const AUTH_PASSWORD_MAX_LENGTH = 30
export const AUTH_PASSWORD_REQUIRED_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

export const UserCodeSchema = z.string().regex(USER_CODE_REGEX)
export const UserEmailSchema = z.string().trim().email()
export const UserDisplayNameSchema = z.string().trim().min(2).max(50)
export const UserAvatarUrlValueSchema = z.string().trim().min(1)
const UserAvatarUrlSchema = UserAvatarUrlValueSchema.nullable()

export const UserAccountIdentitySchema = z.object({
  id: z.string().trim().min(1),
  email: UserEmailSchema.nullable(),
  displayName: UserDisplayNameSchema,
  avatarUrl: UserAvatarUrlSchema,
  userCode: UserCodeSchema,
}).strict()

export const AuditUserSummarySchema = UserAccountIdentitySchema.pick({
  id: true,
  displayName: true,
  avatarUrl: true,
})

export const UserCollabIdentitySchema = UserAccountIdentitySchema

export const AuthPasswordSchema = z.string()
  .min(AUTH_PASSWORD_MIN_LENGTH)
  .max(AUTH_PASSWORD_MAX_LENGTH)
  .regex(AUTH_PASSWORD_REQUIRED_PATTERN)
