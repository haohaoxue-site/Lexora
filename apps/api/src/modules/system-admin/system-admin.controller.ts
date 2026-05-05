import type {
  SystemAdminAuditLogListResponse,
  SystemAdminOverview,
  SystemAdminUserListResponse,
  SystemAuthGovernance,
  SystemEmailConfig,
  SystemEmailServiceStatus,
  TestSystemEmailConfigResponse,
  UpdateSystemAdminUserResponse,
} from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../auth/auth.interface'
import {
  PERMISSIONS,
} from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { CurrentUser } from '../../decorators/current-user.decorator'
import { PageQuery } from '../../decorators/page-query.decorator'
import { RequirePermissions } from '../../decorators/require-permissions.decorator'
import { RequestPageParamsDto } from '../../dto/request-page-params.dto'
import {
  TestSystemEmailConfigDto,
  UpdateSystemEmailConfigDto,
  UpdateSystemEmailServiceStatusDto,
} from '../system-email/system-email.dto'
import {
  GetSystemAdminAuditLogsQueryDto,
  GetSystemAdminUsersQueryDto,
  UpdateSystemAdminUserStatusDto,
  UpdateSystemAuthGovernanceDto,
} from './system-admin.dto'
import { SystemAdminService } from './system-admin.service'

@Controller('system-admin')
export class SystemAdminController {
  constructor(private readonly systemAdminService: SystemAdminService) {}

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_OVERVIEW_READ)
  @Get('overview')
  async getOverview(): Promise<SystemAdminOverview> {
    return this.systemAdminService.getOverview()
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_USER_LIST)
  @Get('users')
  async getUsers(
    @PageQuery() page: RequestPageParamsDto,
    @Query() query: GetSystemAdminUsersQueryDto,
  ): Promise<SystemAdminUserListResponse> {
    return this.systemAdminService.getUsers({
      ...page,
      ...query,
    })
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_USER_UPDATE_STATUS)
  @Patch('users/:id/status')
  async updateUserStatus(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') userId: string,
    @Body() payload: UpdateSystemAdminUserStatusDto,
  ): Promise<UpdateSystemAdminUserResponse> {
    return this.systemAdminService.updateUserStatus(authUser.id, userId, payload.status)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AUTH_GOVERNANCE_READ)
  @Get('auth-governance')
  async getAuthGovernance(): Promise<SystemAuthGovernance> {
    return this.systemAdminService.getAuthGovernance()
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AUTH_GOVERNANCE_UPDATE)
  @Put('auth-governance')
  async updateAuthGovernance(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: UpdateSystemAuthGovernanceDto,
  ): Promise<SystemAuthGovernance> {
    return this.systemAdminService.updateAuthGovernance(authUser.id, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_EMAIL_CONFIG_READ)
  @Get('email-config')
  async getEmailConfig(): Promise<SystemEmailConfig> {
    return this.systemAdminService.getEmailConfig()
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_EMAIL_CONFIG_READ)
  @Get('email-service')
  async getEmailServiceStatus(): Promise<SystemEmailServiceStatus> {
    return this.systemAdminService.getEmailServiceStatus()
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_EMAIL_CONFIG_UPDATE)
  @Put('email-config')
  async updateEmailConfig(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: UpdateSystemEmailConfigDto,
  ): Promise<SystemEmailConfig> {
    return this.systemAdminService.updateEmailConfig(authUser.id, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_EMAIL_CONFIG_UPDATE)
  @Patch('email-service')
  async updateEmailServiceStatus(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: UpdateSystemEmailServiceStatusDto,
  ): Promise<SystemEmailServiceStatus> {
    return this.systemAdminService.updateEmailServiceStatus(authUser.id, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_EMAIL_CONFIG_UPDATE)
  @Post('email-config/test')
  async testEmailConfig(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: TestSystemEmailConfigDto,
  ): Promise<TestSystemEmailConfigResponse> {
    return this.systemAdminService.testEmailConfig(authUser.id, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AUDIT_LOG_LIST)
  @Get('audit-logs')
  async getAuditLogs(
    @PageQuery() page: RequestPageParamsDto,
    @Query() query: GetSystemAdminAuditLogsQueryDto,
  ): Promise<SystemAdminAuditLogListResponse> {
    return this.systemAdminService.getAuditLogs({
      ...page,
      ...query,
    })
  }
}
