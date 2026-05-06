import type {
  GetSystemAdminAuditLogsQuery,
  GetSystemAdminUsersQuery,
  SystemAdminAuditTargetType,
  SystemAdminUserRoleFilter,
  SystemAdminUserStatus,
  UpdateSystemAdminUserStatusRequest,
  UpdateSystemAuthGovernanceRequest,
  UpdateSystemAuthInviteCodeRequest,
} from '@haohaoxue/samepage-contracts'
import {
  SYSTEM_ADMIN_AUDIT_TARGET_TYPE_VALUES,
  SYSTEM_ADMIN_USER_ROLE_FILTER_VALUES,
} from '@haohaoxue/samepage-contracts'
import { UserStatus } from '@prisma/client'
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { RequestPageParamsDto } from '../../dto/request-page-params.dto'

export class GetSystemAdminUsersQueryDto extends RequestPageParamsDto implements GetSystemAdminUsersQuery {
  @IsOptional()
  @MaxLength(120)
  keyword?: string

  @IsOptional()
  @IsEnum(UserStatus)
  status?: SystemAdminUserStatus

  @IsOptional()
  @IsIn(SYSTEM_ADMIN_USER_ROLE_FILTER_VALUES)
  role?: SystemAdminUserRoleFilter
}

export class GetSystemAdminAuditLogsQueryDto extends RequestPageParamsDto implements GetSystemAdminAuditLogsQuery {
  @IsOptional()
  @IsIn(SYSTEM_ADMIN_AUDIT_TARGET_TYPE_VALUES)
  targetType?: SystemAdminAuditTargetType
}

export class UpdateSystemAdminUserStatusDto implements UpdateSystemAdminUserStatusRequest {
  @IsEnum(UserStatus)
  status!: SystemAdminUserStatus
}

export class UpdateSystemAuthGovernanceDto implements UpdateSystemAuthGovernanceRequest {
  @IsOptional()
  @IsBoolean()
  allowGithubLogin?: boolean

  @IsOptional()
  @IsBoolean()
  allowLinuxDoLogin?: boolean

  @IsOptional()
  @IsBoolean()
  allowPasswordRegistration?: boolean

  @IsOptional()
  @IsBoolean()
  allowGithubRegistration?: boolean

  @IsOptional()
  @IsBoolean()
  allowLinuxDoRegistration?: boolean

  @IsOptional()
  @IsBoolean()
  requirePasswordInviteCode?: boolean

  @IsOptional()
  @IsBoolean()
  requireGithubInviteCode?: boolean

  @IsOptional()
  @IsBoolean()
  requireLinuxDoInviteCode?: boolean
}

export class UpdateSystemAuthInviteCodeDto implements UpdateSystemAuthInviteCodeRequest {
  @IsString()
  @MaxLength(120)
  inviteCode!: string
}
