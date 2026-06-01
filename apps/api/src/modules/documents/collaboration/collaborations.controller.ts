import type {
  ConfirmDocumentCollaborationResolverEntryRequest,
  CreateDocumentCollaborationUserInviteRequest,
  DocumentCollaborationConsoleListResponse,
  DocumentCollaborationGrant,
  DocumentCollaborationJoinResponse,
  DocumentCollaborationOverview,
  DocumentCollaborationResolverPreview,
  DocumentCollaborationUserInvite,
  SetDocumentCollaborationUserGrantRequest,
  UpdateDocumentCollaborationGrantRequest,
  UpsertDocumentCollaborationLinkInviteRequest,
  UpsertDocumentCollaborationLinkInviteResponse,
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../../auth/auth.interface'
import {
  ConfirmDocumentCollaborationResolverEntrySchema,
  CreateDocumentCollaborationUserInviteSchema,
  SetDocumentCollaborationUserGrantSchema,
  UpdateDocumentCollaborationGrantSchema,
  UpsertDocumentCollaborationLinkInviteSchema,
} from '@haohaoxue/samepage-contracts'
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { OptionalCurrentUser } from '../../../decorators/optional-current-user.decorator'
import { Public } from '../../../decorators/public.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentCollaborationsService } from './collaborations.service'

@Controller('documents')
export class DocumentCollaborationsController {
  constructor(private readonly collaborationsService: DocumentCollaborationsService) {}

  @Get('collaborations')
  async listManagementRoots(
    @CurrentUser() authUser: AuthUserContext,
    @Query('workspaceId') workspaceId: string,
  ): Promise<DocumentCollaborationConsoleListResponse> {
    if (!workspaceId?.trim()) {
      throw new BadRequestException('缺少 workspaceId')
    }

    return this.collaborationsService.listManagementRoots(authUser.id, workspaceId.trim())
  }

  @Get(':documentId/collaborations')
  async getOverview(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
  ): Promise<DocumentCollaborationOverview> {
    return this.collaborationsService.getOverview(authUser.id, documentId)
  }

  @Post(':documentId/collaborations/invitations')
  async createInvitation(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(CreateDocumentCollaborationUserInviteSchema)) payload: CreateDocumentCollaborationUserInviteRequest,
  ): Promise<DocumentCollaborationUserInvite> {
    return this.collaborationsService.createInvitation(authUser.id, documentId, payload)
  }

  @Get(':documentId/collaborations/users/resolve')
  async resolveInvitee(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Query('userCode') userCode: string,
  ): Promise<UserCollabIdentity> {
    if (!userCode?.trim()) {
      throw new BadRequestException('缺少 userCode')
    }

    return this.collaborationsService.resolveInvitee(authUser.id, documentId, userCode)
  }

  @Put(':documentId/collaborations/link')
  async upsertLink(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(UpsertDocumentCollaborationLinkInviteSchema)) payload: UpsertDocumentCollaborationLinkInviteRequest,
  ): Promise<UpsertDocumentCollaborationLinkInviteResponse> {
    return this.collaborationsService.upsertLink(authUser.id, documentId, payload)
  }

  @Patch(':documentId/collaborations/grants/:grantId')
  async updateGrant(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Param('grantId') grantId: string,
    @Body(new ZodValidationPipe(UpdateDocumentCollaborationGrantSchema)) payload: UpdateDocumentCollaborationGrantRequest,
  ): Promise<DocumentCollaborationGrant> {
    return this.collaborationsService.updateGrant(authUser.id, documentId, grantId, payload)
  }

  @Put(':documentId/collaborations/users/:targetUserId/grant')
  async setUserGrant(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Param('targetUserId') targetUserId: string,
    @Body(new ZodValidationPipe(SetDocumentCollaborationUserGrantSchema)) payload: SetDocumentCollaborationUserGrantRequest,
  ): Promise<DocumentCollaborationGrant> {
    return this.collaborationsService.setUserGrant(authUser.id, documentId, targetUserId, payload)
  }

  @Delete(':documentId/collaborations/link')
  async disableLink(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
  ): Promise<null> {
    return this.collaborationsService.disableLink(authUser.id, documentId)
  }

  @Post(':documentId/collaborations/link/reset')
  async resetLink(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
  ): Promise<UpsertDocumentCollaborationLinkInviteResponse> {
    return this.collaborationsService.resetLink(authUser.id, documentId)
  }

  @Delete(':documentId/collaborations/grants/:grantId')
  async removeGrant(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Param('grantId') grantId: string,
  ): Promise<null> {
    return this.collaborationsService.removeGrant(authUser.id, documentId, grantId)
  }

  @Delete(':documentId/collaborations/invitations/:invitationId')
  async cancelInvitation(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<null> {
    return this.collaborationsService.cancelInvitation(authUser.id, documentId, invitationId)
  }

  @Post('collaborations/invitations/:invitationId/accept')
  async acceptInvitation(
    @CurrentUser() authUser: AuthUserContext,
    @Param('invitationId') invitationId: string,
  ): Promise<DocumentCollaborationGrant> {
    return this.collaborationsService.acceptInvitation(authUser.id, invitationId)
  }

  @Post('collaborations/invitations/:invitationId/decline')
  async declineInvitation(
    @CurrentUser() authUser: AuthUserContext,
    @Param('invitationId') invitationId: string,
  ): Promise<DocumentCollaborationUserInvite> {
    return this.collaborationsService.declineInvitation(authUser.id, invitationId)
  }
}

@Controller('r')
export class DocumentCollaborationResolverController {
  constructor(private readonly collaborationsService: DocumentCollaborationsService) {}

  @Public()
  @Get(':code')
  async resolveEntry(
    @OptionalCurrentUser() authUser: AuthUserContext | null,
    @Param('code') code: string,
  ): Promise<DocumentCollaborationResolverPreview> {
    return this.collaborationsService.resolveResolverEntry(code, authUser?.id ?? null)
  }

  @Post(':code/confirm')
  async confirmEntry(
    @CurrentUser() authUser: AuthUserContext,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(ConfirmDocumentCollaborationResolverEntrySchema))
    payload: ConfirmDocumentCollaborationResolverEntryRequest,
  ): Promise<DocumentCollaborationJoinResponse> {
    return this.collaborationsService.confirmResolverEntry(authUser.id, code, payload)
  }
}
