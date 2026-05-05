import type {
  ChangePasswordRequest,
  ExchangeCodeRequest,
  PasswordLoginRequest,
  PasswordRegisterRequest,
  RequestEmailVerificationRequest,
} from '@haohaoxue/samepage-contracts'
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_REQUIRED_PATTERN,
} from '@haohaoxue/samepage-contracts'
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

export class ExchangeCodeDto implements ExchangeCodeRequest {
  @IsString()
  @MinLength(20)
  code!: string
}

export class PasswordLoginDto implements PasswordLoginRequest {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_REQUIRED_PATTERN)
  password!: string
}

export class RequestEmailVerificationDto implements RequestEmailVerificationRequest {
  @IsEmail()
  email!: string
}

export class PasswordRegisterDto implements PasswordRegisterRequest {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName!: string

  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_REQUIRED_PATTERN)
  password!: string
}

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_REQUIRED_PATTERN)
  currentPassword!: string

  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_REQUIRED_PATTERN)
  newPassword!: string
}
