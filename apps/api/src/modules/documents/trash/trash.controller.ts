import type { DocumentTrashItem } from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../../auth/auth.interface'
import { BadRequestException, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { DocumentTrashService } from './trash.service'

@Controller('documents')
export class DocumentTrashController {
  constructor(private readonly documentTrashService: DocumentTrashService) {}

  @Get('trash')
  async getTrashDocuments(
    @CurrentUser() authUser: AuthUserContext,
    @Query('workspaceId') workspaceId: string,
  ): Promise<DocumentTrashItem[]> {
    if (!workspaceId?.trim()) {
      throw new BadRequestException('缺少 workspaceId')
    }

    return this.documentTrashService.getTrashDocuments(authUser.id, workspaceId.trim())
  }

  @Delete(':id')
  async deleteDocument(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<null> {
    await this.documentTrashService.deleteDocument(authUser.id, id)
    return null
  }

  @Post(':id/restore-from-trash')
  async restoreDocumentFromTrash(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<null> {
    await this.documentTrashService.restoreDocumentFromTrash(authUser.id, id)
    return null
  }

  @Delete(':id/permanent')
  async permanentlyDeleteDocument(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') id: string,
  ): Promise<null> {
    await this.documentTrashService.permanentlyDeleteDocument(authUser.id, id)
    return null
  }
}
