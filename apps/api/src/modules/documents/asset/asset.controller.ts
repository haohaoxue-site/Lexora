import type {
  CreateCollabTicketResponse,
  DocumentAsset,
  ResolveDocumentAssetsRequest,
  ResolveDocumentAssetsResponse,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUserContext } from '../../auth/auth.interface'
import { ResolveDocumentAssetsSchema } from '@haohaoxue/samepage-contracts'
import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { Public } from '../../../decorators/public.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { getRequestFile } from '../../../utils/request-file'
import { DocumentAssetsService } from './asset.service'
import { DocumentCollabTicketsService } from './collab-ticket.service'

@Controller('documents')
export class DocumentAssetController {
  constructor(
    private readonly documentAssetsService: DocumentAssetsService,
    private readonly documentCollabTicketsService: DocumentCollabTicketsService,
  ) {}

  @Post(':id/collab-ticket')
  async createDocumentCollabTicket(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<CreateCollabTicketResponse> {
    return this.documentCollabTicketsService.createDocumentCollabTicket(authUser.id, id)
  }

  @Post(':id/assets/images')
  async uploadDocumentImage(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<DocumentAsset> {
    const file = await getRequestFile(request)

    if (!file) {
      throw new BadRequestException('请选择图片文件')
    }

    return this.documentAssetsService.uploadImage({
      actorId: authUser.id,
      documentId: id,
      fileName: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    })
  }

  @Post(':id/assets/files')
  async uploadDocumentFile(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<DocumentAsset> {
    const file = await getRequestFile(request)

    if (!file) {
      throw new BadRequestException('请选择附件文件')
    }

    return this.documentAssetsService.uploadFile({
      actorId: authUser.id,
      documentId: id,
      fileName: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    })
  }

  @Post(':id/assets/resolve')
  async resolveDocumentAssets(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResolveDocumentAssetsSchema)) payload: ResolveDocumentAssetsRequest,
  ): Promise<ResolveDocumentAssetsResponse> {
    return this.documentAssetsService.resolveAssets({
      actorId: authUser.id,
      documentId: id,
      assetIds: payload.assetIds,
    })
  }

  @Public()
  @Get(':id/assets/:assetId/content')
  async getDocumentAssetContent(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Query('token') token: string,
    @Res() response: FastifyReply,
  ): Promise<FastifyReply> {
    const asset = await this.documentAssetsService.getAssetContent({
      documentId: id,
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
