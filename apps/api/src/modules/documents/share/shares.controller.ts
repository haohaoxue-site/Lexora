import type {
  DocumentCurrent,
  DocumentShareAccess,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply } from 'fastify'
import type { AuthUserContext } from '../../auth/auth.interface'
import { ResolveDocumentAssetsSchema } from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import { OptionalCurrentUser } from '../../../decorators/optional-current-user.decorator'
import { Public } from '../../../decorators/public.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentAssetsService } from '../asset/asset.service'
import { DocumentShareRecipientsService } from './share-recipients.service'

@Controller('document-shares')
export class DocumentSharesController {
  constructor(
    private readonly documentShareRecipientsService: DocumentShareRecipientsService,
    private readonly documentAssetsService: DocumentAssetsService,
  ) {}

  @Public()
  @Get(':shareId')
  async getShareAccess(
    @OptionalCurrentUser() authUser: AuthUserContext | null,
    @Param('shareId') shareId: string,
  ): Promise<DocumentShareAccess> {
    return this.documentShareRecipientsService.getShareAccess(authUser?.id ?? null, shareId)
  }

  @Public()
  @Post(':shareId/accept')
  async acceptShare(
    @OptionalCurrentUser() authUser: AuthUserContext | null,
    @Param('shareId') shareId: string,
  ): Promise<DocumentShareAccess> {
    return this.documentShareRecipientsService.acceptShare(requireAuthUser(authUser).id, shareId)
  }

  @Public()
  @Post(':shareId/decline')
  async declineShare(
    @OptionalCurrentUser() authUser: AuthUserContext | null,
    @Param('shareId') shareId: string,
  ): Promise<DocumentShareAccess> {
    return this.documentShareRecipientsService.declineShare(requireAuthUser(authUser).id, shareId)
  }

  @Public()
  @Get(':shareId/documents/:documentId')
  async getSharedDocumentCurrent(
    @OptionalCurrentUser() authUser: AuthUserContext | null,
    @Param('shareId') shareId: string,
    @Param('documentId') documentId: string,
  ): Promise<DocumentCurrent> {
    return this.documentShareRecipientsService.getSharedDocumentCurrent(authUser?.id ?? null, shareId, documentId)
  }

  @Public()
  @Post(':shareId/documents/:documentId/assets/resolve')
  async resolveSharedDocumentAssets(
    @OptionalCurrentUser() authUser: AuthUserContext | null,
    @Param('shareId') shareId: string,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(ResolveDocumentAssetsSchema)) payload: { assetIds: string[] },
  ) {
    return this.documentAssetsService.resolveSharedAssets({
      actorId: authUser?.id ?? null,
      shareId,
      documentId,
      assetIds: payload.assetIds,
    })
  }

  @Public()
  @Get(':shareId/documents/:documentId/assets/:assetId/content')
  async getSharedDocumentAssetContent(
    @Param('shareId') shareId: string,
    @Param('documentId') documentId: string,
    @Param('assetId') assetId: string,
    @Query('token') token: string,
    @Res() response: FastifyReply,
  ): Promise<FastifyReply> {
    const asset = await this.documentAssetsService.getSharedAssetContent({
      shareId,
      documentId,
      assetId,
      token,
    })

    response.header('cache-control', 'private, max-age=300')
    response.header('content-type', asset.contentType)

    if (asset.contentLength !== null) {
      response.header('content-length', String(asset.contentLength))
    }

    return response.send(asset.body)
  }
}

function requireAuthUser(authUser: AuthUserContext | null): AuthUserContext {
  if (!authUser) {
    throw new UnauthorizedException('请先登录后再处理该分享')
  }

  return authUser
}
