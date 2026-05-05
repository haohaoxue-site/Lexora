import type {
  CreateDirectDocumentShareRequest,
  DocumentPublicShareInfo,
  DocumentShareRecipientSummary,
  SetDocumentLinkShareRequest,
} from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../../auth/auth.interface'
import {
  ConfirmDocumentShareInheritanceUnlinkSchema,
  CreateDirectDocumentShareSchema,
  SetDocumentLinkShareSchema,
} from '@haohaoxue/samepage-contracts'
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentSharesService } from './shares.service'

/**
 * 分享发起侧：在自己的文档上管理分享策略。
 * 接收侧由 DocumentSharesController(/document-shares) 与 DocumentShareRecipientsController(/document-share-recipients) 处理。
 */
@Controller('documents')
export class DocumentShareManagementController {
  constructor(private readonly documentSharesService: DocumentSharesService) {}

  @Get(':id/shares/public')
  async getPublicShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<DocumentPublicShareInfo> {
    return this.documentSharesService.getPublicShare(authUser.id, id)
  }

  @Post(':id/shares/public')
  async enablePublicShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SetDocumentLinkShareSchema)) payload: SetDocumentLinkShareRequest,
  ): Promise<DocumentPublicShareInfo> {
    return this.documentSharesService.enablePublicShare(authUser.id, id, payload)
  }

  @Delete(':id/shares/public')
  async revokePublicShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<null> {
    return this.documentSharesService.revokePublicShare(authUser.id, id)
  }

  @Get(':id/shares/direct')
  async getDirectShares(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<DocumentShareRecipientSummary[]> {
    return this.documentSharesService.getDirectShares(authUser.id, id)
  }

  @Post(':id/shares/direct')
  async createDirectShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateDirectDocumentShareSchema)) payload: CreateDirectDocumentShareRequest,
  ): Promise<DocumentShareRecipientSummary> {
    return this.documentSharesService.createDirectShare(authUser.id, id, payload)
  }

  @Delete(':id/shares/direct/:recipientId')
  async revokeDirectShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
  ): Promise<null> {
    return this.documentSharesService.revokeDirectShare(authUser.id, id, recipientId)
  }

  @Post(':id/shares/none')
  async setNoSharePolicy(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfirmDocumentShareInheritanceUnlinkSchema)) payload: { confirmUnlinkInheritance?: boolean },
  ): Promise<null> {
    return this.documentSharesService.setNoSharePolicy(authUser.id, id, payload)
  }

  @Delete(':id/shares/local-policy')
  async restoreInheritedSharePolicy(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<null> {
    return this.documentSharesService.restoreInheritedPolicy(authUser.id, id)
  }
}
