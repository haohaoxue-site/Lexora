import type {
  PersonalWorkspaceSummary,
  TeamWorkspaceSummary,
  WorkspaceInviteSummary,
  WorkspaceMemberSummary,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUserContext } from '../auth/auth.interface'
import {
  PERMISSIONS,
} from '@haohaoxue/samepage-contracts'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common'
import { CurrentUser } from '../../decorators/current-user.decorator'
import { Public } from '../../decorators/public.decorator'
import { RequirePermissions } from '../../decorators/require-permissions.decorator'
import { getRequestFile } from '../../utils/request-file'
import { PersonalWorkspacesService } from './personal-workspaces.service'
import { TeamWorkspaceInvitesService } from './team-workspace-invites.service'
import { TeamWorkspaceMembersService } from './team-workspace-members.service'
import { TeamWorkspacesService } from './team-workspaces.service'
import {
  CreateTeamWorkspaceDto,
  CreateWorkspaceInviteDto,
  TransferTeamWorkspaceOwnershipDto,
} from './workspaces.dto'

@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly personalWorkspacesService: PersonalWorkspacesService,
    private readonly teamWorkspacesService: TeamWorkspacesService,
    private readonly teamWorkspaceMembersService: TeamWorkspaceMembersService,
    private readonly teamWorkspaceInvitesService: TeamWorkspaceInvitesService,
  ) {}

  @RequirePermissions(PERMISSIONS.WORKSPACE_READ_SELF)
  @Get('me/personal')
  async getPersonalWorkspace(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<PersonalWorkspaceSummary> {
    return this.personalWorkspacesService.getPersonalWorkspace(authUser.id)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_READ_SELF)
  @Get('me/teams')
  async listVisibleTeamWorkspaces(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<TeamWorkspaceSummary[]> {
    return this.teamWorkspaceMembersService.listVisibleTeamWorkspaces(authUser.id)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_READ_SELF)
  @Get(':workspaceId/members')
  async listTeamWorkspaceMembers(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceMemberSummary[]> {
    return this.teamWorkspaceMembersService.listTeamWorkspaceMembers(authUser.id, workspaceId)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_READ_SELF)
  @Get(':workspaceId/invites')
  async listPendingWorkspaceInvites(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceInviteSummary[]> {
    return this.teamWorkspaceInvitesService.listPendingWorkspaceInvites(authUser.id, workspaceId)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_CREATE_SELF)
  @Post()
  async createTeamWorkspace(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: CreateTeamWorkspaceDto,
  ): Promise<TeamWorkspaceSummary> {
    return this.teamWorkspacesService.createTeamWorkspace(authUser.id, payload)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Post(':workspaceId/ownership/transfer')
  async transferTeamWorkspaceOwnership(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
    @Body() payload: TransferTeamWorkspaceOwnershipDto,
  ): Promise<null> {
    return this.teamWorkspaceMembersService.transferTeamWorkspaceOwnership(
      authUser.id,
      workspaceId,
      payload.nextOwnerUserId,
    )
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Post(':workspaceId/leave')
  async leaveTeamWorkspace(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
  ): Promise<null> {
    return this.teamWorkspaceMembersService.leaveTeamWorkspace(authUser.id, workspaceId)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Post(':workspaceId/members/:memberUserId/remove')
  async removeTeamWorkspaceMember(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
    @Param('memberUserId') memberUserId: string,
  ): Promise<null> {
    return this.teamWorkspaceMembersService.removeTeamWorkspaceMember(authUser.id, workspaceId, memberUserId)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Post(':workspaceId/invites')
  async createWorkspaceInvite(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
    @Body() payload: CreateWorkspaceInviteDto,
  ): Promise<WorkspaceInviteSummary> {
    return this.teamWorkspaceInvitesService.createWorkspaceInvite(authUser.id, workspaceId, payload)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Post(':workspaceId/invites/:inviteId/cancel')
  async cancelWorkspaceInvite(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<WorkspaceInviteSummary> {
    return this.teamWorkspaceInvitesService.cancelWorkspaceInvite(authUser.id, workspaceId, inviteId)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Post('invites/:inviteId/accept')
  async acceptWorkspaceInvite(
    @CurrentUser() authUser: AuthUserContext,
    @Param('inviteId') inviteId: string,
  ): Promise<WorkspaceInviteSummary> {
    return this.teamWorkspaceInvitesService.acceptWorkspaceInvite(authUser.id, inviteId)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Post('invites/:inviteId/decline')
  async declineWorkspaceInvite(
    @CurrentUser() authUser: AuthUserContext,
    @Param('inviteId') inviteId: string,
  ): Promise<WorkspaceInviteSummary> {
    return this.teamWorkspaceInvitesService.declineWorkspaceInvite(authUser.id, inviteId)
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Put(':workspaceId/icon')
  async updateTeamWorkspaceIcon(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
    @Req() request: FastifyRequest,
  ): Promise<TeamWorkspaceSummary> {
    const file = await getRequestFile(request)

    if (!file) {
      throw new BadRequestException('请选择空间图标文件')
    }

    return this.teamWorkspacesService.updateTeamWorkspaceIcon(authUser.id, workspaceId, {
      fileName: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    })
  }

  @RequirePermissions(PERMISSIONS.WORKSPACE_UPDATE_SELF)
  @Delete(':workspaceId')
  async deleteWorkspace(
    @CurrentUser() authUser: AuthUserContext,
    @Param('workspaceId') workspaceId: string,
  ): Promise<null> {
    return this.teamWorkspacesService.deleteWorkspace(authUser.id, workspaceId)
  }

  @Public()
  @Get('icon/:id')
  async getWorkspaceIcon(
    @Param('id') workspaceId: string,
    @Res() response: FastifyReply,
  ): Promise<FastifyReply> {
    const icon = await this.teamWorkspacesService.getWorkspaceIcon(workspaceId)

    response.header('cache-control', 'public, max-age=300')
    response.header('content-type', icon.contentType)

    if (icon.contentLength !== null) {
      response.header('content-length', String(icon.contentLength))
    }

    return response.send(icon.body)
  }
}
