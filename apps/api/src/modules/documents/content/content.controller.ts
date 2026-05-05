import type {
  CreateDocumentVersionSnapshotRequest,
  CreateDocumentVersionSnapshotResponse,
  DocumentCurrent,
  DocumentVersionSnapshot,
  RestoreDocumentVersionSnapshotRequest,
  RestoreDocumentVersionSnapshotResponse,
} from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../../auth/auth.interface'
import {
  CreateDocumentVersionSnapshotSchema,
  RestoreDocumentVersionSnapshotSchema,
} from '@haohaoxue/samepage-contracts'
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentContentService } from './content.service'

@Controller('documents')
export class DocumentContentController {
  constructor(private readonly documentContentService: DocumentContentService) {}

  @Get(':id')
  async getDocumentCurrent(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Query('recordVisit') recordVisit: string | undefined,
  ): Promise<DocumentCurrent> {
    return this.documentContentService.getDocumentCurrent(authUser.id, id, {
      recordVisit: recordVisit === '1' || recordVisit === 'true',
    })
  }

  @Post(':id/version-snapshots')
  async createDocumentVersionSnapshot(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateDocumentVersionSnapshotSchema)) payload: CreateDocumentVersionSnapshotRequest,
  ): Promise<CreateDocumentVersionSnapshotResponse> {
    return this.documentContentService.createDocumentVersionSnapshot(authUser.id, id, payload)
  }

  @Get(':id/version-snapshots')
  async getDocumentVersionSnapshots(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<DocumentVersionSnapshot[]> {
    return this.documentContentService.getDocumentVersionSnapshots(authUser.id, id)
  }

  @Post(':id/restore-version')
  async restoreDocumentVersionSnapshot(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RestoreDocumentVersionSnapshotSchema)) payload: RestoreDocumentVersionSnapshotRequest,
  ): Promise<RestoreDocumentVersionSnapshotResponse> {
    return this.documentContentService.restoreDocumentVersionSnapshot(authUser.id, id, payload)
  }
}
