import type {
  DocumentCurrent,
  DocumentShareAccess,
  DocumentShareRecipientSummary,
  ResolveDocumentAssetsResponse,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUserContext } from '../../auth/auth.interface'
import { ResolveDocumentAssetsSchema } from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { Public } from '../../../decorators/public.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentAssetsService } from '../asset/asset.service'
import { DocumentShareRecipientsService } from './share-recipients.service'

@Controller('document-share-recipients')
export class DocumentShareRecipientsController {
  constructor(
    private readonly documentShareRecipientsService: DocumentShareRecipientsService,
    private readonly documentAssetsService: DocumentAssetsService,
  ) {}

  @Get('pending')
  async getPendingRecipients(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<DocumentShareRecipientSummary[]> {
    return this.documentShareRecipientsService.getPendingRecipients(authUser.id)
  }

  @Get('active')
  async getActiveRecipients(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<DocumentShareRecipientSummary[]> {
    return this.documentShareRecipientsService.getActiveRecipients(authUser.id)
  }

  @Get(':recipientId')
  async getRecipientAccess(
    @CurrentUser() authUser: AuthUserContext,
    @Param('recipientId') recipientId: string,
  ): Promise<DocumentShareAccess> {
    return this.documentShareRecipientsService.getRecipientAccess(authUser.id, recipientId)
  }

  @Post(':recipientId/accept')
  async acceptRecipientShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('recipientId') recipientId: string,
  ): Promise<DocumentShareAccess> {
    return this.documentShareRecipientsService.acceptRecipientShare(authUser.id, recipientId)
  }

  @Post(':recipientId/decline')
  async declineRecipientShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('recipientId') recipientId: string,
  ): Promise<DocumentShareAccess> {
    return this.documentShareRecipientsService.declineRecipientShare(authUser.id, recipientId)
  }

  @Post(':recipientId/exit')
  async exitRecipientShare(
    @CurrentUser() authUser: AuthUserContext,
    @Param('recipientId') recipientId: string,
  ): Promise<DocumentShareAccess> {
    return this.documentShareRecipientsService.exitRecipientShare(authUser.id, recipientId)
  }

  @Get(':recipientId/documents/:documentId')
  async getSharedRecipientDocumentCurrent(
    @CurrentUser() authUser: AuthUserContext,
    @Param('recipientId') recipientId: string,
    @Param('documentId') documentId: string,
  ): Promise<DocumentCurrent> {
    return this.documentShareRecipientsService.getSharedRecipientDocumentCurrent(authUser.id, recipientId, documentId)
  }

  @Post(':recipientId/documents/:documentId/assets/resolve')
  async resolveSharedRecipientDocumentAssets(
    @CurrentUser() authUser: AuthUserContext,
    @Param('recipientId') recipientId: string,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(ResolveDocumentAssetsSchema)) payload: { assetIds: string[] },
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<ResolveDocumentAssetsResponse> {
    const result = await this.documentAssetsService.resolveSharedRecipientAssets({
      actorId: authUser.id,
      recipientId,
      documentId,
      assetIds: payload.assetIds,
    })
    response.header('set-cookie', await this.documentAssetsService.buildAssetAccessCookie({
      kind: 'recipient',
      recipientId,
      documentId,
      actorId: authUser.id,
    }))
    return result
  }

  @Public()
  @Get(':recipientId/documents/:documentId/assets/:assetId/content')
  async getSharedRecipientDocumentAssetContent(
    @Param('recipientId') recipientId: string,
    @Param('documentId') documentId: string,
    @Param('assetId') assetId: string,
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
  ): Promise<FastifyReply> {
    const asset = await this.documentAssetsService.getSharedRecipientAssetContent({
      recipientId,
      documentId,
      assetId,
      cookieHeader: request.headers.cookie,
    })

    response.header('cache-control', 'private, max-age=300')
    response.header('content-type', asset.contentType)

    if (asset.contentLength !== null) {
      response.header('content-length', String(asset.contentLength))
    }

    return response.send(asset.body)
  }
}
