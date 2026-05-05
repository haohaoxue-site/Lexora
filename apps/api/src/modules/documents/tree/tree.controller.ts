import type {
  CreateDocumentRequest,
  CreateDocumentResponse,
  DocumentCurrent,
  DocumentRecent,
  DocumentTreeGroup,
  PatchDocumentMetaRequest,
} from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../../auth/auth.interface'
import { CreateDocumentSchema, PatchDocumentMetaSchema } from '@haohaoxue/samepage-contracts'
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentsService } from './tree.service'

@Controller('documents')
export class DocumentTreeController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  async createDocument(
    @CurrentUser() authUser: AuthUserContext,
    @Body(new ZodValidationPipe(CreateDocumentSchema)) payload: CreateDocumentRequest,
  ): Promise<CreateDocumentResponse> {
    return this.documentsService.createDocument(authUser.id, payload)
  }

  @Get()
  async getDocumentTree(
    @CurrentUser() authUser: AuthUserContext,
    @Query('workspaceId') workspaceId: string,
  ): Promise<DocumentTreeGroup[]> {
    if (!workspaceId?.trim()) {
      throw new BadRequestException('缺少 workspaceId')
    }

    return this.documentsService.getDocumentTree(authUser.id, workspaceId.trim())
  }

  @Get('recent')
  async getRecentDocuments(@CurrentUser() authUser: AuthUserContext): Promise<DocumentRecent[]> {
    return this.documentsService.getRecentDocuments(authUser.id)
  }

  @Patch(':id/meta')
  async patchDocumentMeta(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PatchDocumentMetaSchema)) payload: PatchDocumentMetaRequest,
  ): Promise<DocumentCurrent> {
    return this.documentsService.patchDocumentMeta(authUser.id, id, payload)
  }
}
